import type { AppLoadContext } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('EntryServer');
import { RemixServer } from '@remix-run/react';
import { renderToString } from 'react-dom/server';
import { renderHeadToString } from 'remix-island';
import { Head } from './root';
import { themeStore } from '~/lib/stores/theme';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: any,
  _loadContext: AppLoadContext,
) {
  let html: string;

  try {
    const appHtml = renderToString(<RemixServer context={remixContext} url={request.url} />);
    const head = renderHeadToString({ request, remixContext, Head });

    html = `<!DOCTYPE html><html lang="en" data-theme="${themeStore.value}"><head>${head}</head><body><div id="root" class="w-full h-full">${appHtml}</div></body></html>`;
  } catch (error) {
    logger.error(error);
    responseStatusCode = 500;
    html = '<!DOCTYPE html><html><body><h1>Internal Server Error</h1></body></html>';
  }

  responseHeaders.set('Content-Type', 'text/html');

  /*
   * Cross-origin isolation headers — required for SharedArrayBuffer
   * which the WebContainer runtime depends on.
   *
   * These are set here (at the Remix SSR layer) rather than only in
   * Express middleware so they work on EVERY deployment path:
   *   - Cloudflare Pages (no Express)
   *   - Docker/Node.js (Express may be behind a proxy that strips headers)
   *   - Vite dev server
   *   - Electron
   */
  responseHeaders.set('Cross-Origin-Embedder-Policy', 'credentialless');
  responseHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

  return new Response(html, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
