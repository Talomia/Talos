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

/**
 * @deprecated Use `runtime` instead. This alias exists only for migration convenience
 * and will be removed once all consumers are migrated.
 */
export { runtime as webcontainer };

if (!import.meta.env.SSR) {
  runtime =
    import.meta.hot?.data.runtime ??
    Promise.resolve()
      .then(() => createEngine())
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
      });

  if (import.meta.hot) {
    import.meta.hot.data.runtime = runtime;
  }
}

// Re-export context under the old name for backward compat during migration
export { runtimeContext as webcontainerContext };
