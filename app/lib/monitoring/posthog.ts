import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('posthog');

let _initialized = false;
let _posthog: any = null;

/**
 * Initialize PostHog analytics.
 * Only initializes if VITE_POSTHOG_KEY is set.
 */
export async function initPostHog(): Promise<void> {
  if (_initialized || typeof window === 'undefined') {
    return;
  }

  const key = import.meta.env.VITE_POSTHOG_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!key) {
    logger.info('PostHog not configured — VITE_POSTHOG_KEY not set');
    return;
  }

  try {
    const posthogModule = await import('posthog-js');
    _posthog = posthogModule.default;

    _posthog.init(key, {
      api_host: host,
      persistence: 'localStorage+cookie',
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: true,
      disable_session_recording: true,
      loaded: () => {
        logger.info('PostHog initialized');
      },
    });

    _initialized = true;
  } catch (error) {
    logger.warn('Failed to initialize PostHog:', error);
  }
}

/**
 * Track a custom event.
 */
export function track(event: string, properties?: Record<string, any>): void {
  if (!_initialized || !_posthog) {
    return;
  }

  _posthog.capture(event, properties);
}

/**
 * Identify a user for analytics.
 */
export function identify(userId: string, traits?: Record<string, any>): void {
  if (!_initialized || !_posthog) {
    return;
  }

  _posthog.identify(userId, traits);
}

/**
 * Reset analytics identity (on logout).
 */
export function reset(): void {
  if (!_initialized || !_posthog) {
    return;
  }

  _posthog.reset();
}
