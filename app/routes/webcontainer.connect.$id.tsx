import { type LoaderFunction } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WebContainerConnect');

/**
 * Allowlist of origins permitted for WebContainer connect.
 * SECURITY: editorOrigin is injected into an inline script — without validation,
 * an attacker can inject arbitrary JavaScript via the query parameter.
 */
const ALLOWED_ORIGINS = [
  'https://talos.dev',
  'https://www.talos.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

function isAllowedOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);

    return ALLOWED_ORIGINS.includes(url.origin);
  } catch {
    return false;
  }
}

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const rawOrigin = url.searchParams.get('editorOrigin') || 'https://talos.dev';

  /*
   * SECURITY: Validate editorOrigin against allowlist to prevent XSS.
   * The value is interpolated directly into an inline <script> tag.
   */
  const editorOrigin = isAllowedOrigin(rawOrigin) ? rawOrigin : 'https://talos.dev';

  logger.trace('editorOrigin', editorOrigin);

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Connect to WebContainer</title>
      </head>
      <body>
        <script type="module">
          (async () => {
            const { setupConnect } = await import('https://cdn.jsdelivr.net/npm/@webcontainer/api@latest/dist/connect.js');
            setupConnect({
              editorOrigin: '${editorOrigin}'
            });
          })();
        </script>
      </body>
    </html>
  `;

  return new Response(htmlContent, {
    headers: { 'Content-Type': 'text/html' },
  });
};
