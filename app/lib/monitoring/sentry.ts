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
      release: `app@${import.meta.env.VITE_APP_VERSION || 'dev'}`,
      tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: import.meta.env.MODE === 'production' ? 0.5 : 0,
      beforeSend(event: any) {
        // Strip cookies and authorization headers
        if (event.request?.cookies) {
          delete event.request.cookies;
        }

        if (event.request?.headers) {
          const headersToScrub = ['authorization', 'cookie', 'x-api-key'];

          for (const header of headersToScrub) {
            if (event.request.headers[header]) {
              event.request.headers[header] = '[Filtered]';
            }
          }
        }

        // Scrub API key patterns from error messages
        const scrubSecrets = (str: string): string =>
          str
            .replace(/(?:sk-|key-|token-|Bearer\s+)[a-zA-Z0-9_-]{10,}/g, '[REDACTED]')
            .replace(/(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^\s"',]{8,}/gi, '[REDACTED]');

        if (event.message) {
          event.message = scrubSecrets(event.message);
        }

        if (event.exception?.values) {
          for (const ex of event.exception.values) {
            if (ex.value) {
              ex.value = scrubSecrets(ex.value);
            }
          }
        }

        // Strip PII from breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((bc: any) => ({
            ...bc,
            data: undefined, // Breadcrumb data may contain URLs with tokens
          }));
        }

        // Strip user PII (keep only anonymous ID)
        if (event.user) {
          delete event.user.email;
          delete event.user.username;
          delete event.user.ip_address;
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
