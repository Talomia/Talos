import { useEffect } from 'react';
import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { ErrorBoundary } from '~/components/ui/ErrorBoundary';
import { toast } from 'react-toastify';

export const meta: MetaFunction = () => {
  return [{ title: 'Talos' }, { name: 'description', content: 'AI-native full-stack application platform' }];
};

export const loader = () => json({});

/**
 * Landing page component
 * Note: Settings functionality should ONLY be accessed through the sidebar menu.
 * Do not add settings button/panel to this landing page as it was intentionally removed
 * to keep the UI clean and consistent with the design system.
 */
export default function Index() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');

    if (error) {
      toast.error(`Authentication error: ${decodeURIComponent(error)}`);

      // Clear the error param from the URL without a page reload
      params.delete('error');
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-ui-background-depth-1">
      <BackgroundRays />
      <Header />
      <ErrorBoundary
        panelName="the chat panel"
        onReset={() => {
          import('~/lib/stores/chat').then(({ chatStore }) => {
            chatStore.setKey('aborted', false);
          });
          import('~/lib/stores/streaming').then(({ streamingState }) => {
            streamingState.set(false);
          });
        }}
      >
        <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
      </ErrorBoundary>
    </div>
  );
}
