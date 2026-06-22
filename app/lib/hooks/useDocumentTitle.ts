import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { description } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { streamingState } from '~/lib/stores/streaming';

/**
 * Dynamically updates the browser tab title based on chat state:
 * - No chat: "Talos"
 * - Chat active: "Chat Title — Talos"
 * - Streaming: "● Working… — Talos"
 */
export function useDocumentTitle() {
  const chatDescription = useStore(description);
  const chat = useStore(chatStore);
  const isStreaming = useStore(streamingState);

  useEffect(() => {
    const base = 'Talos';

    if (!chat.started) {
      document.title = base;
    } else if (isStreaming) {
      document.title = `● Working… — ${base}`;
    } else if (chatDescription) {
      document.title = `${chatDescription} — ${base}`;
    } else {
      document.title = base;
    }

    return () => {
      document.title = base;
    };
  }, [chat.started, isStreaming, chatDescription]);
}
