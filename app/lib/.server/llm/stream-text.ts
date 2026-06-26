import { convertToModelMessages, streamText as _streamText, type Message } from 'ai';
import { MAX_TOKENS, PROVIDER_COMPLETION_LIMITS, isReasoningModel, type FileMap } from './constants';
import { getSystemPrompt } from '~/lib/common/prompts/prompts';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODIFICATIONS_TAG_NAME, PROVIDER_LIST, WORK_DIR } from '~/utils/constants';
import type { IProviderSetting } from '~/types/model';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { allowedHTMLElements } from '~/utils/markdown';
import { LLMManager } from '~/lib/modules/llm/manager';
import { createScopedLogger } from '~/utils/logger';
import { createFilesContext, extractPropertiesFromMessage, simplifyActions } from './utils';
import { discussPrompt } from '~/lib/common/prompts/discuss-prompt';
import type { DesignScheme } from '~/types/design-scheme';
import { CSS_CLASS_THOUGHT, ACTION_TAG_OPEN, ACTION_TAG_CLOSE } from '~/lib/app-config';

export type Messages = Message[];

export interface StreamingOptions extends Omit<Parameters<typeof _streamText>[0], 'model'> {
  supabaseConnection?: {
    isConnected: boolean;
    hasSelectedProject: boolean;
    credentials?: {
      anonKey?: string;
      supabaseUrl?: string;
    };
  };
}

const logger = createScopedLogger('stream-text');

function getCompletionTokenLimit(modelDetails: any): number {
  // 1. If model specifies completion tokens, use that
  if (modelDetails.maxCompletionTokens && modelDetails.maxCompletionTokens > 0) {
    return modelDetails.maxCompletionTokens;
  }

  // 2. Use provider-specific default
  const providerDefault = PROVIDER_COMPLETION_LIMITS[modelDetails.provider];

  if (providerDefault) {
    return providerDefault;
  }

  // 3. Final fallback to MAX_TOKENS, but cap at reasonable limit for safety
  return Math.min(MAX_TOKENS, 16384);
}

function sanitizeText(text: string): string {
  let sanitized = text.replace(new RegExp(`<div class=\\"(?:${CSS_CLASS_THOUGHT})\\">.*?<\\/div>`, 'gs'), '');
  sanitized = sanitized.replace(/<think>.*?<\/think>/gs, '');
  sanitized = sanitized.replace(
    new RegExp(
      `(?:${ACTION_TAG_OPEN}) type="file" filePath="package-lock\\.json">[\\s\\S]*?(?:${ACTION_TAG_CLOSE})`,
      'g',
    ),
    '',
  );

  return sanitized.trim();
}

function truncateMessage(msg: Omit<Message, 'id'>, maxTokens: number): Omit<Message, 'id'> {
  const maxLength = maxTokens * 4;

  if (typeof msg.content === 'string') {
    if (msg.content.length > maxLength) {
      logger.warn(`Truncating message content from ${msg.content.length} to ${maxLength} characters`);

      const prefix = msg.content.slice(0, 2000);
      const suffix = msg.content.slice(-Math.max(1000, maxLength - 3000));

      return {
        ...msg,
        content: `${prefix}\n\n... [Content truncated due to context limit] ...\n\n${suffix}`,
      };
    }
  } else if (Array.isArray(msg.content as any)) {
    let currentLen = 0;
    const truncatedContent = (msg.content as any[]).map((part) => {
      if (part.type === 'text' && part.text) {
        if (currentLen + part.text.length > maxLength) {
          const allowed = Math.max(0, maxLength - currentLen);
          currentLen += allowed;

          const prefix = part.text.slice(0, Math.min(2000, allowed));
          const suffix = part.text.slice(-Math.max(1000, allowed - 3000));

          return {
            ...part,
            text: `${prefix}\n\n... [Content truncated due to context limit] ...\n\n${suffix}`,
          };
        }

        currentLen += part.text.length;
      }

      return part;
    });

    return {
      ...msg,
      content: truncatedContent,
    } as any;
  }

  return msg;
}

export async function streamText(props: {
  messages: Omit<Message, 'id'>[];
  env?: Env;
  options?: StreamingOptions;
  apiKeys?: Record<string, string>;
  files?: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  contextFiles?: FileMap;
  summary?: string;
  chatMode?: 'discuss' | 'build';
  designScheme?: DesignScheme;
  customInstructions?: string;
  projectRules?: string;
}) {
  const {
    messages,
    env: serverEnv,
    options,
    apiKeys,
    files,
    providerSettings,
    promptId,
    contextOptimization,
    contextFiles,
    summary,
    chatMode,
    designScheme,
    customInstructions,
    projectRules,
  } = props;
  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_PROVIDER.name;
  let processedMessages = messages.map((message) => {
    const newMessage = { ...message };

    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      currentModel = model;
      currentProvider = provider;
      newMessage.content = sanitizeText(typeof content === 'string' ? content : '');
    } else if (message.role === 'assistant') {
      newMessage.content = sanitizeText(typeof message.content === 'string' ? message.content : '');
    }

    // Sanitize all text parts in parts array, if present
    if (Array.isArray(message.parts)) {
      newMessage.parts = message.parts.map((part) =>
        part.type === 'text' ? { ...part, text: sanitizeText(part.text) } : part,
      );
    }

    return newMessage;
  });

  const provider = PROVIDER_LIST.find((p) => p.name === currentProvider) || DEFAULT_PROVIDER;
  const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(provider);
  let modelDetails = staticModels.find((m) => m.name === currentModel);

  if (!modelDetails) {
    const modelsList = [
      ...(provider.staticModels || []),
      ...(await LLMManager.getInstance().getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv,
      })),
    ];

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    modelDetails = modelsList.find((m) => m.name === currentModel);

    if (!modelDetails) {
      // Check if it's a Google provider and the model name looks like it might be incorrect
      if (provider.name === 'Google' && currentModel.includes('2.5')) {
        throw new Error(
          `Model "${currentModel}" not found. Gemini 2.5 Pro doesn't exist. Available Gemini models include: gemini-1.5-pro, gemini-2.0-flash, gemini-1.5-flash. Please select a valid model.`,
        );
      }

      // Fallback to first model with warning
      logger.warn(
        `MODEL [${currentModel}] not found in provider [${provider.name}]. Falling back to first model. ${modelsList[0].name}`,
      );
      modelDetails = modelsList[0];
    }
  }

  const dynamicMaxTokens = modelDetails ? getCompletionTokenLimit(modelDetails) : Math.min(MAX_TOKENS, 16384);

  // Use model-specific limits directly - no artificial cap needed
  const safeMaxTokens = dynamicMaxTokens;

  logger.info(
    `Token limits for model ${modelDetails.name}: maxTokens=${safeMaxTokens}, maxTokenAllowed=${modelDetails.maxTokenAllowed}, maxCompletionTokens=${modelDetails.maxCompletionTokens}`,
  );

  // ─── Token-Budgeted Context & History Pruning ────────────────
  const maxTokenAllowed = modelDetails?.maxTokenAllowed || 128000;
  const completionBudget = safeMaxTokens;
  const maxInputTokens = maxTokenAllowed - completionBudget;

  const estimateTokens = (text: string) => Math.ceil((text || '').length / 4);
  const estimateMessageTokens = (m: Omit<Message, 'id'>) => {
    let len = 0;

    if (typeof m.content === 'string') {
      len += m.content.length;
    } else if (Array.isArray(m.content)) {
      (m.content as any).forEach((part: any) => {
        if (part.type === 'text') {
          len += part.text?.length || 0;
        }
      });
    }

    return Math.ceil(len / 4);
  };

  // Simplify older assistant action blocks to save massive amount of tokens
  for (let i = 0; i < processedMessages.length - 1; i++) {
    const msg = processedMessages[i];

    if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        msg.content = simplifyActions(msg.content);
      } else if (Array.isArray(msg.content as any)) {
        msg.content = (msg.content as any[]).map((part) =>
          part.type === 'text' ? { ...part, text: simplifyActions(part.text) } : part,
        ) as any;
      }
    }
  }

  const baseSystemPrompt =
    PromptLibrary.getPromptFromLibrary(promptId || 'default', {
      cwd: WORK_DIR,
      allowedHtmlElements: allowedHTMLElements,
      modificationTagName: MODIFICATIONS_TAG_NAME,
      designScheme,
      supabase: {
        isConnected: options?.supabaseConnection?.isConnected || false,
        hasSelectedProject: options?.supabaseConnection?.hasSelectedProject || false,
        credentials: options?.supabaseConnection?.credentials || undefined,
      },
    }) ?? getSystemPrompt();

  const summaryPrompt = summary ? `Below is the chat history so far\nCHAT SUMMARY:\n---\n${summary}\n---\n` : '';
  const customInstructionsPrompt = customInstructions?.trim()
    ? `\n\n<custom_instructions>\nThe user has set the following custom instructions that MUST be followed:\n${customInstructions}\n</custom_instructions>`
    : '';
  const projectRulesPrompt = projectRules?.trim()
    ? `\n\n<project_rules>\nThe following project-level rules MUST be followed for this project:\n${projectRules.trim()}\n</project_rules>`
    : '';

  const fixedTokens =
    estimateTokens(baseSystemPrompt) +
    estimateTokens(summaryPrompt) +
    estimateTokens(customInstructionsPrompt) +
    estimateTokens(projectRulesPrompt);

  const availableTokens = Math.max(1000, maxInputTokens - fixedTokens - 500); // 500 safety buffer
  const HISTORY_BUDGET = Math.min(availableTokens * 0.4, 8000);

  const lastMessage = processedMessages[processedMessages.length - 1];
  const keptMessages: typeof processedMessages = [];
  let currentHistoryTokens = 0;

  let finalLastMessage = lastMessage;

  if (lastMessage) {
    const lastMsgTokens = estimateMessageTokens(lastMessage);

    if (lastMsgTokens > maxInputTokens - 1000) {
      // 1000 safety buffer
      logger.info(
        `Truncating last message as its size (${lastMsgTokens} tokens) exceeds maxInputTokens (${maxInputTokens})`,
      );
      finalLastMessage = truncateMessage(lastMessage, maxInputTokens - 1000) as any;
    }

    currentHistoryTokens = estimateMessageTokens(finalLastMessage);
  }

  for (let i = processedMessages.length - 2; i >= 0; i--) {
    const msg = processedMessages[i];
    const msgTokens = estimateMessageTokens(msg);

    if (currentHistoryTokens + msgTokens > HISTORY_BUDGET) {
      logger.info(
        `Context window limit: trimming message history at index ${i} to fit HISTORY_BUDGET (${HISTORY_BUDGET} tokens)`,
      );
      break;
    }

    keptMessages.unshift(msg);
    currentHistoryTokens += msgTokens;
  }

  if (finalLastMessage) {
    keptMessages.push(finalLastMessage);
  }

  processedMessages = keptMessages;

  const contextBudget = availableTokens - currentHistoryTokens;
  const prunedContextFiles: FileMap = {};
  let currentContextTokens = 0;

  if (contextFiles && chatMode === 'build' && contextOptimization) {
    for (const [path, fileEntry] of Object.entries(contextFiles)) {
      if (fileEntry && fileEntry.type === 'file') {
        const fileTokens = estimateTokens(fileEntry.content);

        if (currentContextTokens + fileTokens > contextBudget) {
          logger.info(`Context window limit: omitting file ${path} to fit contextBudget (${contextBudget} tokens)`);

          if (Object.keys(prunedContextFiles).length === 0) {
            const allowedLength = Math.max(100, contextBudget * 4);
            prunedContextFiles[path] = {
              ...fileEntry,
              content: fileEntry.content.slice(0, allowedLength) + '\n... [truncated to fit context window] ...',
            };
          }

          break;
        }

        prunedContextFiles[path] = fileEntry;
        currentContextTokens += fileTokens;
      }
    }
  }

  let systemPrompt = baseSystemPrompt;

  if (chatMode === 'build' && Object.keys(prunedContextFiles).length > 0) {
    const codeContext = createFilesContext(prunedContextFiles, true);
    systemPrompt = `${systemPrompt}

    Below is the artifact containing the context loaded into context buffer for you to have knowledge of and might need changes to fullfill current user request.
    CONTEXT BUFFER:
    ---
    ${codeContext}
    ---
    `;
  }

  if (summary) {
    systemPrompt = `${systemPrompt}\n\n${summaryPrompt}`;
  }

  const effectiveLockedFilePaths = new Set<string>();

  if (files) {
    for (const [filePath, fileDetails] of Object.entries(files)) {
      if (fileDetails?.isLocked) {
        effectiveLockedFilePaths.add(filePath);
      }
    }
  }

  if (effectiveLockedFilePaths.size > 0) {
    const lockedFilesListString = Array.from(effectiveLockedFilePaths)
      .map((filePath) => `- ${filePath}`)
      .join('\n');
    systemPrompt = `${systemPrompt}

    IMPORTANT: The following files are locked and MUST NOT be modified in any way. Do not suggest or make any changes to these files. You can proceed with the request but DO NOT make any changes to these files specifically:
    ${lockedFilesListString}
    ---
    `;
  } else {
    logger.debug('No locked files found from any source for prompt.');
  }

  if (customInstructions?.trim()) {
    systemPrompt += `\n\n<custom_instructions>\nThe user has set the following custom instructions that MUST be followed:\n${customInstructions}\n</custom_instructions>`;
  }

  // Inject project-level rules (.rules file)
  if (projectRules?.trim()) {
    systemPrompt = `${systemPrompt}\n\n<project_rules>\nThe following project-level rules MUST be followed for this project:\n${projectRules.trim()}\n</project_rules>`;
  }

  logger.info(`Sending llm call to ${provider.name} with model ${modelDetails.name}`);

  // Log reasoning model detection and token parameters
  const isReasoning = isReasoningModel(modelDetails.name);
  logger.info(
    `Model "${modelDetails.name}" is reasoning model: ${isReasoning}, using ${isReasoning ? 'maxCompletionTokens' : 'maxTokens'}: ${safeMaxTokens}`,
  );

  // Validate token limits before API call
  if (safeMaxTokens > (modelDetails.maxTokenAllowed || 128000)) {
    logger.warn(
      `Token limit warning: requesting ${safeMaxTokens} tokens but model supports max ${modelDetails.maxTokenAllowed || 128000}`,
    );
  }

  // Use maxCompletionTokens for reasoning models (o1, GPT-5), maxTokens for traditional models
  const tokenParams = isReasoning ? { maxCompletionTokens: safeMaxTokens } : { maxTokens: safeMaxTokens };

  // Filter out unsupported parameters for reasoning models
  const filteredOptions =
    isReasoning && options
      ? Object.fromEntries(
          Object.entries(options).filter(
            ([key]) =>
              ![
                'temperature',
                'topP',
                'presencePenalty',
                'frequencyPenalty',
                'logprobs',
                'topLogprobs',
                'logitBias',
              ].includes(key),
          ),
        )
      : options || {};

  const streamParams = {
    model: provider.getModelInstance({
      model: modelDetails.name,
      serverEnv,
      apiKeys,
      providerSettings,
    }),
    system: chatMode === 'build' ? systemPrompt : discussPrompt(),
    ...tokenParams,
    messages: await convertToModelMessages(
      processedMessages.map((m) => ({
        ...m,

        /*
         * v6 SDK's convertToModelMessages requires a `parts` array on every message.
         * Messages arriving from the compat layer may only have `content` (string).
         */
        parts: Array.isArray(m.parts)
          ? m.parts
          : [{ type: 'text' as const, text: typeof m.content === 'string' ? m.content : '' }],
      })) as any,
    ),
    ...filteredOptions,

    // Set temperature to 1 for reasoning models (required by OpenAI API)
    ...(isReasoning ? { temperature: 1 } : {}),
  };

  logger.trace(
    'Stream params:',
    Object.keys(streamParams).filter((key) => !['model', 'messages', 'system'].includes(key)),
  );

  return await _streamText(streamParams as any);
}
