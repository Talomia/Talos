import { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { streamingState } from '~/lib/stores/streaming';

/**
 * Sends a browser notification when the AI finishes responding
 * and the user has tabbed away (document is hidden).
 *
 * Pairs with useDocumentTitle which shows "● Thinking..." in the tab.
 */
export function useNotificationOnComplete() {
  const isStreaming = useStore(streamingState);
  const wasStreaming = useRef(false);

  useEffect(() => {
    if (isStreaming) {
      wasStreaming.current = true;

      return;
    }

    // Streaming just ended
    if (wasStreaming.current && document.hidden) {
      wasStreaming.current = false;
      sendNotification();
    } else {
      wasStreaming.current = false;
    }
  }, [isStreaming]);
}

function sendNotification() {
  if (!('Notification' in window)) {
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification('Talos', {
      body: 'Response complete — click to return',
      icon: '/logo-dark-styled.png',
      tag: 'talos-response', // Prevents stacking duplicate notifications
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification('Talos', {
          body: 'Response complete — click to return',
          icon: '/logo-dark-styled.png',
          tag: 'talos-response',
        });
      }
    });
  }
}
