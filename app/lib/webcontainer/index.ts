/**
 * Runtime Engine Bootstrap
 *
 * This module is the single entry point for the execution runtime. It creates and
 * exports a `RuntimeEngine` promise that all stores, runners, and components consume.
 *
 * The engine type is selected via the `VITE_RUNTIME_ENGINE` env variable:
 *   - 'webcontainer' (default) — in-browser Node.js via StackBlitz WebContainer
 *   - 'docker' — server-side Docker containers via WebSocket
 */
import type { RuntimeEngine } from '~/lib/runtime/runtime-engine';
import { createEngine } from '~/lib/runtime/engine-factory';
import { cleanStackTrace } from '~/utils/stacktrace';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Runtime');

// ─── Configuration ────────────────────────────────────────────────────────────

/** Maximum number of boot retry attempts before giving up. */
const MAX_BOOT_RETRIES = 3;

/** Base delay (ms) for exponential backoff between retries. */
const BOOT_RETRY_BASE_DELAY_MS = 1000;

// ─── HMR Context ──────────────────────────────────────────────────────────────

interface RuntimeContext {
  loaded: boolean;
}

export const runtimeContext: RuntimeContext = import.meta.hot?.data.runtimeContext ?? {
  loaded: false,
};

if (import.meta.hot) {
  import.meta.hot.data.runtimeContext = runtimeContext;
}

// ─── Boot with Retry ──────────────────────────────────────────────────────────

/**
 * Attempt to create and boot the runtime engine with exponential backoff.
 *
 * On each failure, waits `BOOT_RETRY_BASE_DELAY_MS * 2^attempt` before retrying.
 * After `MAX_BOOT_RETRIES` failures, the error propagates to the caller.
 */
async function bootEngineWithRetry(): Promise<RuntimeEngine> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_BOOT_RETRIES; attempt++) {
    try {
      const engine = await createEngine();
      return engine;
    } catch (error) {
      lastError = error;

      const delay = BOOT_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);

      logger.warn(`Boot attempt ${attempt + 1}/${MAX_BOOT_RETRIES} failed, retrying in ${delay}ms...`, error);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  logger.error(`Runtime engine failed to boot after ${MAX_BOOT_RETRIES} attempts`);
  throw lastError;
}

// ─── Engine Singleton ─────────────────────────────────────────────────────────

/**
 * The global runtime engine promise.
 *
 * On SSR this is a never-resolving promise (noop).
 * On the client it boots the configured engine and wires up error handling.
 */
export let runtime: Promise<RuntimeEngine> = new Promise(() => {
  // noop for SSR — runtime only exists on the client
});

if (!import.meta.env.SSR) {
  runtime =
    import.meta.hot?.data.runtime ??
    Promise.resolve()
      .then(() => bootEngineWithRetry())
      .then(async (engine) => {
        runtimeContext.loaded = true;
        logger.info('Runtime engine booted');

        // Load and inject the inspector script into previews
        const response = await fetch('/inspector-script.js');
        const inspectorScript = await response.text();
        await engine.setPreviewScript(inspectorScript);

        // Listen for preview errors and surface them in the workbench
        engine.on('preview-message', (message) => {
          logger.trace('Preview message:', message);

          if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
            const isPromise = message.type === 'PREVIEW_UNHANDLED_REJECTION';
            const title = isPromise ? 'Unhandled Promise Rejection' : 'Uncaught Exception';

            /*
             * Lazy-import workbenchStore to avoid circular dependency.
             * This import is cached after first call.
             */
            import('~/lib/stores/workbench').then(({ workbenchStore }) => {
              workbenchStore.actionAlert.set({
                type: 'preview',
                title,
                description: 'message' in message ? message.message : 'Unknown error',
                content: `Error occurred at ${message.pathname}${message.search}${message.hash}\nPort: ${message.port}\n\nStack trace:\n${cleanStackTrace(message.stack || '')}`,
                source: 'preview',
              });
            });
          }
        });

        return engine;
      })
      .catch((error) => {
        logger.error('Fatal: Runtime engine could not be initialized:', error);

        const isCrossOriginIsolated = typeof window !== 'undefined' && window.crossOriginIsolated;
        const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

        let description = 'The execution runtime failed to start. ';

        if (!isCrossOriginIsolated) {
          description +=
            'Your browser is not cross-origin isolated (COOP/COEP headers may be stripped by the reverse proxy). ' +
            'Try hard-refreshing the page (Ctrl+Shift+R) to activate the isolation service worker, ' +
            'or ensure your hosting provider preserves Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers.';
        } else if (!hasSharedArrayBuffer) {
          description +=
            'SharedArrayBuffer is not available in your browser. ' +
            'This feature is required for the in-browser runtime. ' +
            'Try using a Chromium-based browser (Chrome, Edge, Brave).';
        } else {
          description +=
            'This may be caused by insufficient memory or a third-party extension. ' +
            'Try refreshing the page or disabling browser extensions.';
        }

        logger.error(
          `Diagnostics: crossOriginIsolated=${isCrossOriginIsolated}, ` +
            `SharedArrayBuffer=${hasSharedArrayBuffer}, ` +
            `isSecureContext=${typeof window !== 'undefined' && window.isSecureContext}`,
        );

        /*
         * Surface the boot failure to the user via the workbench alert system.
         * The lazy import avoids circular dependency issues.
         */
        import('~/lib/stores/workbench')
          .then(({ workbenchStore }) => {
            workbenchStore.actionAlert.set({
              type: 'preview',
              title: 'Runtime Boot Failure',
              description,
              content: error instanceof Error ? error.message : String(error),
              source: 'preview',
            });
          })
          .catch(() => {
            // Best-effort — if workbench also fails, there's nothing more we can do
          });

        // Re-throw so consumers of the `runtime` promise know it failed
        throw error;
      });

  /*
   * ─── Graceful Teardown on Page Unload ─────────────────────────────────────
   *
   * Ensures the runtime engine is properly shut down when the user navigates
   * away or closes the tab. This releases WebContainer's underlying
   * ServiceWorker and iframe resources, preventing memory leaks across
   * page transitions.
   */

  const teardownRuntime = () => {
    runtime
      .then((engine) => {
        logger.info('Tearing down runtime engine on page unload');
        engine.teardown();
      })
      .catch(() => {
        // Engine never booted or already failed — nothing to tear down
      });
  };

  window.addEventListener('beforeunload', teardownRuntime);

  /*
   * Also tear down on actual page unload for mobile browsers that may not fire
   * beforeunload. Only triggers on real navigation away, NOT on tab switches.
   */
  const onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) {
      teardownRuntime();
    }
  };
  window.addEventListener('pagehide', onPageHide);

  if (import.meta.hot) {
    import.meta.hot.data.runtime = runtime;

    // Clean up event listeners on HMR to avoid duplicates
    import.meta.hot.dispose(() => {
      window.removeEventListener('beforeunload', teardownRuntime);
      window.removeEventListener('pagehide', onPageHide);
    });
  }
}
