import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { readVault } from '~/lib/.server/api-key-vault';
import { createDataStream, generateId } from 'ai';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS, type FileMap } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/common/prompts/prompts';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
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
import { parseCookies, getProviderSettingsFromCookie } from '~/lib/api/cookies';

export const action = withSecurity(chatAction, { allowedMethods: ['POST'] });

const logger = createScopedLogger('api.chat');

async function chatAction({ context, request }: ActionFunctionArgs) {
  const streamRecovery = new StreamRecoveryManager({
    timeout: 45000,
    maxRetries: 2,
    onTimeout: () => {
      logger.warn('Stream timeout - attempting recovery');
    },
    onMaxRetriesReached: () => {
      logger.error('Stream stalled beyond recovery — notifying client');
    },
  });

  let messages: Messages;
  let files: any;
  let promptId: string | undefined;
  let contextOptimization: boolean;
  let supabase:
    | { isConnected: boolean; hasSelectedProject: boolean; credentials?: { anonKey?: string; supabaseUrl?: string } }
    | undefined;
  let chatMode: 'discuss' | 'build';
  let designScheme: DesignScheme | undefined;
  let maxLLMSteps: number;

  try {
    ({ messages, files, promptId, contextOptimization, supabase, chatMode, designScheme, maxLLMSteps } =
      await request.json<{
        messages: Messages;
        files: any;
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
      }>());
  } catch {
    return new Response(JSON.stringify({ error: true, message: 'Invalid or malformed JSON in request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cookieHeader = request.headers.get('Cookie');

  // Read API keys from encrypted vault, with fallback to legacy plaintext cookie
  const env = (context?.cloudflare?.env as unknown as Record<string, string>) || {};
  const vault = await readVault(cookieHeader, env);
  const apiKeys = vault.apiKeys;
  const providerSettings: Record<string, IProviderSetting> = getProviderSettingsFromCookie(cookieHeader);

  const stream = new SwitchableStream();

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
  };
  const encoder: TextEncoder = new TextEncoder();
  let progressCounter: number = 1;

  try {
    const mcpService = MCPService.getInstance();
    const totalMessageContent = messages.map((message) => message.content).join(' ');
    logger.debug(`Total message length: ${totalMessageContent.split(' ').length}, words`);

    let lastChunk: string | undefined = undefined;

    // Fix 2: Create a 5-minute timeout signal for LLM API calls.
    // This prevents indefinite hangs when the provider is unresponsive.
    const timeoutMs = 300000; // 5 minutes
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    const dataStream = createDataStream({
      async execute(dataStream) {
        streamRecovery.startMonitoring();

        const filePaths = getFilePaths(files || {});
        let filteredFiles: FileMap | undefined = undefined;
        let summary: string | undefined = undefined;
        let messageSliceId = 0;

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
        const MAX_CONVERSATION_LENGTH = 40;
        const RECENT_MESSAGES_TO_KEEP = 20;

        if (processedMessages.length > MAX_CONVERSATION_LENGTH) {
          logger.info(
            `Trimming conversation from ${processedMessages.length} messages to avoid context window overflow`,
          );

          const systemMessages = processedMessages.filter((m) => m.role === 'system');
          const contextMessages = processedMessages.filter(
            (m) => m.role === 'data' || (m.role === 'assistant' && typeof m.content === 'string' && m.content.startsWith('{"type":"context')),
          );
          const conversationMessages = processedMessages.filter(
            (m) => m.role === 'user' || (m.role === 'assistant' && !contextMessages.includes(m)),
          );
          const recentConversation = conversationMessages.slice(-RECENT_MESSAGES_TO_KEEP);

          processedMessages = [...systemMessages, ...contextMessages, ...recentConversation];
          logger.info(`Trimmed to ${processedMessages.length} messages`);
        }

        if (processedMessages.length > 3) {
          messageSliceId = processedMessages.length - 3;
        }

        if (filePaths.length > 0 && contextOptimization) {
          logger.debug('Generating Chat Summary');
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Analysing Request',
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
                cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
              }
            },
          });
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'complete',
            order: progressCounter++,
            message: 'Analysis Complete',
          } satisfies ProgressAnnotation);

          dataStream.writeMessageAnnotation({
            type: 'chatSummary',
            summary,
            chatId: processedMessages.slice(-1)?.[0]?.id,
          } as ContextAnnotation);

          // Update context buffer
          logger.debug('Updating Context Buffer');
          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Determining Files to Read',
          } satisfies ProgressAnnotation);

          // Select context files
          logger.debug(`Messages count: ${processedMessages.length}`);
          filteredFiles = await selectContext({
            messages: [...processedMessages],
            env: context.cloudflare?.env,
            apiKeys,
            files,
            providerSettings,
            promptId,
            contextOptimization,
            summary,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('selectContext token usage', JSON.stringify(resp.usage));
                cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
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
            message: 'Code Files Selected',
          } satisfies ProgressAnnotation);

          // logger.debug('Code Files Selected');
        }

        const options: StreamingOptions = {
          supabaseConnection: supabase,
          toolChoice: 'auto',
          tools: mcpService.toolsWithoutExecute,
          maxSteps: maxLLMSteps,
          onStepFinish: ({ toolCalls }) => {
            // add tool call annotations for frontend processing
            toolCalls.forEach((toolCall) => {
              mcpService.processToolCall(toolCall, dataStream);
            });
          },
          onFinish: async ({ text: content, finishReason, usage }) => {
            logger.debug('usage', JSON.stringify(usage));

            if (usage) {
              cumulativeUsage.completionTokens += usage.completionTokens || 0;
              cumulativeUsage.promptTokens += usage.promptTokens || 0;
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
                message: 'Response Generated',
              } satisfies ProgressAnnotation);
              await new Promise((resolve) => setTimeout(resolve, 0));

              // stream.close();
              return;
            }

            if (stream.switches >= MAX_RESPONSE_SEGMENTS) {
              throw Error('Cannot continue message: Maximum segments reached');
            }

            const switchesLeft = MAX_RESPONSE_SEGMENTS - stream.switches;

            logger.info(`Reached max token limit (${MAX_TOKENS}): Continuing message (${switchesLeft} switches left)`);

            const lastUserMessage = processedMessages.filter((x) => x.role === 'user').slice(-1)[0];
            const { model, provider } = extractPropertiesFromMessage(lastUserMessage);
            processedMessages.push({ id: generateId(), role: 'assistant', content });
            processedMessages.push({
              id: generateId(),
              role: 'user',
              content: `[Model: ${model}]\n\n[Provider: ${provider}]\n\n${CONTINUE_PROMPT}`,
            });

            const result = await streamText({
              messages: [...processedMessages],
              env: context.cloudflare?.env,
              options: { ...options, abortSignal: abortController.signal },
              apiKeys,
              files,
              providerSettings,
              promptId,
              contextOptimization,
              contextFiles: filteredFiles,
              chatMode,
              designScheme,
              summary,
              messageSliceId,
            });

            result.mergeIntoDataStream(dataStream);

            (async () => {
              for await (const part of result.fullStream) {
                if (part.type === 'error') {
                  const error: any = part.error;
                  logger.error(`${error}`);

                  return;
                }
              }
            })();

            return;
          },
        };

        dataStream.writeData({
          type: 'progress',
          label: 'response',
          status: 'in-progress',
          order: progressCounter++,
          message: 'Generating Response',
        } satisfies ProgressAnnotation);

        const result = await streamText({
          messages: [...processedMessages],
          env: context.cloudflare?.env,
          options: { ...options, abortSignal: abortController.signal },
          apiKeys,
          files,
          providerSettings,
          promptId,
          contextOptimization,
          contextFiles: filteredFiles,
          chatMode,
          designScheme,
          summary,
          messageSliceId,
        });

        (async () => {
          try {
            for await (const part of result.fullStream) {
              streamRecovery.updateActivity();

              if (part.type === 'error') {
                const error: any = part.error;
                logger.error('Streaming error:', error);
                streamRecovery.stop();

                // Fix 1: Emit well-formed JSON error annotations that the client can parse
                const errorMessage = error.message || 'An unexpected streaming error occurred';
                const errorProvider = error.provider || 'unknown';

                dataStream.writeMessageAnnotation({
                  type: 'error',
                  message: errorMessage.includes('Invalid JSON response')
                    ? 'The AI service returned an invalid response. Try a different model or check your API key.'
                    : errorMessage.includes('token')
                      ? 'Token limit exceeded. Try a model with a larger context window or start a new conversation.'
                      : errorMessage,
                  provider: errorProvider,
                });

                return;
              }
            }
            streamRecovery.stop();
          } catch (streamError: any) {
            streamRecovery.stop();

            // Fix 2: Catch timeout/abort errors and emit user-friendly message
            if (streamError.name === 'AbortError' || streamError.message?.includes('aborted')) {
              logger.error('LLM request timed out after 5 minutes');
              dataStream.writeMessageAnnotation({
                type: 'error',
                message: 'The AI request timed out after 5 minutes. The model may be overloaded — please try again.',
                provider: 'timeout',
              });
            } else {
              logger.error('Unexpected stream consumption error:', streamError);
              dataStream.writeMessageAnnotation({
                type: 'error',
                message: streamError.message || 'An unexpected error occurred during streaming.',
                provider: 'unknown',
              });
            }
          } finally {
            clearTimeout(timeoutId);
          }
        })();
        result.mergeIntoDataStream(dataStream);
      },
      onError: (error: any) => {
        // Provide more specific error messages for common issues
        const errorMessage = error.message || 'Unknown error';

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

        return `Custom error: ${errorMessage}`;
      },
    }).pipeThrough(
      new TransformStream({
        transform: (chunk, controller) => {
          if (!lastChunk) {
            lastChunk = ' ';
          }

          if (typeof chunk === 'string') {
            if (chunk.startsWith('g') && !lastChunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "<div class=\\"__thought__\\">"\n`));
            }

            if (lastChunk.startsWith('g') && !chunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "</div>\\n"\n`));
            }
          }

          lastChunk = chunk;

          let transformedChunk = chunk;

          if (typeof chunk === 'string' && chunk.startsWith('g')) {
            let content = chunk.split(':').slice(1).join(':');

            if (content.endsWith('\n')) {
              content = content.slice(0, content.length - 1);
            }

            transformedChunk = `0:${content}\n`;
          }

          // Convert the string stream to a byte stream
          const str = typeof transformedChunk === 'string' ? transformedChunk : JSON.stringify(transformedChunk);
          controller.enqueue(encoder.encode(str));
        },
      }),
    );

    return new Response(dataStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
        'Text-Encoding': 'chunked',
      },
    });
  } catch (error: any) {
    logger.error(error);

    const errorResponse = {
      error: true,
      message: error.message || 'An unexpected error occurred',
      statusCode: error.statusCode || 500,
      isRetryable: error.isRetryable !== false, // Default to retryable unless explicitly false
      provider: error.provider || 'unknown',
    };

    if (error.message?.includes('API key')) {
      return new Response(
        JSON.stringify({
          ...errorResponse,
          message: 'Invalid or missing API key',
          statusCode: 401,
          isRetryable: false,
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
          statusText: 'Unauthorized',
        },
      );
    }

    return new Response(JSON.stringify({
      error: true,
      message: 'An unexpected error occurred',
      statusCode: 500,
      isRetryable: true,
      provider: 'unknown',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      statusText: 'Error',
    });
  }
}
