import type { Message } from 'ai';
import { Fragment, memo, useCallback } from 'react';
import { classNames } from '~/utils/classNames';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';
import { useLocation, useNavigate } from '@remix-run/react';
import { getDb, chatId } from '~/lib/persistence/useChatHistory';
import { forkChat } from '~/lib/persistence/db';
import { toast } from 'react-toastify';
import { forwardRef } from 'react';
import type { ForwardedRef } from 'react';
import type { ProviderInfo } from '~/types/model';
import { format, formatDistanceToNow } from 'date-fns';

/**
 * Returns true if a time separator should be shown between two messages.
 * Shows separator when gap is > 5 minutes.
 */
function shouldShowTimeSeparator(current: Message, previous: Message | undefined): boolean {
  if (!previous || !current.createdAt || !previous.createdAt) {
    return false;
  }

  const currentTime = new Date(current.createdAt).getTime();
  const previousTime = new Date(previous.createdAt).getTime();

  return currentTime - previousTime > 5 * 60 * 1000;
}

function formatTimestamp(date: Date | string | undefined): string {
  if (!date) {
    return '';
  }

  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  // Under 1 minute: "just now"
  if (diffMs < 60_000) {
    return 'just now';
  }

  // Under 24 hours: relative ("2 hours ago")
  if (diffMs < 24 * 60 * 60_000) {
    return formatDistanceToNow(d, { addSuffix: true });
  }

  // Older: absolute ("Jun 22, 2:30 PM")
  return format(d, 'MMM d, h:mm a');
}

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  messages?: Message[];
  append?: (message: Message) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  model?: string;
  provider?: ProviderInfo;
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
}

export const Messages = memo(
  forwardRef<HTMLDivElement, MessagesProps>((props: MessagesProps, ref: ForwardedRef<HTMLDivElement> | undefined) => {
    const { id, isStreaming = false, messages = [] } = props;
    const location = useLocation();
    const navigate = useNavigate();

    const handleRewind = useCallback(
      (messageId: string) => {
        const searchParams = new URLSearchParams(location.search);
        searchParams.set('rewindTo', messageId);
        navigate(`${location.pathname}?${searchParams.toString()}`, { replace: true });
      },
      [location.search, location.pathname, navigate],
    );

    const handleFork = useCallback(
      async (messageId: string) => {
        try {
          const db = await getDb();

          if (!db || !chatId.get()) {
            toast.error('Chat persistence is not available');
            return;
          }

          const urlId = await forkChat(db, chatId.get()!, messageId);
          navigate(`/chat/${urlId}`);
        } catch (error) {
          toast.error('Failed to fork chat: ' + (error as Error).message);
        }
      },
      [navigate],
    );

    return (
      <div id={id} className={props.className} ref={ref} role="log" aria-live="polite">
        {messages.length > 0
          ? messages.map((message, index) => {
              const { role, content, id: messageId, annotations, parts } = message;
              const isUserMessage = role === 'user';
              const isFirst = index === 0;
              const isHidden = Array.isArray(annotations) && annotations.includes('hidden');
              const previousMessage = index > 0 ? messages[index - 1] : undefined;
              const showSeparator = shouldShowTimeSeparator(message, previousMessage);

              if (isHidden) {
                return <Fragment key={messageId || index} />;
              }

              return (
                <Fragment key={messageId || `msg-${index}`}>
                  {/* Time separator for gaps > 5 minutes */}
                  {showSeparator && message.createdAt && (
                    <div className="flex items-center gap-3 my-4 px-2">
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider shrink-0">
                        {formatTimestamp(message.createdAt)}
                      </span>
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                    </div>
                  )}
                  <div
                    className={classNames('group/msg flex gap-4 py-3 w-full rounded-lg relative', {
                      'mt-4': !isFirst && !showSeparator,
                    })}
                    aria-label={isUserMessage ? 'User message' : 'Assistant message'}
                  >
                    <div className="grid grid-col-1 w-full">
                      {isUserMessage ? (
                        <UserMessage
                          content={content}
                          parts={parts}
                          messageId={messageId}
                          onFork={handleFork}
                          onRewind={handleRewind}
                        />
                      ) : (
                        <AssistantMessage
                          content={content}
                          annotations={message.annotations}
                          messageId={messageId}
                          onRewind={handleRewind}
                          onFork={handleFork}
                          append={props.append}
                          chatMode={props.chatMode}
                          setChatMode={props.setChatMode}
                          model={props.model}
                          provider={props.provider}
                          parts={parts}
                          addToolResult={props.addToolResult}
                        />
                      )}
                    </div>

                    {/* Timestamp — visible on hover */}
                    {message.createdAt && (
                      <div className="absolute -right-1 top-3 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                          {format(new Date(message.createdAt), 'h:mm a')}
                        </span>
                      </div>
                    )}
                  </div>
                </Fragment>
              );
            })
          : null}
        {isStreaming && (
          <div className="flex flex-col gap-1 mt-4">
            {/* Avatar row */}
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full shrink-0 bg-gradient-to-br from-purple-500 to-indigo-600 shadow-sm">
                <div className="i-ph:lightning-fill text-white text-xs" />
              </div>
              <span className="text-sm font-medium text-ui-textPrimary">Talos</span>
            </div>
            {/* Typing bubble */}
            <div className="ml-8 flex items-center gap-1.5 px-4 py-3 rounded-lg bg-gray-100/60 dark:bg-gray-800/40 w-fit">
              <span
                className="w-2 h-2 rounded-full bg-purple-400 dark:bg-purple-400"
                style={{ animation: 'typing-bounce 1.4s ease-in-out infinite', animationDelay: '0ms' }}
              />
              <span
                className="w-2 h-2 rounded-full bg-purple-400 dark:bg-purple-400"
                style={{ animation: 'typing-bounce 1.4s ease-in-out infinite', animationDelay: '200ms' }}
              />
              <span
                className="w-2 h-2 rounded-full bg-purple-400 dark:bg-purple-400"
                style={{ animation: 'typing-bounce 1.4s ease-in-out infinite', animationDelay: '400ms' }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }),
);
