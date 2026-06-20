import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { GitUrlImport } from '~/components/git/GitUrlImport.client';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { ErrorBoundary } from '~/components/ui/ErrorBoundary';

export const meta: MetaFunction = () => {
  return [{ title: 'App' }, { name: 'description', content: 'AI-native full-stack application platform' }];
};

export async function loader(args: LoaderFunctionArgs) {
  return json({ url: args.params.url });
}

export default function Index() {
  return (
    <div className="flex flex-col h-full w-full bg-ui-background-depth-1">
      <BackgroundRays />
      <Header />
      <ErrorBoundary panelName="the git import panel">
        <ClientOnly fallback={<BaseChat />}>{() => <GitUrlImport />}</ClientOnly>
      </ErrorBoundary>
    </div>
  );
}
