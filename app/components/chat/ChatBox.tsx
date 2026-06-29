import React from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST } from '~/utils/constants';
import { ModelSelector } from '~/components/chat/ModelSelector';
import { APIKeyManager } from './APIKeyManager';
import { LOCAL_PROVIDERS } from '~/lib/stores/settings';
import FilePreview from './FilePreview';
import { SendButton } from './SendButton.client';
import { IconButton } from '~/components/ui/IconButton';
import { toast } from 'react-toastify';
import { SpeechRecognitionButton } from '~/components/chat/SpeechRecognition';
import { SupabaseConnection } from './SupabaseConnection';
import { lazy, Suspense } from 'react';

const ExpoQrModal = lazy(() => import('~/components/workbench/ExpoQrModal').then((m) => ({ default: m.ExpoQrModal })));
import styles from './BaseChat.module.scss';
import type { ProviderInfo } from '~/types/model';
import { ColorSchemeDialog } from '~/components/ui/ColorSchemeDialog';
import { McpTools } from './MCPTools';
import { WebSearch } from './WebSearch.client';
import { useChatContext } from '~/lib/contexts/ChatContext';
import { usePromptHistory } from '~/lib/hooks/usePromptHistory';
import { startThinkFlow, flowRunning } from '~/lib/modules/thinkflow';
import { useStore } from '@nanostores/react';

/**
 * Props that are local to BaseChat and NOT available from ChatContext.
 * Everything else is consumed directly via useChatContext().
 */
interface ChatBoxProps {
  isModelSettingsCollapsed: boolean;
  setIsModelSettingsCollapsed: (collapsed: boolean) => void;
  modelList: { name: string; label: string; provider: string; maxTokenAllowed: number }[];
  apiKeys: Record<string, string>;
  isModelLoading: string | undefined;
  onApiKeysChange: (providerName: string, apiKey: string) => void;
  handlePaste: (e: React.ClipboardEvent) => void;
  TEXTAREA_MIN_HEIGHT: number;
  TEXTAREA_MAX_HEIGHT: number;
  handleSendMessage: (event: React.UIEvent, messageInput?: string) => void;
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
  qrModalOpen: boolean;
  setQrModalOpen: (open: boolean) => void;
  handleFileUpload: () => void;
}

export const ChatBox: React.FC<ChatBoxProps> = React.memo((props) => {
  const {
    chat: { input, chatStarted, isStreaming, enhancingPrompt },
    model: { model, setModel, provider, setProvider, providerList },
    files: { uploadedFiles, setUploadedFiles, imageDataList, setImageDataList },
    actions: { handleInputChange, handleStop, enhancePrompt },
    ui: { chatMode, setChatMode, designScheme, setDesignScheme, selectedElement, setSelectedElement },
    aiSdk: { onWebSearchResult },
    refs: { textareaRef },
  } = useChatContext();

  const isFlowRunning = useStore(flowRunning);

  // Shell-like prompt history (↑/↓)
  const setInputValue = React.useCallback(
    (value: string) => {
      handleInputChange({ target: { value } } as React.ChangeEvent<HTMLTextAreaElement>);
    },
    [handleInputChange],
  );
  const { pushToHistory, handleHistoryKeyDown } = usePromptHistory(input, setInputValue);

  const handleDeepThink = React.useCallback(() => {
    const prompt = input.trim();

    if (!prompt) {
      return;
    }

    const thoughtDefinitions = [
      {
        label: 'Architecture Analysis',
        focus: `Analyze the architectural implications of: ${prompt}\n\nFocus on system design, component relationships, and scalability.`,
      },
      {
        label: 'Implementation Strategy',
        focus: `Propose a concrete implementation plan for: ${prompt}\n\nFocus on specific files, functions, and code changes needed.`,
      },
      {
        label: 'Risk Assessment',
        focus: `Identify potential risks and edge cases for: ${prompt}\n\nFocus on error scenarios, performance implications, and security concerns.`,
      },
    ];

    startThinkFlow(thoughtDefinitions, {
      model: model || '',
      provider: provider?.name || '',
    });

    // Clear the input after starting the flow
    handleInputChange({ target: { value: '' } } as React.ChangeEvent<HTMLTextAreaElement>);
    toast.success('Deep Think started!');
  }, [input, model, provider, handleInputChange]);

  return (
    <div className="relative bg-ui-background-depth-2 backdrop-blur p-3 rounded-lg border border-ui-borderColor w-full max-w-chat mx-auto z-prompt">
      <svg className={classNames(styles.PromptEffectContainer)}>
        <defs>
          <linearGradient
            id="line-gradient"
            x1="20%"
            y1="0%"
            x2="-14%"
            y2="10%"
            gradientUnits="userSpaceOnUse"
            gradientTransform="rotate(-45)"
          >
            <stop offset="0%" stopColor="#b44aff" stopOpacity="0%"></stop>
            <stop offset="40%" stopColor="#b44aff" stopOpacity="80%"></stop>
            <stop offset="50%" stopColor="#b44aff" stopOpacity="80%"></stop>
            <stop offset="100%" stopColor="#b44aff" stopOpacity="0%"></stop>
          </linearGradient>
          <linearGradient id="shine-gradient">
            <stop offset="0%" stopColor="white" stopOpacity="0%"></stop>
            <stop offset="40%" stopColor="#ffffff" stopOpacity="80%"></stop>
            <stop offset="50%" stopColor="#ffffff" stopOpacity="80%"></stop>
            <stop offset="100%" stopColor="white" stopOpacity="0%"></stop>
          </linearGradient>
        </defs>
        <rect className={classNames(styles.PromptEffectLine)} pathLength="100" strokeLinecap="round"></rect>
        <rect className={classNames(styles.PromptShine)} x="48" y="24" width="70" height="1"></rect>
      </svg>
      <div>
        <ClientOnly>
          {() => (
            <div className={props.isModelSettingsCollapsed ? 'hidden' : ''}>
              <ModelSelector
                key={provider?.name + ':' + props.modelList.length}
                model={model}
                setModel={setModel}
                modelList={props.modelList}
                provider={provider}
                setProvider={setProvider}
                providerList={providerList || (PROVIDER_LIST as ProviderInfo[])}
                apiKeys={props.apiKeys}
                modelLoading={props.isModelLoading}
              />
              {(providerList || []).length > 0 && provider && !LOCAL_PROVIDERS.includes(provider.name) && (
                <APIKeyManager
                  provider={provider}
                  apiKey={props.apiKeys[provider.name] || ''}
                  setApiKey={(key) => {
                    props.onApiKeysChange(provider.name, key);
                  }}
                />
              )}
            </div>
          )}
        </ClientOnly>
      </div>
      <FilePreview
        files={uploadedFiles}
        imageDataList={imageDataList}
        onRemove={(index) => {
          setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
          setImageDataList(imageDataList.filter((_, i) => i !== index));
        }}
      />
      {selectedElement && (
        <div className="flex mx-1.5 gap-2 items-center justify-between rounded-lg rounded-b-none border border-b-none border-ui-borderColor text-ui-textPrimary flex py-1 px-2.5 font-medium text-xs">
          <div className="flex gap-2 items-center lowercase">
            <code className="bg-accent-500 rounded-4px px-1.5 py-1 mr-0.5 text-white">{selectedElement?.tagName}</code>
            selected for inspection
          </div>
          <button
            className="bg-transparent text-accent-500 pointer-auto"
            onClick={() => setSelectedElement(null)}
            aria-label="Clear element selection"
          >
            Clear
          </button>
        </div>
      )}
      <div className={classNames('relative shadow-xs border border-ui-borderColor backdrop-blur rounded-lg')}>
        <textarea
          ref={textareaRef}
          className={classNames(
            'w-full pl-4 pt-4 pr-16 outline-none resize-none text-ui-textPrimary placeholder-ui-textTertiary bg-transparent text-sm',
            'transition-all duration-200',
            'hover:border-ui-focus',
          )}
          aria-label="Chat message input"
          onDragEnter={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '2px solid var(--ui-focus)';
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '2px solid var(--ui-focus)';
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '1px solid var(--ui-borderColor)';
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '1px solid var(--ui-borderColor)';

            const files = Array.from(e.dataTransfer.files);
            const newFiles: File[] = [];
            const newImages: string[] = [];
            let remaining = files.filter((f) => f.type.startsWith('image/')).length;

            if (remaining === 0) {
              return;
            }

            files.forEach((file) => {
              if (file.type.startsWith('image/')) {
                const reader = new FileReader();

                reader.onload = (ev) => {
                  const base64Image = ev.target?.result as string;
                  newFiles.push(file);
                  newImages.push(base64Image);
                  remaining--;

                  if (remaining === 0) {
                    setUploadedFiles([...uploadedFiles, ...newFiles]);
                    setImageDataList([...imageDataList, ...newImages]);
                  }
                };
                reader.readAsDataURL(file);
              }
            });
          }}
          onKeyDown={(event) => {
            // Prompt history with ↑/↓
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              handleHistoryKeyDown(event);

              if (event.defaultPrevented) {
                return;
              }
            }

            if (event.key === 'Enter') {
              if (event.shiftKey) {
                return;
              }

              event.preventDefault();

              if (isStreaming) {
                handleStop();
                return;
              }

              // ignore if using input method engine
              if (event.nativeEvent.isComposing) {
                return;
              }

              props.handleSendMessage(event);
              pushToHistory(input);
            }
          }}
          value={input}
          onChange={(event) => {
            handleInputChange(event);
          }}
          onPaste={props.handlePaste}
          style={{
            minHeight: props.TEXTAREA_MIN_HEIGHT,
            maxHeight: props.TEXTAREA_MAX_HEIGHT,
          }}
          placeholder={chatMode === 'build' ? 'How can I help you today?' : 'What would you like to discuss?'}
          translate="no"
        />
        <ClientOnly>
          {() => (
            <SendButton
              show={input.length > 0 || isStreaming || uploadedFiles.length > 0}
              isStreaming={isStreaming}
              disabled={!providerList || providerList.length === 0}
              onClick={(event) => {
                if (isStreaming) {
                  handleStop();
                  return;
                }

                if (input.length > 0 || uploadedFiles.length > 0) {
                  props.handleSendMessage(event);
                }
              }}
            />
          )}
        </ClientOnly>
        <div className="flex justify-between items-center text-sm p-4 pt-2">
          <div className="flex gap-1 items-center">
            <ColorSchemeDialog designScheme={designScheme} setDesignScheme={setDesignScheme} />
            <McpTools />
            <IconButton title="Upload file" className="transition-all" onClick={() => props.handleFileUpload()}>
              <div className="i-ph:paperclip text-xl"></div>
            </IconButton>
            <WebSearch onSearchResult={(result) => onWebSearchResult(result)} disabled={isStreaming} />
            <IconButton
              title="Enhance prompt"
              disabled={input.length === 0 || enhancingPrompt}
              className={classNames('transition-all', enhancingPrompt ? 'opacity-100' : '')}
              onClick={() => {
                enhancePrompt();
                toast.success('Prompt enhanced!');
              }}
            >
              {enhancingPrompt ? (
                <div className="i-svg-spinners:90-ring-with-bg text-ui-loader-progress text-xl animate-spin"></div>
              ) : (
                <div className="i-app:stars text-xl"></div>
              )}
            </IconButton>

            {input.length > 0 && (
              <IconButton
                title="Deep Think"
                disabled={isFlowRunning}
                className={classNames('transition-all', isFlowRunning ? 'opacity-100' : '')}
                onClick={handleDeepThink}
              >
                {isFlowRunning ? (
                  <div className="i-svg-spinners:90-ring-with-bg text-ui-loader-progress text-xl animate-spin"></div>
                ) : (
                  <div className="i-ph:brain text-xl"></div>
                )}
              </IconButton>
            )}

            <SpeechRecognitionButton
              isListening={props.isListening}
              onStart={props.startListening}
              onStop={props.stopListening}
              disabled={isStreaming}
            />
            {chatStarted && (
              <IconButton
                title="Discuss"
                className={classNames(
                  'transition-all flex items-center gap-1 px-1.5',
                  chatMode === 'discuss'
                    ? '!bg-ui-item-backgroundAccent !text-ui-item-contentAccent'
                    : 'bg-ui-item-backgroundDefault text-ui-item-contentDefault',
                )}
                onClick={() => {
                  setChatMode(chatMode === 'discuss' ? 'build' : 'discuss');
                }}
              >
                <div className={`i-ph:chats text-xl`} />
                {chatMode === 'discuss' ? <span>Discuss</span> : <span />}
              </IconButton>
            )}
            <IconButton
              title="Model Settings"
              className={classNames('transition-all flex items-center gap-1', {
                'bg-ui-item-backgroundAccent text-ui-item-contentAccent': props.isModelSettingsCollapsed,
                'bg-ui-item-backgroundDefault text-ui-item-contentDefault': !props.isModelSettingsCollapsed,
              })}
              onClick={() => props.setIsModelSettingsCollapsed(!props.isModelSettingsCollapsed)}
              disabled={!providerList || providerList.length === 0}
            >
              <div className={`i-ph:caret-${props.isModelSettingsCollapsed ? 'right' : 'down'} text-lg`} />
              {props.isModelSettingsCollapsed ? <span className="text-xs">{model}</span> : <span />}
            </IconButton>
          </div>
          {input.length > 3 ? (
            <div className="flex items-center gap-3 text-xs text-ui-textTertiary">
              <span>
                Use <kbd className="kdb px-1.5 py-0.5 rounded bg-ui-background-depth-2">Shift</kbd> +{' '}
                <kbd className="kdb px-1.5 py-0.5 rounded bg-ui-background-depth-2">Return</kbd> a new line
              </span>
              <span className="text-ui-textTertiary/60">
                {input.trim().split(/\s+/).filter(Boolean).length} words · {input.length} chars
              </span>
            </div>
          ) : null}
          <SupabaseConnection />
          <Suspense fallback={null}>
            <ExpoQrModal open={props.qrModalOpen} onClose={() => props.setQrModalOpen(false)} />
          </Suspense>
        </div>
      </div>
    </div>
  );
});
