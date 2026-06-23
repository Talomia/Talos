import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useAnimate } from 'framer-motion';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts } from '~/lib/hooks';
import { useDocumentTitle } from '~/lib/hooks/useDocumentTitle';
import { useNotificationOnComplete } from '~/lib/hooks/useNotificationOnComplete';
import { downloadChatAsMarkdown } from '~/lib/export/chatToMarkdown';
import { description, useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { PROMPT_COOKIE_KEY } from '~/utils/constants';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import { ChatContextProvider, useChatContextValue } from '~/lib/contexts/ChatContext';
import Cookies from 'js-cookie';
import { useSettings } from '~/lib/hooks/useSettings';
import { useSearchParams } from '@remix-run/react';
import { createSampler } from '~/utils/sampler';
import { logStore } from '~/lib/stores/logs';
import { streamingState } from '~/lib/stores/streaming';
import { supabaseConnection } from '~/lib/stores/supabase';
import { defaultDesignScheme, type DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import { useMCPStore } from '~/lib/stores/mcp';
import { useChatModel } from '~/lib/hooks/useChatModel';
import { usePromptCache } from '~/lib/hooks/usePromptCache';
import { useChatErrors } from '~/lib/hooks/useChatErrors';
import { useSendMessage } from '~/lib/hooks/useSendMessage';

const logger = createScopedLogger('Chat');

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat } = useChatHistory();
  const title = useStore(description);
  useEffect(() => {
    workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id));
  }, [initialMessages]);

  return (
    <>
      {ready && (
        <ChatImpl
          description={title}
          initialMessages={initialMessages}
          exportChat={exportChat}
          storeMessageHistory={storeMessageHistory}
          importChat={importChat}
        />
      )}
    </>
  );
}

const processSampledMessages = createSampler(
  (options: {
    messages: Message[];
    initialMessages: Message[];
    isLoading: boolean;
    parseMessages: (messages: Message[], isLoading: boolean) => void;
    storeMessageHistory: (messages: Message[]) => Promise<void>;
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory } = options;
    parseMessages(messages, isLoading);

    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages).catch((error) => toast.error(error.message));
    }
  },
  50,
);

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
}

export const ChatImpl = memo(
  ({ description: _description, initialMessages, storeMessageHistory, importChat, exportChat }: ChatProps) => {
    useShortcuts();
    useDocumentTitle();
    useNotificationOnComplete();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [imageDataList, setImageDataList] = useState<string[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [fakeLoading, setFakeLoading] = useState(false);
    const files = useStore(workbenchStore.files);
    const [designScheme, setDesignScheme] = useState<DesignScheme>(defaultDesignScheme);
    const actionAlert = useStore(workbenchStore.alert);
    const deployAlert = useStore(workbenchStore.deployAlert);
    const supabaseConn = useStore(supabaseConnection);
    const selectedProject = supabaseConn.stats?.projects?.find(
      (project) => project.id === supabaseConn.selectedProjectId,
    );
    const supabaseAlert = useStore(workbenchStore.supabaseAlert);
    const { activeProviders, promptId, autoSelectTemplate, contextOptimizationEnabled } = useSettings();
    const { model, provider, handleModelChange, handleProviderChange } = useChatModel();
    const { showChat } = useStore(chatStore);
    const [animationScope, animate] = useAnimate();

    const [chatMode, setChatMode] = useState<'discuss' | 'build'>('build');
    const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
    const mcpSettings = useMCPStore((state) => state.settings);

    const {
      messages,
      isLoading,
      input,
      handleInputChange,
      setInput,
      stop,
      append,
      setMessages,
      reload,
      error,
      data: chatData,
      setData,
      addToolResult,
    } = useChat({
      api: '/api/chat',
      body: {
        files,
        promptId,
        contextOptimization: contextOptimizationEnabled,
        chatMode,
        designScheme,
        supabase: {
          isConnected: supabaseConn.isConnected,
          hasSelectedProject: !!selectedProject,
          credentials: {
            supabaseUrl: supabaseConn?.credentials?.supabaseUrl,
            anonKey: supabaseConn?.credentials?.anonKey,
          },
        },
        maxLLMSteps: mcpSettings.maxLLMSteps,
      },
      sendExtraMessageFields: true,
      onError: (e) => {
        setFakeLoading(false);
        handleError(e, 'chat');
      },
      onFinish: (message, response) => {
        const usage = response.usage;
        setData(undefined);

        if (usage) {
          logger.trace('Token usage:', usage);
          logStore.logProvider('Chat response completed', {
            component: 'Chat',
            action: 'response',
            model,
            provider: provider.name,
            usage,
            messageLength: message.content.length,
          });

          // Record usage for token cost tracking and budget alerts
          import('~/lib/stores/tokenCost').then(({ recordUsage }) => {
            recordUsage({
              provider: provider.name,
              model,
              inputTokens: usage.promptTokens ?? 0,
              outputTokens: usage.completionTokens ?? 0,
            });
          });
        }

        // Auto-commit context to ContextGraph (non-blocking)
        import('~/lib/stores/cortex').then(async ({ commitContext, cortexInitialized, initCortex }) => {
          // Auto-initialize cortex for new chats on first response
          if (!cortexInitialized.get()) {
            const { chatId: chatIdAtom } = await import('~/lib/persistence/useChatHistory');
            const id = chatIdAtom.get();

            if (id) {
              await initCortex(id).catch(() => {});
            }
          }

          if (!cortexInitialized.get()) {
            return;
          }

          const currentFiles = workbenchStore.files.get();
          const fileMap: Record<string, string> = {};

          for (const [path, file] of Object.entries(currentFiles)) {
            if (file?.type === 'file') {
              fileMap[path] = file.content ?? '';
            }
          }

          commitContext({
            messages: messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' })),
            files: fileMap,
            summary: `AI response: ${model} via ${provider.name}`,
            metadata: { model, provider: provider.name, usage },
          }).catch(() => {
            // ContextGraph commit is optional — don't break the chat flow
          });
        });

        logger.debug('Finished streaming');
      },
      initialMessages,
      initialInput: Cookies.get(PROMPT_COOKIE_KEY) || '',
    });

    const { llmErrorAlert, clearLlmErrorAlert, handleError } = useChatErrors({
      providerName: provider.name,
      stop,
      setFakeLoading,
      setData,
    });

    const hasAutoSentPrompt = useRef(false);

    useEffect(() => {
      const prompt = searchParams.get('prompt');

      if (prompt && !hasAutoSentPrompt.current) {
        hasAutoSentPrompt.current = true;
        setSearchParams({});
        runAnimation();
        append({
          role: 'user',
          content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${prompt}`,
        });
      }
    }, [model, provider, searchParams]);

    const { enhancingPrompt, enhancePrompt, resetEnhancer } = usePromptEnhancer();
    const { parsedMessages, parseMessages } = useMessageParser();

    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

    useEffect(() => {
      chatStore.setKey('started', initialMessages.length > 0);
    }, []);

    // Initialize ContextGraph when chat starts with existing messages
    useEffect(() => {
      if (initialMessages.length > 0) {
        import('~/lib/persistence/useChatHistory').then(({ chatId: chatIdAtom }) => {
          const id = chatIdAtom.get();

          if (id) {
            import('~/lib/stores/cortex').then(({ initCortex }) => {
              initCortex(id).catch(() => {
                // ContextGraph initialization is optional
              });
            });
          }
        });
      }
    }, []);

    useEffect(() => {
      processSampledMessages({
        messages,
        initialMessages,
        isLoading,
        parseMessages,
        storeMessageHistory,
      });

      return () => {
        processSampledMessages.cancel();
      };
    }, [messages, isLoading, parseMessages]);

    // Listen for markdown export from command palette
    useEffect(() => {
      const handleExportMarkdown = () => {
        if (messages.length === 0) {
          toast.info('No messages to export');

          return;
        }

        downloadChatAsMarkdown(messages, description.get());
        toast.success('Chat exported as Markdown');
      };

      window.addEventListener('talos:export-markdown', handleExportMarkdown);

      return () => window.removeEventListener('talos:export-markdown', handleExportMarkdown);
    }, [messages]);

    // Listen for manual context commit (Cmd+Shift+G)
    useEffect(() => {
      const handleCommitContext = () => {
        if (messages.length === 0) {
          return;
        }

        import('~/lib/stores/cortex').then(async ({ commitContext, cortexInitialized, initCortex }) => {
          if (!cortexInitialized.get()) {
            const { chatId: chatIdAtom } = await import('~/lib/persistence/useChatHistory');
            const id = chatIdAtom.get();

            if (id) {
              await initCortex(id).catch(() => {});
            }
          }

          if (!cortexInitialized.get()) {
            toast.info('No active context to commit');

            return;
          }

          const currentFiles = workbenchStore.files.get();
          const fileMap: Record<string, string> = {};

          for (const [path, file] of Object.entries(currentFiles)) {
            if (file?.type === 'file') {
              fileMap[path] = file.content ?? '';
            }
          }

          try {
            const nodeId = await commitContext({
              messages: messages.map((m) => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : '',
              })),
              files: fileMap,
              summary: 'Manual commit',
            });

            if (nodeId) {
              toast.success('Context committed');
            }
          } catch {
            toast.error('Failed to commit context');
          }
        });
      };

      window.addEventListener('talos:commit-context', handleCommitContext);

      return () => window.removeEventListener('talos:commit-context', handleCommitContext);
    }, [messages]);

    const scrollTextArea = () => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    };

    const abort = () => {
      stop();
      chatStore.setKey('aborted', true);
      workbenchStore.abortAllActions();

      logStore.logProvider('Chat response aborted', {
        component: 'Chat',
        action: 'abort',
        model,
        provider: provider.name,
      });
    };

    useEffect(() => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.style.height = 'auto';

        const scrollHeight = textarea.scrollHeight;

        textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
        textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
      }
    }, [input, textareaRef]);

    const runAnimation = async () => {
      if (chatStarted) {
        return;
      }

      await Promise.all([
        animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
        animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
      ]);

      chatStore.setKey('started', true);

      setChatStarted(true);
    };

    const { sendMessage } = useSendMessage({
      model,
      provider,
      input,
      chatStarted,
      isLoading,
      messages,
      error,
      autoSelectTemplate,
      uploadedFiles,
      imageDataList,
      selectedElement,
      textareaRef,
      append,
      reload,
      setMessages,
      setInput,
      setFakeLoading,
      setUploadedFiles,
      setImageDataList,
      resetEnhancer,
      abort,
      runAnimation,
    });

    /**
     * Handles the change event for the textarea and updates the input state.
     * @param event - The change event from the textarea.
     */
    const onTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleInputChange(event);
    };

    const { debouncedCachePrompt } = usePromptCache();

    const handleWebSearchResult = useCallback(
      (result: string) => {
        const currentInput = input || '';
        const newInput = currentInput.length > 0 ? `${result}\n\n${currentInput}` : result;

        // Update the input via the same mechanism as handleInputChange
        const syntheticEvent = {
          target: { value: newInput },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        handleInputChange(syntheticEvent);
      },
      [input, handleInputChange],
    );

    const mappedMessages = useMemo(
      () =>
        messages.map((message, i) => {
          if (message.role === 'user') {
            return message;
          }

          return {
            ...message,
            content: parsedMessages[i] !== undefined ? parsedMessages[i] : message.content,
          };
        }),
      [messages, parsedMessages],
    );

    const handleEnhancePrompt = useCallback(() => {
      enhancePrompt(
        input,
        (enhancedInput) => {
          setInput(enhancedInput);
          scrollTextArea();
        },
        model,
        provider,
      );
    }, [input, enhancePrompt, setInput, scrollTextArea, model, provider]);

    const combinedHandleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onTextareaChange(e);
        debouncedCachePrompt(e);
      },
      [onTextareaChange, debouncedCachePrompt],
    );

    const handleStreamingChange = useCallback((streaming: boolean) => {
      streamingState.set(streaming);
    }, []);

    const handleClearAlert = useCallback(() => workbenchStore.clearAlert(), []);
    const handleClearSupabaseAlert = useCallback(() => workbenchStore.clearSupabaseAlert(), []);
    const handleClearDeployAlert = useCallback(() => workbenchStore.clearDeployAlert(), []);

    const chatContextValue = useChatContextValue({
      chat: {
        messages: mappedMessages,
        input,
        chatStarted,
        isStreaming: isLoading || fakeLoading,
        data: chatData,
        enhancingPrompt,
      },
      model: {
        model,
        setModel: handleModelChange,
        provider,
        setProvider: handleProviderChange,
        providerList: activeProviders,
      },
      alerts: {
        actionAlert,
        clearAlert: handleClearAlert,
        supabaseAlert,
        clearSupabaseAlert: handleClearSupabaseAlert,
        deployAlert,
        clearDeployAlert: handleClearDeployAlert,
        llmErrorAlert,
        clearLlmErrorAlert,
      },
      files: {
        uploadedFiles,
        setUploadedFiles,
        imageDataList,
        setImageDataList,
      },
      actions: {
        sendMessage,
        handleStop: abort,
        handleInputChange: combinedHandleInputChange,
        enhancePrompt: handleEnhancePrompt,
        importChat,
        exportChat,
      },
      ui: {
        showChat,
        chatMode,
        setChatMode,
        designScheme,
        setDesignScheme,
        selectedElement,
        setSelectedElement,
        onStreamingChange: handleStreamingChange,
      },
      aiSdk: {
        append,
        addToolResult,
        onWebSearchResult: handleWebSearchResult,
      },
      refs: {
        textareaRef,
      },
    });

    return (
      <ChatContextProvider value={chatContextValue}>
        <BaseChat ref={animationScope} />
      </ChatContextProvider>
    );
  },
);
