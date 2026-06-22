import type { Message } from 'ai';
import React, { useEffect, useRef as useReactRef, useState } from 'react';
import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';
import { ClientOnly } from 'remix-utils/client-only';
import { Menu } from '~/components/sidebar/Menu.client';
import { Workbench } from '~/components/workbench/Workbench.client';
import { ErrorBoundary } from '~/components/ui/ErrorBoundary';
import { classNames } from '~/utils/classNames';

import { Messages } from './Messages.client';
import { getApiKeysFromCookies } from './APIKeyManager';
import Cookies from 'js-cookie';
import * as Tooltip from '@radix-ui/react-tooltip';
import styles from './BaseChat.module.scss';
import { ScreenshotProvider } from '~/lib/contexts/ScreenshotContext';
import { ImportButtons } from '~/components/chat/chatExportAndImport/ImportButtons';
import { ExamplePrompts } from '~/components/chat/ExamplePrompts';
import GitCloneButton from './GitCloneButton';

import StarterTemplates from './StarterTemplates';
import DeployChatAlert from '~/components/deploy/DeployAlert';
import ChatAlert from './ChatAlert';
import type { ModelInfo } from '~/lib/modules/llm/types';
import ProgressCompilation from './ProgressCompilation';
import type { ProgressAnnotation } from '~/types/context';
import { SupabaseChatAlert } from '~/components/chat/SupabaseAlert';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';
import { useStore } from '@nanostores/react';
import { StickToBottom, useStickToBottomContext } from '~/lib/hooks';
import { ChatBox } from './ChatBox';
import LlmErrorAlert from './LlmErrorAlert';
import { useChatContext } from '~/lib/contexts/ChatContext';

const logger = createScopedLogger('BaseChat');

const TEXTAREA_MIN_HEIGHT = 76;

export const BaseChat = React.forwardRef<HTMLDivElement>((_, ref) => {
  const {
    chat: { messages, chatStarted, isStreaming, data },
    model: { model, provider, providerList },
    alerts: {
      actionAlert,
      clearAlert,
      deployAlert,
      clearDeployAlert,
      supabaseAlert,
      clearSupabaseAlert,
      llmErrorAlert,
      clearLlmErrorAlert,
    },
    files: { uploadedFiles, setUploadedFiles, imageDataList, setImageDataList },
    actions: { sendMessage, handleStop, handleInputChange, importChat },
    ui: { showChat, chatMode, setChatMode, setSelectedElement, onStreamingChange },
    aiSdk: { append, addToolResult },
  } = useChatContext();

  const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(getApiKeysFromCookies());
  const [modelList, setModelList] = useState<ModelInfo[]>([]);
  const [isModelSettingsCollapsed, setIsModelSettingsCollapsed] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const [, setTranscript] = useState('');
  const [isModelLoading, setIsModelLoading] = useState<string | undefined>('all');
  const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([]);
  const expoUrl = useStore(expoUrlAtom);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  useEffect(() => {
    if (expoUrl) {
      setQrModalOpen(true);
    }
  }, [expoUrl]);

  useEffect(() => {
    if (data) {
      const progressList = data.filter(
        (x) => typeof x === 'object' && (x as Record<string, unknown>).type === 'progress',
      ) as ProgressAnnotation[];
      setProgressAnnotations(progressList);
    }
  }, [data]);

  useEffect(() => {
    onStreamingChange?.(isStreaming);
  }, [isStreaming, onStreamingChange]);

  // Use a ref to always call the latest handleInputChange from SpeechRecognition
  const handleInputChangeRef = useReactRef(handleInputChange);

  useEffect(() => {
    handleInputChangeRef.current = handleInputChange;
  }, [handleInputChange]);

  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0])
          .map((result) => result.transcript)
          .join('');

        setTranscript(transcript);

        if (handleInputChangeRef.current) {
          const syntheticEvent = {
            target: { value: transcript },
          } as React.ChangeEvent<HTMLTextAreaElement>;
          handleInputChangeRef.current(syntheticEvent);
        }
      };

      recognition.onerror = (event) => {
        logger.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      // M2 fix: Browser may stop recognition due to silence/timeout without
      // firing onerror. onend fires whenever recognition stops for any reason,
      // ensuring isListening is always reset.
      recognition.onend = () => {
        setIsListening(false);
      };

      setRecognition(recognition);

      // Cleanup: stop recognition and release handlers on unmount
      return () => {
        try {
          recognition.abort();
        } catch {
          // Ignore errors during abort (e.g., if not started)
        }

        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
      };
    }

    return undefined;
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      let parsedApiKeys: Record<string, string> | undefined = {};

      try {
        parsedApiKeys = getApiKeysFromCookies();
        setApiKeys(parsedApiKeys);
      } catch (error) {
        logger.error('Error loading API keys from cookies:', error);
        Cookies.remove('apiKeys');
      }

      setIsModelLoading('all');
      fetch('/api/models')
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
          }

          return response.json();
        })
        .then((data) => {
          const typedData = data as { modelList: ModelInfo[] };
          setModelList(typedData.modelList);
        })
        .catch((error) => {
          logger.error('Error fetching model list:', error);
        })
        .finally(() => {
          setIsModelLoading(undefined);
        });
    }
  }, [providerList, provider]);

  const onApiKeysChange = async (providerName: string, apiKey: string) => {
    const newApiKeys = { ...apiKeys, [providerName]: apiKey };
    setApiKeys(newApiKeys);

    // Store key in encrypted vault instead of plaintext cookie
    try {
      await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerName, apiKey }),
      });
    } catch (error) {
      logger.error('Failed to save API key to vault:', error);
    }

    // Clean up legacy plaintext cookie
    Cookies.remove('apiKeys');

    setIsModelLoading(providerName);

    let providerModels: ModelInfo[] = [];

    try {
      const response = await fetch(`/api/models/${encodeURIComponent(providerName)}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      providerModels = (data as { modelList: ModelInfo[] }).modelList;
    } catch (error) {
      logger.error('Error loading dynamic models for:', providerName, error);
    }

    // Only update models for the specific provider
    setModelList((prevModels) => {
      const otherModels = prevModels.filter((model) => model.provider !== providerName);
      return [...otherModels, ...providerModels];
    });
    setIsModelLoading(undefined);
  };

  const startListening = () => {
    if (recognition) {
      recognition.start();
      setIsListening(true);
    }
  };

  const stopListening = () => {
    if (recognition) {
      recognition.stop();
      setIsListening(false);
    }
  };

  const handleSendMessage = (event: React.UIEvent, messageInput?: string) => {
    if (sendMessage) {
      sendMessage(event, messageInput);
      setSelectedElement?.(null);

      if (recognition) {
        recognition.abort(); // Stop current recognition
        setTranscript(''); // Clear transcript
        setIsListening(false);

        // Clear the input by triggering handleInputChange with empty value
        if (handleInputChange) {
          const syntheticEvent = {
            target: { value: '' },
          } as React.ChangeEvent<HTMLTextAreaElement>;
          handleInputChange(syntheticEvent);
        }
      }
    }
  };

  const handleFileUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    const cleanup = () => {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];

      if (file) {
        // Validate file size (5MB max)
        const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

        if (file.size > MAX_IMAGE_SIZE) {
          toast.error(`Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 5MB.`);
          cleanup();

          return;
        }

        const reader = new FileReader();

        reader.onload = (e) => {
          const base64Image = e.target?.result as string;
          setUploadedFiles?.((prev: File[]) => [...prev, file]);
          setImageDataList?.((prev: string[]) => [...prev, base64Image]);
        };

        reader.onerror = () => {
          logger.error('Failed to read uploaded file:', file.name, reader.error);
          toast.error(`Failed to read file "${file.name}". Please try again.`);
        };

        reader.readAsDataURL(file);
      }

      cleanup();
    };

    document.body.appendChild(input);
    input.click();

    // Clean up if user cancels the file picker (onchange never fires)
    // When the window regains focus after the picker closes, remove if still present
    const handleFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) {
          cleanup();
        }
      }, 300);
      window.removeEventListener('focus', handleFocus);
    };
    window.addEventListener('focus', handleFocus);
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;

    if (!items) {
      return;
    }

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();

        const file = item.getAsFile();

        if (file) {
          // Validate file size (5MB max)
          const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

          if (file.size > MAX_IMAGE_SIZE) {
            toast.error(`Pasted image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 5MB.`);
            break;
          }

          const reader = new FileReader();

          reader.onload = (e) => {
            const base64Image = e.target?.result as string;
            setUploadedFiles?.((prev: File[]) => [...prev, file]);
            setImageDataList?.((prev: string[]) => [...prev, base64Image]);
          };

          reader.onerror = () => {
            logger.error('Failed to read pasted image:', reader.error);
            toast.error('Failed to read pasted image. Please try again.');
          };

          reader.readAsDataURL(file);
        }

        break;
      }
    }
  };

  const baseChat = (
    <div
      ref={ref}
      className={classNames(styles.BaseChat, 'relative flex h-full w-full overflow-hidden')}
      data-chat-visible={showChat}
    >
      <ClientOnly>{() => <ErrorBoundary panelName="the sidebar"><Menu /></ErrorBoundary>}</ClientOnly>
      <ScreenshotProvider
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        imageDataList={imageDataList}
        setImageDataList={setImageDataList}
      >
        <div className="flex flex-col lg:flex-row overflow-y-auto w-full h-full">
          <div className={classNames(styles.Chat, 'flex flex-col flex-grow lg:min-w-[var(--chat-min-width)] h-full')}>
            {!chatStarted && (
              <div id="intro" className="mt-[16vh] max-w-2xl mx-auto text-center px-4 lg:px-0">
                <h1 className="text-3xl lg:text-6xl font-bold text-ui-textPrimary mb-4 animate-fade-in">
                  Where ideas begin
                </h1>
                <p className="text-md lg:text-xl mb-8 text-ui-textSecondary animate-fade-in animation-delay-200">
                  Bring ideas to life in seconds or get help on existing projects.
                </p>
              </div>
            )}
            <StickToBottom
              className={classNames('pt-6 px-2 sm:px-6 relative', {
                'h-full flex flex-col modern-scrollbar': chatStarted,
              })}
              resize="smooth"
              initial="smooth"
            >
              <StickToBottom.Content className="flex flex-col gap-4 relative ">
                <ClientOnly>
                  {() => {
                    return chatStarted ? (
                      <Messages
                        className="flex flex-col w-full flex-1 max-w-chat pb-4 mx-auto z-1"
                        messages={messages}
                        isStreaming={isStreaming}
                        append={append as ((message: Message) => void) | undefined}
                        chatMode={chatMode}
                        setChatMode={setChatMode}
                        provider={provider}
                        model={model}
                        addToolResult={addToolResult}
                      />
                    ) : null;
                  }}
                </ClientOnly>
                <ScrollToBottom />
              </StickToBottom.Content>
              <div
                className={classNames('my-auto flex flex-col gap-2 w-full max-w-chat mx-auto z-prompt mb-6', {
                  'sticky bottom-2': chatStarted,
                })}
              >
                <div className="flex flex-col gap-2">
                  {deployAlert && (
                    <DeployChatAlert
                      alert={deployAlert}
                      clearAlert={() => clearDeployAlert?.()}
                      postMessage={(message: string | undefined) => {
                        sendMessage?.({} as React.UIEvent, message);
                        clearSupabaseAlert?.();
                      }}
                    />
                  )}
                  {supabaseAlert && (
                    <SupabaseChatAlert
                      alert={supabaseAlert}
                      clearAlert={() => clearSupabaseAlert?.()}
                      postMessage={(message) => {
                        sendMessage?.({} as React.UIEvent, message);
                        clearSupabaseAlert?.();
                      }}
                    />
                  )}
                  {actionAlert && (
                    <ChatAlert
                      alert={actionAlert}
                      clearAlert={() => clearAlert?.()}
                      postMessage={(message) => {
                        sendMessage?.({} as React.UIEvent, message);
                        clearAlert?.();
                      }}
                    />
                  )}
                  {llmErrorAlert && <LlmErrorAlert alert={llmErrorAlert} clearAlert={() => clearLlmErrorAlert?.()} />}
                </div>
                {progressAnnotations && <ProgressCompilation data={progressAnnotations} />}
                <ChatBox
                  isModelSettingsCollapsed={isModelSettingsCollapsed}
                  setIsModelSettingsCollapsed={setIsModelSettingsCollapsed}
                  modelList={modelList}
                  apiKeys={apiKeys}
                  isModelLoading={isModelLoading}
                  onApiKeysChange={onApiKeysChange}
                  handlePaste={handlePaste}
                  TEXTAREA_MIN_HEIGHT={TEXTAREA_MIN_HEIGHT}
                  TEXTAREA_MAX_HEIGHT={TEXTAREA_MAX_HEIGHT}
                  handleSendMessage={handleSendMessage}
                  isListening={isListening}
                  startListening={startListening}
                  stopListening={stopListening}
                  qrModalOpen={qrModalOpen}
                  setQrModalOpen={setQrModalOpen}
                  handleFileUpload={handleFileUpload}
                />
              </div>
            </StickToBottom>
            <div className="flex flex-col justify-center">
              {!chatStarted && (
                <div className="flex justify-center gap-2">
                  <ImportButtons importChat={importChat} />
                  <GitCloneButton importChat={importChat} />
                </div>
              )}
              <div className="flex flex-col gap-5">
                {!chatStarted && (
                  <ExamplePrompts
                    sendMessage={(event, messageInput) => {
                      if (isStreaming) {
                        handleStop?.();
                        return;
                      }

                      handleSendMessage?.(event, messageInput);
                    }}
                  />
                )}
                {!chatStarted && <StarterTemplates />}
              </div>
            </div>
          </div>
          <ClientOnly>
            {() => (
              <ErrorBoundary
                panelName="the workbench"
                onReset={() => {
                  import('~/lib/stores/workbench').then(({ workbenchStore }) => {
                    workbenchStore.clearAlert();
                    workbenchStore.clearSupabaseAlert();
                    workbenchStore.clearDeployAlert();
                  });
                }}
              >
                <Workbench
                  chatStarted={chatStarted}
                  isStreaming={isStreaming}
                  setSelectedElement={setSelectedElement}
                />
              </ErrorBoundary>
            )}
          </ClientOnly>
        </div>
      </ScreenshotProvider>
    </div>
  );

  return <Tooltip.Provider delayDuration={200}>{baseChat}</Tooltip.Provider>;
});

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    !isAtBottom && (
      <>
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-ui-background-depth-1 to-transparent h-20 z-10" />
        <button
          className="sticky z-50 bottom-0 left-0 right-0 text-4xl rounded-lg px-1.5 py-0.5 flex items-center justify-center mx-auto gap-2 bg-ui-background-depth-2 border border-ui-borderColor text-ui-textPrimary text-sm"
          onClick={() => scrollToBottom()}
        >
          Go to last message
          <span className="i-ph:arrow-down animate-bounce" />
        </button>
      </>
    )
  );
}
