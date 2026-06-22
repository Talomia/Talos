import React, { useState, useEffect } from 'react';
import { getAll } from '~/lib/persistence/db';
import { getDb } from '~/lib/persistence/useChatHistory';
import type { ChatHistoryItem } from '~/lib/persistence/useChatHistory';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);

  if (seconds < 60) {
    return 'just now';
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(dateStr).toLocaleDateString();
}

function getFirstUserMessage(chat: ChatHistoryItem): string {
  const msg = chat.messages?.find((m) => m.role === 'user');

  if (!msg || typeof msg.content !== 'string') {
    return '';
  }

  return msg.content.length > 80 ? msg.content.slice(0, 80) + '…' : msg.content;
}

export function RecentProjects() {
  const [recentChats, setRecentChats] = useState<ChatHistoryItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    getDb().then(async (db) => {
      if (!db || cancelled) {
        return;
      }

      try {
        const allChats = await getAll(db);
        const sorted = allChats
          .filter((c) => c.messages && c.messages.length > 0)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 3);

        if (!cancelled) {
          setRecentChats(sorted);
        }
      } catch {
        // Silently fail — landing page should never break
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (recentChats.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-2xl mx-auto mt-8 px-4 landing-fade-in-up" style={{ animationDelay: '0.5s' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="i-ph:clock-counter-clockwise text-lg text-ui-textTertiary" />
        <h3 className="text-sm font-medium text-ui-textTertiary uppercase tracking-wider">Recent Projects</h3>
      </div>
      <div className="flex flex-col gap-2">
        {recentChats.map((chat, index) => (
          <a
            key={chat.id}
            href={`/chat/${chat.urlId || chat.id}`}
            className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-ui-borderColor bg-ui-background-depth-2 hover:border-ui-borderColorActive transition-all duration-200 hover:shadow-sm"
            style={{ animationDelay: `${0.55 + index * 0.08}s` }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ui-textPrimary truncate">
                  {chat.description || 'Untitled Project'}
                </span>
                <span className="text-xs text-ui-textTertiary whitespace-nowrap flex-shrink-0">
                  {timeAgo(chat.timestamp)}
                </span>
              </div>
              {getFirstUserMessage(chat) && (
                <p className="text-xs text-ui-textSecondary mt-0.5 truncate">{getFirstUserMessage(chat)}</p>
              )}
            </div>
            <span className="i-ph:arrow-right text-ui-textTertiary group-hover:text-ui-textPrimary transition-colors flex-shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
}
