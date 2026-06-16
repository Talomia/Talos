import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('sentry');

let _initialized = false;

/**
 * Initialize Sentry error monitoring.
 * Only initializes if VITE_SENTRY_DSN is set.
 * Uses dynamic import to avoid bundling Sentry when not configured.
 */
export async function initSentry(): Promise<void> {
  if (_initialized) {
    return;
  }

  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    logger.info('Sentry not configured — VITE_SENTRY_DSN not set');
    return;
  }

  try {
    const sentryModule = await import('@sentry/browser');

    sentryModule.init({
      dsn,
      environment: import.meta.env.MODE || 'development',
      release: `recurrsive@${import.meta.env.VITE_APP_VERSION || 'dev'}`,
      tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: import.meta.env.MODE === 'production' ? 0.5 : 0,
      beforeSend(event: any) {
        // Strip API keys from error reports
        if (event.request?.cookies) {
          delete event.request.cookies;
        }

        return event;
      },
    });

    _initialized = true;
    logger.info('Sentry initialized');
  } catch (_err) {
    logger.warn('Failed to initialize Sentry:', _err);
  }
}

/**
 * Capture an error in Sentry.
 * No-op if Sentry is not initialized.
 */
export async function captureError(error: Error, context?: Record<string, any>): Promise<void> {
  if (!_initialized) {
    return;
  }

  try {
    const sentryModule = await import('@sentry/browser');
    sentryModule.captureException(error, { extra: context });
  } catch {
    // Silently fail — monitoring should never crash the app
  }
}

/**
 * Set user context for Sentry error reports.
 */
export async function setUser(user: { id: string; email?: string } | null): Promise<void> {
  if (!_initialized) {
    return;
  }

  try {
    const sentryModule = await import('@sentry/browser');
    sentryModule.setUser(user);
  } catch {
    // Silently fail
  }
}
