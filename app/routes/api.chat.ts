import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { readVault } from '~/lib/.server/api-key-vault';
import { createUIMessageStream, createUIMessageStreamResponse, generateId, stepCountIs, type UIMessageChunk } from 'ai';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS, type FileMap } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/common/prompts/prompts';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';

import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import { getFilePaths, selectContext } from '~/lib/.server/llm/select-context';
import type { ContextAnnotation, ProgressAnnotation } from '~/types/context';
import { WORK_DIR } from '~/utils/constants';
import { createSummary } from '~/lib/.server/llm/create-summary';
import { extractPropertiesFromMessage } from '~/lib/.server/llm/utils';
import type { DesignScheme } from '~/types/design-scheme';
import { MCPService } from '~/lib/services/mcpService';
import { StreamRecoveryManager } from '~/lib/.server/llm/stream-recovery';
import { getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { CSS_CLASS_THOUGHT } from '~/lib/app-config';
import { generatePlan, planToPromptContext } from '~/lib/.server/llm/planning-agent';
import { TaskTracker } from '~/lib/.server/llm/task-tracker';

export async function action(args: ActionFunctionArgs) {
  return withSecurity(chatAction, { allowedMethods: ['POST'] })(args);
}

const logger = createScopedLogger('api.chat');

async function chatAction({ context, request }: ActionFunctionArgs) {
  // Abort controller for the LLM stream — allows recovery to abort a stalled request
  const streamAbortController = new AbortController();

  const streamRecovery = new StreamRecoveryManager({
    timeout: 45000,
    maxRetries: 2,
    onStallDetected: (attempt, isRecoverable) => {
      logger.warn(`Stream stall detected (attempt ${attempt}, recoverable: ${isRecoverable})`);
    },
    onRetry: async (attempt) => {
      logger.info(`Stream recovery attempt ${attempt} — aborting stalled stream`);

      // Abort the current stream so the provider connection is released
      streamAbortController.abort();
    },
    onRecovery: (attempt) => {
      logger.info(`Stream recovered after ${attempt} attempt(s)`);
    },
    onMaxRetriesReached: () => {
      logger.error('Stream stalled beyond recovery — aborting');
      streamAbortController.abort();
    },
  });

  let messages: Messages;
  let files: FileMap | undefined;
  let promptId: string | undefined;
  let contextOptimization: boolean;
  let supabase:
    | { isConnected: boolean; hasSelectedProject: boolean; credentials?: { anonKey?: string; supabaseUrl?: string } }
    | undefined;
  let chatMode: 'discuss' | 'build';
  let designScheme: DesignScheme | undefined;
  let maxLLMSteps: number;
  let customInstructions: string | undefined;

  try {
    ({
      messages,
      files,
      promptId,
      contextOptimization,
      supabase,
      chatMode,
      designScheme,
      maxLLMSteps,
      customInstructions,
    } = await request.json<{
      messages: Messages;
      files: FileMap | undefined;
      promptId?: string;
      contextOptimization: boolean;
      chatMode: 'discuss' | 'build';
      designScheme?: DesignScheme;
      supabase?: {
        isConnected: boolean;
        hasSelectedProject: boolean;
        credentials?: {
          anonKey?: string;
          supabaseUrl?: string;
        };
      };
      maxLLMSteps: number;
      customInstructions?: string;
    }>());
  } catch {
    return json({ error: true, message: 'Invalid or malformed JSON in request body' }, { status: 400 });
  }

  // Apply defaults for optional fields
  if (!chatMode) {
    chatMode = 'build';
  }

  if (typeof maxLLMSteps !== 'number' || maxLLMSteps <= 0) {
    maxLLMSteps = 3;
  }

  if (typeof contextOptimization !== 'boolean') {
    contextOptimization = true;
  }

  // Validate required fields
  if (!Array.isArray(messages) || messages.length < 1) {
    return json({ error: true, message: 'messages must be a non-empty array' }, { status: 400 });
  }

  if (chatMode !== 'discuss' && chatMode !== 'build') {
    return json({ error: true, message: "chatMode must be 'discuss' or 'build'" }, { status: 400 });
  }

  if (maxLLMSteps > 20) {
    return json({ error: true, message: 'maxLLMSteps must be ≤ 20' }, { status: 400 });
  }

  // Extract project-level rules from .rules file in the project
  const RULES_FILE_NAMES = ['.rules', '.projectrules'];
  let projectRules: string | undefined;

  if (files) {
    for (const rulesFile of RULES_FILE_NAMES) {
      const rulesPath = `/home/project/${rulesFile}`;
      const fileEntry = files[rulesPath];

      if (fileEntry && 'content' in fileEntry && typeof fileEntry.content === 'string' && fileEntry.content.trim()) {
        projectRules = fileEntry.content.trim().slice(0, 4000); // Cap at 4KB

        break;
      }
    }
  }

  const cookieHeader = request.headers.get('Cookie');

  // Read API keys from encrypted vault, with fallback to legacy plaintext cookie
  const env = (context?.cloudflare?.env as unknown as Record<string, string>) || {};
  const vault = await readVault(cookieHeader, env);
  const apiKeys = vault.apiKeys;
  const providerSettings: Record<string, IProviderSetting> = getProviderSettingsFromCookie(cookieHeader);

  let continuationCount = 0;

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
  };
  let progressCounter: number = 1;
  const stepTimers: Record<string, number> = {};

  try {
    const mcpService = MCPService.getInstance();
    logger.debug(`Chat request: ${messages.length} messages`);

    /*
     * 5-minute absolute timeout for LLM API calls.
     * Also reuses the streamAbortController so the StreamRecoveryManager
     * can abort stalled streams (it calls streamAbortController.abort()).
     */
    const timeoutMs = parseInt(process.env.CHAT_TIMEOUT_MS || '300000', 10); // default: 5 minutes
    const timeoutId = setTimeout(() => streamAbortController.abort(), timeoutMs);

    const dataStream = createUIMessageStream({
      async execute({ writer }) {
        const dataStream: any = {
          write(chunk: any) {
            writer.write(chunk);
          },
          writeData(value: any) {
            writer.write({
              type: 'message-metadata',
              messageMetadata: [value],
            });
          },
          writeMessageAnnotation(value: any) {
            writer.write({
              type: 'message-metadata',
              messageMetadata: [value],
            });
          },
          merge(stream: any) {
            writer.merge(stream);
          },
        };

        streamRecovery.startMonitoring();

        const filePaths = getFilePaths(files || {});
        let filteredFiles: FileMap | undefined = undefined;
        let summary: string | undefined = undefined;

        let processedMessages = await mcpService.processToolInvocations(messages, dataStream);

        /*
         * Fix 3: Message trimming for long conversations.
         *
         * Strategy: When the conversation exceeds 40 messages, we risk overflowing
         * the LLM's context window. To prevent this, we keep:
         *   1. System-role messages (prompts/instructions) — always retained
         *   2. Context annotation messages (role === 'data' or contain metadata) — always retained
         *   3. The last 20 user/assistant messages — preserves recent conversational context
         *
         * This ensures the model always has the system prompt and enough recent
         * context to produce coherent responses, without exceeding token limits.
         */
        const MAX_CONVERSATION_LENGTH = parseInt(process.env.CHAT_MAX_CONVERSATION_LENGTH || '40', 10);
        const RECENT_MESSAGES_TO_KEEP = parseInt(process.env.CHAT_RECENT_MESSAGES_TO_KEEP || '20', 10);

        if (processedMessages.length > MAX_CONVERSATION_LENGTH) {
          logger.info(
            `Trimming conversation from ${processedMessages.length} messages to avoid context window overflow`,
          );

          const systemMessages = processedMessages.filter((m) => m.role === 'system');
          const contextMessages = processedMessages.filter(
            (m) =>
              m.role === 'data' ||
              (m.role === 'assistant' && typeof m.content === 'string' && m.content.startsWith('{"type":"context')),
          );
          const conversationMessages = processedMessages.filter(
            (m) => m.role === 'user' || (m.role === 'assistant' && !contextMessages.includes(m)),
          );
          const recentConversation = conversationMessages.slice(-RECENT_MESSAGES_TO_KEEP);

          processedMessages = [...systemMessages, ...contextMessages, ...recentConversation];
          logger.info(`Trimmed to ${processedMessages.length} messages`);
        }

        if (filePaths.length > 0 && contextOptimization) {
          logger.debug('Generating Chat Summary');
          stepTimers.summary = Date.now();
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Analyzing your request…',
            icon: '\uD83D\uDD0D',
            startedAt: stepTimers.summary,
          } satisfies ProgressAnnotation);

          // Create a summary of the chat
          logger.debug(`Messages count: ${processedMessages.length}`);

          summary = await createSummary({
            messages: [...processedMessages],
            env: context.cloudflare?.env,
            apiKeys,
            providerSettings,
            promptId,
            contextOptimization,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('createSummary token usage', JSON.stringify(resp.usage));
                cumulativeUsage.completionTokens += resp.usage.outputTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.inputTokens || 0;
                cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
              }
            },
          });
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'complete',
            order: progressCounter++,
            message: 'Analysis complete',
            icon: '\uD83D\uDD0D',
            completedAt: Date.now(),
            duration: Date.now() - stepTimers.summary,
          } satisfies ProgressAnnotation);

          dataStream.writeMessageAnnotation({
            type: 'chatSummary',
            summary,
            chatId: processedMessages.slice(-1)?.[0]?.id,
          } as ContextAnnotation);

          // Update context buffer
          logger.debug('Updating Context Buffer');
          stepTimers.context = Date.now();
          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Finding relevant files…',
            icon: '\uD83D\uDCC1',
            startedAt: stepTimers.context,
          } satisfies ProgressAnnotation);

          // Select context files
          logger.debug(`Messages count: ${processedMessages.length}`);
          filteredFiles = await selectContext({
            messages: [...processedMessages],
            env: context.cloudflare?.env,
            apiKeys,
            files: files ?? ({} as FileMap),
            providerSettings,
            promptId,
            contextOptimization,
            summary,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('selectContext token usage', JSON.stringify(resp.usage));
                cumulativeUsage.completionTokens += resp.usage.outputTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.inputTokens || 0;
                cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
              }
            },
          });

          if (filteredFiles) {
            logger.debug(`files in context : ${JSON.stringify(Object.keys(filteredFiles))}`);
          }

          dataStream.writeMessageAnnotation({
            type: 'codeContext',
            files: Object.keys(filteredFiles).map((key) => {
              let path = key;

              if (path.startsWith(WORK_DIR)) {
                path = path.replace(WORK_DIR, '');
              }

              return path;
            }),
          } as ContextAnnotation);

          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'complete',
            order: progressCounter++,
            message: "I've identified the relevant files",
            icon: '\uD83D\uDCC1',
            completedAt: Date.now(),
            duration: Date.now() - stepTimers.context,
          } satisfies ProgressAnnotation);

          // logger.debug('Code Files Selected');
        }

        /*
         * ─── Planning Phase ──────────────────────────────────────
         * For build-mode requests, generate a structured implementation plan
         * before code generation. The plan guides the AI to think before coding.
         */
        let planContext = '';
        const taskTracker = new TaskTracker();

        if (chatMode === 'build' && filePaths.length > 0) {
          try {
            stepTimers.planning = Date.now();
            dataStream.writeData({
              type: 'progress',
              label: 'planning',
              status: 'in-progress',
              order: progressCounter++,
              message: 'Planning implementation…',
              icon: '\uD83D\uDCCB',
              startedAt: stepTimers.planning,
            } satisfies ProgressAnnotation);

            const planResult = await generatePlan({
              messages: [...processedMessages],
              files: files ?? ({} as FileMap),
              env: context.cloudflare?.env,
              apiKeys,
              providerSettings,
              summary,
              contextFiles: filteredFiles,
            });

            // Initialize task tracker from plan
            taskTracker.initFromPlan(planResult.plan.steps);

            // Convert plan to prompt context injection
            planContext = planToPromptContext(planResult.plan);

            // Track planning token usage
            cumulativeUsage.totalTokens += planResult.planningTokensUsed;

            dataStream.writeData({
              type: 'progress',
              label: 'planning',
              status: 'complete',
              order: progressCounter++,
              message: `Plan ready: ${planResult.plan.steps.length} steps`,
              icon: '\uD83D\uDCCB',
              completedAt: Date.now(),
              duration: Date.now() - stepTimers.planning,
            } satisfies ProgressAnnotation);

            logger.info(
              `Planning complete: ${planResult.plan.steps.length} steps, ${planResult.planningTokensUsed} tokens`,
            );
          } catch (planError) {
            logger.warn('Planning phase failed — proceeding without plan:', planError);
            dataStream.writeData({
              type: 'progress',
              label: 'planning',
              status: 'complete',
              order: progressCounter++,
              message: 'Planning skipped',
              icon: '\uD83D\uDCCB',
              completedAt: Date.now(),
              duration: Date.now() - (stepTimers.planning || Date.now()),
            } satisfies ProgressAnnotation);
          }
        }

        const options: StreamingOptions = {
          supabaseConnection: supabase,
          toolChoice: 'auto',
          tools: mcpService.toolsWithoutExecute,
          stopWhen: stepCountIs(maxLLMSteps),
          onStepFinish: ({ toolCalls }) => {
            // add tool call annotations for frontend processing
            toolCalls.forEach((toolCall) => {
              mcpService.processToolCall(toolCall as any, dataStream as any);
            });
          },
          onFinish: async ({ text: content, finishReason, usage }) => {
            logger.debug('usage', JSON.stringify(usage));

            if (usage) {
              cumulativeUsage.completionTokens += usage.outputTokens || 0;
              cumulativeUsage.promptTokens += usage.inputTokens || 0;
              cumulativeUsage.totalTokens += usage.totalTokens || 0;
            }

            if (finishReason !== 'length') {
              dataStream.writeMessageAnnotation({
                type: 'usage',
                value: {
                  completionTokens: cumulativeUsage.completionTokens,
                  promptTokens: cumulativeUsage.promptTokens,
                  totalTokens: cumulativeUsage.totalTokens,
                },
              });
              dataStream.writeData({
                type: 'progress',
                label: 'response',
                status: 'complete',
                order: progressCounter++,
                message: 'Done!',
                icon: '\u270D\uFE0F',
                completedAt: Date.now(),
                duration: Date.now() - stepTimers.response,
              } satisfies ProgressAnnotation);
              await new Promise((resolve) => setTimeout(resolve, 0));

              return;
            }

            continuationCount++;

            if (continuationCount >= MAX_RESPONSE_SEGMENTS) {
              throw Error('Cannot continue message: Maximum segments reached');
            }

            const switchesLeft = MAX_RESPONSE_SEGMENTS - continuationCount;

            logger.info(`Reached max token limit (${MAX_TOKENS}): Continuing message (${switchesLeft} switches left)`);

            // Sync task tracker with completed work from this segment
            if (taskTracker.getStats().total > 0) {
              // Extract file paths mentioned in the response (file_path attributes from boltAction tags)
              const filePathMatches = content.matchAll(/filePath="([^"]+)"/g);
              const createdFiles = [...filePathMatches].map((m) => m[1]);

              // Extract shell commands executed
              const commandMatches = content.matchAll(/<boltAction[^>]*type="shell"[^>]*>([\s\S]*?)<\/boltAction>/g);
              const executedCommands = [...commandMatches].map((m) => m[1].trim());

              taskTracker.syncWithActions(createdFiles, executedCommands);
              taskTracker.nextSegment();
              taskTracker.addTokensUsed(cumulativeUsage.totalTokens);

              const stats = taskTracker.getStats();
              logger.info(
                `Task progress: ${stats.completed}/${stats.total} (${stats.percentComplete}%) — segment ${stats.currentSegment}`,
              );
            }

            const lastUserMessage = processedMessages.filter((x) => x.role === 'user').slice(-1)[0];
            const { model, provider } = extractPropertiesFromMessage(lastUserMessage);
            processedMessages.push({ id: generateId(), role: 'assistant', content });
            processedMessages.push({
              id: generateId(),
              role: 'user',
              content: `[Model: ${model}]\n\n[Provider: ${provider}]\n\n${CONTINUE_PROMPT}${taskTracker.getStats().total > 0 ? '\n' + taskTracker.generateContinuationContext() : ''}`,
            });

            const result = await streamText({
              messages: [...processedMessages],
              env: context.cloudflare?.env,
              options: { ...options, abortSignal: streamAbortController.signal },
              apiKeys,
              files,
              providerSettings,
              promptId,
              contextOptimization,
              contextFiles: filteredFiles,
              chatMode,
              designScheme,
              summary,
              customInstructions,
              projectRules,
              planContext,
            });

            dataStream.merge(result.toUIMessageStream());

            (async () => {
              try {
                for await (const part of result.fullStream) {
                  if (part.type === 'error') {
                    const error = part.error as Error & { provider?: string };
                    logger.error(`Continuation stream error: ${error}`);
                    dataStream.writeMessageAnnotation({
                      type: 'error',
                      message: 'I ran into an error while continuing my response.',
                      provider: 'unknown',
                    });

                    return;
                  }
                }
              } catch (continuationError: unknown) {
                logger.error('Continuation stream consumption error:', continuationError);
                dataStream.writeMessageAnnotation({
                  type: 'error',
                  message: 'I ran into an error while continuing my response.',
                  provider: 'unknown',
                });
              }
            })();

            return;
          },
        };

        stepTimers.response = Date.now();
        dataStream.writeData({
          type: 'progress',
          label: 'response',
          status: 'in-progress',
          order: progressCounter++,
          message: 'Working on it\u2026',
          icon: '\u270D\uFE0F',
          startedAt: stepTimers.response,
        } satisfies ProgressAnnotation);

        const result = await streamText({
          messages: [...processedMessages],
          env: context.cloudflare?.env,
          options: { ...options, abortSignal: streamAbortController.signal },
          apiKeys,
          files,
          providerSettings,
          promptId,
          contextOptimization,
          contextFiles: filteredFiles,
          chatMode,
          designScheme,
          summary,
          customInstructions,
          projectRules,
          planContext,
        });

        (async () => {
          try {
            for await (const part of result.fullStream) {
              streamRecovery.updateActivity();

              if (part.type === 'error') {
                const error = part.error as Error & { provider?: string };
                logger.error('Streaming error:', error);
                streamRecovery.stop();

                // Fix 1: Emit well-formed JSON error annotations that the client can parse
                const errorMessage = error.message || 'An unexpected streaming error occurred';
                const errorProvider = error.provider || 'unknown';

                dataStream.writeMessageAnnotation({
                  type: 'error',
                  message: errorMessage.includes('Invalid JSON response')
                    ? 'I received an invalid response from the model. Try a different one or check your API key.'
                    : errorMessage.includes('token')
                      ? 'I hit the token limit. Try a model with a larger context window or start a new conversation.'
                      : errorMessage,
                  provider: errorProvider,
                });

                return;
              }
            }
            streamRecovery.stop();
          } catch (streamError: unknown) {
            streamRecovery.stop();

            // Fix 2: Catch timeout/abort errors and emit user-friendly message
            if (
              streamError instanceof Error &&
              (streamError.name === 'AbortError' || streamError.message?.includes('aborted'))
            ) {
              logger.error('LLM request timed out after 5 minutes');
              dataStream.writeMessageAnnotation({
                type: 'error',
                message: 'My request timed out after 5 minutes. The model may be overloaded — please try again.',
                provider: 'timeout',
              });
            } else {
              logger.error('Unexpected stream consumption error:', streamError);
              dataStream.writeMessageAnnotation({
                type: 'error',
                message:
                  streamError instanceof Error
                    ? streamError.message
                    : 'I encountered an unexpected error during streaming.',
                provider: 'unknown',
              });
            }
          } finally {
            clearTimeout(timeoutId);
          }
        })();
        dataStream.merge(result.toUIMessageStream());
      },
      onError: (error: unknown): string => {
        // Provide more specific error messages for common issues
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('model') && errorMessage.includes('not found')) {
          return 'Custom error: Invalid model selected. Please check that the model name is correct and available.';
        }

        if (errorMessage.includes('Invalid JSON response')) {
          return 'Custom error: The AI service returned an invalid response. This may be due to an invalid model name, API rate limiting, or server issues. Try selecting a different model or check your API key.';
        }

        if (
          errorMessage.includes('API key') ||
          errorMessage.includes('unauthorized') ||
          errorMessage.includes('authentication')
        ) {
          return 'Custom error: Invalid or missing API key. Please check your API key configuration.';
        }

        if (errorMessage.includes('token') && errorMessage.includes('limit')) {
          return 'Custom error: Token limit exceeded. The conversation is too long for the selected model. Try using a model with larger context window or start a new conversation.';
        }

        if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
          return 'Custom error: API rate limit exceeded. Please wait a moment before trying again.';
        }

        if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
          return 'Custom error: Network error. Please check your internet connection and try again.';
        }

        // In production, don't leak internal error details
        if (process.env.NODE_ENV === 'production') {
          return 'Custom error: An unexpected error occurred. Please try again or start a new conversation.';
        }

        return `Custom error: ${errorMessage}`;
      },
    });

    let isThinking = false;

    const transformedStream = dataStream.pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        transform(chunk, controller) {
          if (chunk.type === 'reasoning-start') {
            isThinking = true;
            controller.enqueue({
              type: 'text-start',
              id: chunk.id,
            });
            controller.enqueue({
              type: 'text-delta',
              id: chunk.id,
              delta: `<div class="${CSS_CLASS_THOUGHT}">\n`,
            });

            return;
          }

          if (chunk.type === 'reasoning-delta') {
            if (!isThinking) {
              isThinking = true;
              controller.enqueue({
                type: 'text-start',
                id: chunk.id,
              });
              controller.enqueue({
                type: 'text-delta',
                id: chunk.id,
                delta: `<div class="${CSS_CLASS_THOUGHT}">\n`,
              });
            }

            controller.enqueue({
              type: 'text-delta',
              id: chunk.id,
              delta: chunk.delta,
            });

            return;
          }

          if (chunk.type === 'reasoning-end') {
            if (isThinking) {
              controller.enqueue({
                type: 'text-delta',
                id: chunk.id,
                delta: '\n</div>\n',
              });
              controller.enqueue({
                type: 'text-end',
                id: chunk.id,
              });
              isThinking = false;
            }

            return;
          }

          // If we encounter a text chunk or tool chunk but we were still in thinking state, close it
          if (
            isThinking &&
            (chunk.type === 'text-start' ||
              chunk.type === 'text-delta' ||
              chunk.type === 'tool-input-available' ||
              chunk.type === 'finish')
          ) {
            controller.enqueue({
              type: 'text-delta',
              id: 'thinking-end',
              delta: '\n</div>\n',
            });
            controller.enqueue({
              type: 'text-end',
              id: 'thinking-end',
            });
            isThinking = false;
          }

          controller.enqueue(chunk);
        },
        flush(controller) {
          if (isThinking) {
            controller.enqueue({
              type: 'text-delta',
              id: 'thinking-end',
              delta: '\n</div>\n',
            });
            controller.enqueue({
              type: 'text-end',
              id: 'thinking-end',
            });
            isThinking = false;
          }
        },
      }),
    );

    return createUIMessageStreamResponse({
      stream: transformedStream,
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
        'Text-Encoding': 'chunked',
      },
    });
  } catch (error: unknown) {
    logger.error(error);

    const errObj = error instanceof Error ? error : new Error(String(error));
    const errMeta = error as Record<string, unknown>;

    const errorResponse = {
      error: true,
      message: errObj.message || 'An unexpected error occurred',
      statusCode: (errMeta.statusCode as number) || 500,
      isRetryable: errMeta.isRetryable !== false, // Default to retryable unless explicitly false
      provider: (errMeta.provider as string) || 'unknown',
    };

    if (errObj.message?.includes('API key')) {
      return json(
        {
          ...errorResponse,
          message: 'Invalid or missing API key',
          statusCode: 401,
          isRetryable: false,
        },
        { status: 401, statusText: 'Unauthorized' },
      );
    }

    return json(errorResponse, { status: errorResponse.statusCode, statusText: 'Error' });
  }
}
