import React, { memo, useState, useCallback, useEffect, useRef } from 'react';
import type { Message } from 'ai';

interface ChatSearchProps {
  messages: Message[];
  onClose: () => void;
}

export const ChatSearch = memo(({ messages, onClose }: ChatSearchProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ index: number; preview: string }[]>([]);
  const [activeResult, setActiveResult] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(highlightTimer.current);
      document.querySelectorAll('[data-search-highlight]').forEach((el) => {
        (el as HTMLElement).style.outline = '';
        (el as HTMLElement).style.outlineOffset = '';
        (el as HTMLElement).style.borderRadius = '';
        el.removeAttribute('data-search-highlight');
      });
    };
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const matches = messages
      .map((msg, index) => {
        const content = typeof msg.content === 'string' ? msg.content : '';
        const matchIndex = content.toLowerCase().indexOf(lowerQuery);

        if (matchIndex === -1) {
          return null;
        }

        const start = Math.max(0, matchIndex - 30);
        const end = Math.min(content.length, matchIndex + query.length + 30);
        const preview = (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '');

        return { index, preview };
      })
      .filter(Boolean) as { index: number; preview: string }[];

    setResults(matches);
    setActiveResult(0);
  }, [query, messages]);

  const scrollToResult = useCallback(
    (resultIndex: number) => {
      if (results.length === 0) {
        return;
      }

      const msgIndex = results[resultIndex]?.index;

      if (msgIndex === undefined) {
        return;
      }

      const messageElements = document.querySelectorAll(
        '[aria-label="User message"], [aria-label="Assistant message"]',
      );

      // Clear previous highlights
      if (highlightTimer.current) {
        clearTimeout(highlightTimer.current);
        document.querySelectorAll('[data-search-highlight]').forEach((el) => {
          (el as HTMLElement).style.outline = '';
          (el as HTMLElement).style.outlineOffset = '';
          (el as HTMLElement).style.borderRadius = '';
          el.removeAttribute('data-search-highlight');
        });
      }

      if (messageElements[msgIndex]) {
        messageElements[msgIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });

        const el = messageElements[msgIndex] as HTMLElement;
        el.style.outline = '2px solid #8b5cf6';
        el.style.outlineOffset = '4px';
        el.style.borderRadius = '8px';
        el.setAttribute('data-search-highlight', 'true');
        highlightTimer.current = setTimeout(() => {
          el.style.outline = '';
          el.style.outlineOffset = '';
          el.style.borderRadius = '';
          el.removeAttribute('data-search-highlight');
        }, 2000);
      }
    },
    [results],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        if (results.length === 0) {
          return;
        }

        if (e.shiftKey) {
          const prev = (activeResult - 1 + results.length) % results.length;
          setActiveResult(prev);
          scrollToResult(prev);
        } else {
          scrollToResult(activeResult);

          const next = (activeResult + 1) % results.length;
          setActiveResult(next);
        }
      }
    },
    [onClose, activeResult, results.length, scrollToResult],
  );

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-ui-background-depth-1/90 backdrop-blur-sm border-b border-ui-borderColor max-w-chat mx-auto w-full">
      <div className="i-ph:magnifying-glass text-ui-icon-secondary text-sm shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 bg-transparent text-sm text-ui-textPrimary placeholder-ui-textTertiary outline-none"
        placeholder="Search in conversation..."
      />
      {results.length > 0 && (
        <span className="text-xs text-ui-textTertiary shrink-0">
          {activeResult + 1}/{results.length}
        </span>
      )}
      {query && results.length === 0 && <span className="text-xs text-ui-textTertiary shrink-0">No matches</span>}
      <button
        onClick={onClose}
        className="p-1 rounded text-ui-textTertiary hover:text-ui-textSecondary transition-colors shrink-0"
        aria-label="Close search"
      >
        <div className="i-ph:x text-sm" />
      </button>
    </div>
  );
});
