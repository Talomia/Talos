import { memo, Fragment, useState, useCallback, useRef } from 'react';
import { Markdown } from './Markdown';
import type { JSONValue } from 'ai';
import Popover from '~/components/ui/Popover';
import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';
import WithTooltip from '~/components/ui/Tooltip';
import type { Message } from 'ai';
import type { ProviderInfo } from '~/types/model';
import type {
  TextUIPart,
  ReasoningUIPart,
  ToolInvocationUIPart,
  SourceUIPart,
  FileUIPart,
  StepStartUIPart,
} from '@ai-sdk/ui-utils';
import { ToolInvocations } from './ToolInvocations';
import type { ToolCallAnnotation } from '~/types/context';
import { STORAGE_KEYS } from '~/lib/app-config';

interface AssistantMessageProps {
  content: string;
  annotations?: JSONValue[];
  messageId?: string;
  onRewind?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
  append?: (message: Message) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  model?: string;
  provider?: ProviderInfo;
  parts:
    | (TextUIPart | ReasoningUIPart | ToolInvocationUIPart | SourceUIPart | FileUIPart | StepStartUIPart)[]
    | undefined;
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
}

function openArtifactInWorkbench(filePath: string) {
  filePath = normalizedFilePath(filePath);

  if (workbenchStore.currentView.get() !== 'code') {
    workbenchStore.currentView.set('code');
  }

  workbenchStore.setSelectedFile(`${WORK_DIR}/${filePath}`);
}

function normalizedFilePath(path: string) {
  let normalizedPath = path;

  if (normalizedPath.startsWith(WORK_DIR)) {
    normalizedPath = path.replace(WORK_DIR, '');
  }

  if (normalizedPath.startsWith('/')) {
    normalizedPath = normalizedPath.slice(1);
  }

  return normalizedPath;
}

function formatTokenCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }

  return String(count);
}

export const AssistantMessage = memo(
  ({
    content,
    annotations,
    messageId,
    onRewind,
    onFork,
    append,
    chatMode,
    setChatMode,
    model,
    provider,
    parts,
    addToolResult,
  }: AssistantMessageProps) => {
    const [copied, setCopied] = useState(false);
    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [collapsed, setCollapsed] = useState(false);
    const isLongMessage = content.length > 800;

    // Feedback state: 'up' | 'down' | null
    const [feedback, setFeedback] = useState<'up' | 'down' | null>(() => {
      if (!messageId) {
        return null;
      }

      try {
        const val = localStorage.getItem(`${STORAGE_KEYS.feedback}:${messageId}`);
        return val === 'up' || val === 'down' ? val : null;
      } catch {
        return null;
      }
    });

    const handleFeedback = useCallback(
      (type: 'up' | 'down') => {
        if (!messageId) {
          return;
        }

        const newFeedback = feedback === type ? null : type;
        setFeedback(newFeedback);

        try {
          if (newFeedback) {
            localStorage.setItem(`${STORAGE_KEYS.feedback}:${messageId}`, newFeedback);
          } else {
            localStorage.removeItem(`${STORAGE_KEYS.feedback}:${messageId}`);
          }
        } catch {
          // localStorage unavailable
        }
      },
      [messageId, feedback],
    );

    const copyMessage = useCallback(() => {
      if (copied) {
        return;
      }

      navigator.clipboard.writeText(content).catch((err) => console.warn('Clipboard write failed:', err));

      setCopied(true);

      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }

      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copyTimeoutRef.current = null;
      }, 2000);
    }, [content, copied]);

    const filteredAnnotations = (
      Array.isArray(annotations)
        ? annotations.filter(
            (annotation: JSONValue) =>
              annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
          )
        : []
    ) as { type: string; value: any } & { [key: string]: any }[];

    let chatSummary: string | undefined = undefined;

    if (filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')) {
      chatSummary = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')?.summary;
    }

    let codeContext: string[] | undefined = undefined;

    if (filteredAnnotations.find((annotation) => annotation.type === 'codeContext')) {
      codeContext = filteredAnnotations.find((annotation) => annotation.type === 'codeContext')?.files;
    }

    const usage: {
      completionTokens: number;
      promptTokens: number;
      totalTokens: number;
    } = filteredAnnotations.find((annotation) => annotation.type === 'usage')?.value;

    const toolInvocations = Array.isArray(parts) ? parts.filter((part) => part.type === 'tool-invocation') : [];
    const toolCallAnnotations = filteredAnnotations.filter(
      (annotation) => annotation.type === 'toolCall',
    ) as ToolCallAnnotation[];

    const hasContext = codeContext || chatSummary;
    const hasActions = onRewind || onFork || messageId;

    return (
      <div className="overflow-hidden w-full group/message">
        {/* Avatar + label row */}
        <div className="flex items-center gap-2 mb-1">
          <div className="flex items-center justify-center w-6 h-6 rounded-full shrink-0 bg-gradient-to-br from-purple-500 to-indigo-600 shadow-sm">
            <div className="i-ph:lightning-fill text-white text-xs" />
          </div>
          <span className="text-sm font-medium text-ui-textPrimary">Talos</span>
        </div>
        <div className="ml-8">
          <>
            {/* Context info popover */}
            {hasContext && (
              <div className="flex gap-2 items-center text-sm text-ui-textSecondary mb-2">
                <Popover side="right" align="start" trigger={<div className="i-ph:info" />}>
                  {chatSummary && (
                    <div className="max-w-chat">
                      <div className="summary max-h-96 flex flex-col">
                        <h2 className="border border-ui-borderColor rounded-md p4">Summary</h2>
                        <div style={{ zoom: 0.7 }} className="overflow-y-auto m4">
                          <Markdown>{chatSummary}</Markdown>
                        </div>
                      </div>
                      {codeContext && (
                        <div className="code-context flex flex-col p4 border border-ui-borderColor rounded-md">
                          <h2>Context</h2>
                          <div className="flex gap-4 mt-4" style={{ zoom: 0.6 }}>
                            {codeContext.map((x) => {
                              const normalized = normalizedFilePath(x);

                              return (
                                <Fragment key={normalized}>
                                  <code
                                    className="bg-ui-artifacts-inlineCode-background text-ui-artifacts-inlineCode-text px-1.5 py-1 rounded-md text-ui-item-contentAccent hover:underline cursor-pointer"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      openArtifactInWorkbench(normalized);
                                    }}
                                  >
                                    {normalized}
                                  </code>
                                </Fragment>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="context"></div>
                </Popover>
              </div>
            )}
          </>
          <div className={collapsed ? 'relative max-h-24 overflow-hidden' : undefined}>
            <Markdown
              append={append}
              chatMode={chatMode}
              setChatMode={setChatMode}
              model={model}
              provider={provider}
              html
            >
              {content}
            </Markdown>
            {collapsed && (
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-ui-background-depth-1 to-transparent pointer-events-none" />
            )}
          </div>
          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="flex items-center gap-1 text-xs text-accent-500 hover:text-accent-600 mt-1 transition-colors"
            >
              <span className="i-ph:caret-down text-sm" />
              Show full response
            </button>
          )}
          {toolInvocations && toolInvocations.length > 0 && (
            <ToolInvocations
              toolInvocations={toolInvocations}
              toolCallAnnotations={toolCallAnnotations}
              addToolResult={addToolResult}
            />
          )}

          {/* Message footer — actions + token usage */}
          {(hasActions || usage) && (
            <div className="flex items-center gap-3 mt-3 pt-2 border-t border-ui-borderColor/40 opacity-0 group-hover/message:opacity-100 transition-opacity duration-200">
              {/* Action buttons */}
              <div className="flex items-center gap-1">
                <WithTooltip tooltip={copied ? 'Copied!' : 'Copy message'}>
                  <button
                    onClick={copyMessage}
                    className={`p-1 rounded transition-colors ${
                      copied
                        ? 'text-green-500'
                        : 'text-ui-textTertiary hover:text-ui-textPrimary hover:bg-ui-background-depth-3'
                    }`}
                    aria-label="Copy message"
                  >
                    <div className={copied ? 'i-ph:check text-lg' : 'i-ph:copy text-lg'} />
                  </button>
                </WithTooltip>
                {onRewind && messageId && (
                  <WithTooltip tooltip="Revert to this message">
                    <button
                      onClick={() => onRewind(messageId)}
                      className="p-1 rounded text-ui-textTertiary hover:text-ui-textPrimary hover:bg-ui-background-depth-3 transition-colors"
                      aria-label="Revert to this message"
                    >
                      <div className="i-ph:arrow-u-up-left text-lg" />
                    </button>
                  </WithTooltip>
                )}
                {onFork && messageId && (
                  <WithTooltip tooltip="Fork chat from this message">
                    <button
                      onClick={() => onFork(messageId)}
                      className="p-1 rounded text-ui-textTertiary hover:text-ui-textPrimary hover:bg-ui-background-depth-3 transition-colors"
                      aria-label="Fork chat from this message"
                    >
                      <div className="i-ph:git-fork text-lg" />
                    </button>
                  </WithTooltip>
                )}
              </div>

              {/* Collapse toggle for long messages */}
              {isLongMessage && (
                <WithTooltip tooltip={collapsed ? 'Expand message' : 'Collapse message'}>
                  <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="p-1 rounded text-ui-textTertiary hover:text-ui-textPrimary hover:bg-ui-background-depth-3 transition-colors"
                    aria-label={collapsed ? 'Expand message' : 'Collapse message'}
                  >
                    <div className={collapsed ? 'i-ph:caret-down text-lg' : 'i-ph:caret-up text-lg'} />
                  </button>
                </WithTooltip>
              )}

              {/* Feedback buttons */}
              {messageId && (
                <div className="flex items-center gap-0.5 border-l border-ui-borderColor/40 pl-2 ml-1">
                  <WithTooltip tooltip={feedback === 'up' ? 'Remove feedback' : 'Good response'}>
                    <button
                      onClick={() => handleFeedback('up')}
                      className={`p-1 rounded transition-colors ${feedback === 'up' ? 'text-green-500' : 'text-ui-textTertiary hover:text-green-500 hover:bg-ui-background-depth-3'}`}
                      aria-label="Good response"
                    >
                      <div className={feedback === 'up' ? 'i-ph:thumbs-up-fill text-lg' : 'i-ph:thumbs-up text-lg'} />
                    </button>
                  </WithTooltip>
                  <WithTooltip tooltip={feedback === 'down' ? 'Remove feedback' : 'Poor response'}>
                    <button
                      onClick={() => handleFeedback('down')}
                      className={`p-1 rounded transition-colors ${feedback === 'down' ? 'text-red-500' : 'text-ui-textTertiary hover:text-red-500 hover:bg-ui-background-depth-3'}`}
                      aria-label="Poor response"
                    >
                      <div
                        className={feedback === 'down' ? 'i-ph:thumbs-down-fill text-lg' : 'i-ph:thumbs-down text-lg'}
                      />
                    </button>
                  </WithTooltip>
                </div>
              )}

              {/* Token usage chip */}
              {usage && (
                <WithTooltip
                  tooltip={`Prompt: ${usage.promptTokens.toLocaleString()} · Completion: ${usage.completionTokens.toLocaleString()}`}
                >
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-ui-background-depth-3 text-[11px] text-ui-textTertiary ml-auto cursor-default">
                    <span className="i-ph:lightning text-xs" />
                    <span>{formatTokenCount(usage.totalTokens)} tokens</span>
                  </div>
                </WithTooltip>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
);
