import React, { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { description } from '~/lib/persistence';
import WithTooltip from '~/components/ui/Tooltip';
import { isMac } from '~/utils/os';
import { ChatSearch } from './ChatSearch';
import { BranchIndicator } from './BranchIndicator';

interface ChatHeaderProps {
  messageCount: number;
  isStreaming: boolean;
  messages: Message[];
}

export const ChatHeader = memo(({ messageCount, isStreaming, messages }: ChatHeaderProps) => {
  const chatTitle = useStore(description);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const toggleSearch = useCallback(() => {
    setIsSearchOpen((prev) => !prev);
  }, []);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        toggleSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearch]);

  const stats = useMemo(() => {
    const userMessages = Math.ceil(messageCount / 2);
    const aiMessages = Math.floor(messageCount / 2);

    return { userMessages, aiMessages };
  }, [messageCount]);

  if (messageCount === 0) {
    return null;
  }

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-ui-background-depth-1/80 backdrop-blur-sm border-b border-ui-borderColor max-w-chat mx-auto w-full">
        <div className="flex items-center gap-2 min-w-0">
          <div className="i-ph:chat-circle-text text-purple-500 text-sm shrink-0" />
          <span className="text-sm font-medium text-ui-textSecondary truncate">{chatTitle || 'New Chat'}</span>
          {isStreaming && (
            <span className="flex items-center gap-1 text-xs text-purple-500 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
              Responding…
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <WithTooltip tooltip={`${stats.userMessages} user · ${stats.aiMessages} AI messages`}>
            <div className="flex items-center gap-1 text-xs text-ui-textTertiary cursor-default">
              <span className="i-ph:chat-dots text-xs" />
              <span>{messageCount}</span>
            </div>
          </WithTooltip>
          <WithTooltip tooltip={`Search in chat (${isMac ? '⌘' : 'Ctrl+'}⇧F)`}>
            <button
              onClick={toggleSearch}
              className={`p-1 rounded transition-colors ${
                isSearchOpen
                  ? 'text-purple-500 bg-purple-50 dark:bg-purple-500/10'
                  : 'text-ui-textTertiary hover:text-purple-500 hover:bg-ui-background-depth-3'
              }`}
              aria-label="Search in chat"
            >
              <div className="i-ph:magnifying-glass text-sm" />
            </button>
          </WithTooltip>
          <WithTooltip tooltip="Scroll to top">
            <button
              onClick={() => {
                const scrollContainer = document.querySelector('.modern-scrollbar');

                if (scrollContainer) {
                  scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className="p-1 rounded text-ui-textTertiary hover:text-purple-500 hover:bg-ui-background-depth-3 transition-colors"
              aria-label="Scroll to top"
            >
              <div className="i-ph:arrow-up text-sm" />
            </button>
          </WithTooltip>
        </div>
      </div>
      {isSearchOpen && <ChatSearch messages={messages} onClose={closeSearch} />}
      <BranchIndicator />
    </>
  );
});
