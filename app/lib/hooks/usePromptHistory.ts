import { useCallback, useRef, useState } from 'react';

const STORAGE_KEY = 'promptHistory';
const MAX_HISTORY = 50;

/**
 * Returns previously sent user prompts from localStorage.
 */
function loadHistory(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    // localStorage unavailable
  }
}

/**
 * Hook providing shell-like prompt history with ↑/↓ navigation.
 *
 * - Call `pushToHistory(text)` when a message is sent.
 * - Call `handleHistoryKeyDown(event)` from the textarea's onKeyDown.
 * - Only activates when the input is empty or browsing history.
 */
export function usePromptHistory(currentInput: string, setInput: (value: string) => void) {
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyRef = useRef<string[]>(loadHistory());
  const savedDraftRef = useRef('');

  const pushToHistory = useCallback((text: string) => {
    const trimmed = text.trim();

    if (!trimmed) {
      return;
    }

    // Remove duplicates and prepend
    const history = historyRef.current.filter((h) => h !== trimmed);
    history.unshift(trimmed);
    historyRef.current = history.slice(0, MAX_HISTORY);
    saveHistory(historyRef.current);
    setHistoryIndex(-1);
  }, []);

  const handleHistoryKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const history = historyRef.current;

      if (history.length === 0) {
        return;
      }

      const isBrowsing = historyIndex >= 0;
      const isEmpty = currentInput.trim() === '';
      const textarea = event.currentTarget;
      const cursorAtStart = textarea.selectionStart === 0;
      const cursorAtEnd = textarea.selectionStart === textarea.value.length;

      if (event.key === 'ArrowUp' && (isEmpty || (isBrowsing && cursorAtStart))) {
        event.preventDefault();

        const nextIndex = Math.min(historyIndex + 1, history.length - 1);

        if (historyIndex === -1) {
          savedDraftRef.current = currentInput;
        }

        setHistoryIndex(nextIndex);
        setInput(history[nextIndex]);
      } else if (event.key === 'ArrowDown' && isBrowsing && cursorAtEnd) {
        event.preventDefault();

        const nextIndex = historyIndex - 1;

        if (nextIndex < 0) {
          setHistoryIndex(-1);
          setInput(savedDraftRef.current);
        } else {
          setHistoryIndex(nextIndex);
          setInput(history[nextIndex]);
        }
      }
    },
    [currentInput, historyIndex, setInput],
  );

  return { pushToHistory, handleHistoryKeyDown, historyIndex };
}
