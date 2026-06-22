import { useStore } from '@nanostores/react';
import type { LinksFunction } from '@remix-run/cloudflare';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useRouteError } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { themeStore } from './lib/stores/theme';
import { STORAGE_KEYS } from '~/lib/app-config';
import { stripIndents } from './utils/stripIndent';
import { createHead } from 'remix-island';
import { useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ClientOnly } from 'remix-utils/client-only';
import { cssTransition, ToastContainer } from 'react-toastify';

import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';

import 'virtual:uno.css';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/favicon.svg',
    type: 'image/svg+xml',
  },
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'stylesheet', href: xtermStyles },
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
];

const inlineThemeCode = stripIndents`
  setTutorialKitTheme();

  function setTutorialKitTheme() {
    let theme = localStorage.getItem('${STORAGE_KEYS.theme}');

    if (!theme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    document.querySelector('html')?.setAttribute('data-theme', theme);
  }
`;

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Talos</title>
    <meta
      name="description"
      content="Build full-stack web applications with AI-powered code generation, live preview, and one-click deployment."
    />
    <meta property="og:title" content="Talos" />
    <meta property="og:description" content="Build full-stack web applications with AI-powered code generation." />
    <meta property="og:image" content="/social_preview_index.jpg" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="/social_preview_index.jpg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <Meta />
    <Links />
    <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
  </>
));

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useStore(themeStore);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    // Initialize all services in parallel (each gracefully degrades if not configured)
    import('~/lib/stores/auth').then(({ initAuth }) => initAuth());
    import('~/lib/stores/profile').then(({ initProfile }) => initProfile());
    import('~/lib/persistence/cloudSync').then(({ initCloudPersistence }) => initCloudPersistence());
    import('~/lib/monitoring').then(({ initMonitoring }) => initMonitoring());
  }, []);

  return (
    <>
      <ClientOnly>{() => <DndProvider backend={HTML5Backend}>{children}</DndProvider>}</ClientOnly>
      <ToastContainer
        closeButton={({ closeToast }) => {
          return (
            <button className="Toastify__close-button" onClick={closeToast}>
              <div className="i-ph:x text-lg" />
            </button>
          );
        }}
        icon={({ type }) => {
          switch (type) {
            case 'success': {
              return <div className="i-ph:check-bold text-ui-icon-success text-2xl" />;
            }
            case 'error': {
              return <div className="i-ph:warning-circle-bold text-ui-icon-error text-2xl" />;
            }
          }

          return undefined;
        }}
        position="bottom-right"
        pauseOnFocusLoss
        transition={toastAnimation}
        autoClose={3000}
      />
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

import { logStore } from './lib/stores/logs';

export default function App() {
  const theme = useStore(themeStore);

  useEffect(() => {
    logStore.logSystem('Application initialized', {
      theme,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });

    // Initialize debug logging with improved error handling
    import('./utils/debugLogger')
      .then(({ debugLogger }) => {
        /*
         * The debug logger initializes itself and starts disabled by default
         * It will only start capturing when enableDebugMode() is called
         */
        const status = debugLogger.getStatus();
        logStore.logSystem('Debug logging ready', {
          initialized: status.initialized,
          capturing: status.capturing,
          enabled: status.enabled,
        });
      })
      .catch((error) => {
        logStore.logError('Failed to initialize debug logging', error);
      });
  }, []);

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let status = 500;
  let title = 'Unexpected Error';
  let message = 'An unexpected error occurred. Please try refreshing the page.';

  if (isRouteErrorResponse(error)) {
    status = error.status;
    title = error.status === 404 ? 'Page Not Found' : `Error ${error.status}`;
    message = error.data?.message || error.statusText || message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title} | Talos</title>
        <Meta />
        <Links />
      </head>
      <body
        style={{
          margin: 0,
          fontFamily: 'Inter, system-ui, sans-serif',
          backgroundColor: '#0d1117',
          color: '#c9d1d9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 480, padding: 24 }}>
          <h1 style={{ fontSize: 48, margin: '0 0 8px', color: '#f85149' }}>{status}</h1>
          <h2 style={{ fontSize: 20, margin: '0 0 16px', fontWeight: 500 }}>{title}</h2>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#8b949e' }}>{message}</p>
          <a
            href="/"
            style={{
              display: 'inline-block',
              marginTop: 24,
              padding: '10px 24px',
              borderRadius: 8,
              backgroundColor: '#238636',
              color: '#fff',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Back to Home
          </a>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
