import { initSentry, setUser as setSentryUser } from './sentry';
import { initPostHog, identify as identifyPostHog, reset as resetPostHog } from './posthog';

/**
 * Initialize all monitoring services.
 * Call once on app startup. Safe to call without configuration —
 * each service gracefully degrades when its env vars are missing.
 */
export async function initMonitoring(): Promise<void> {
  await Promise.all([initSentry(), initPostHog()]);
}

/**
 * Identify the current user across all monitoring services.
 */
export function identifyUser(user: { id: string; email?: string; name?: string }): void {
  setSentryUser({ id: user.id, email: user.email });
  identifyPostHog(user.id, { email: user.email, name: user.name });
}

/**
 * Clear user identity across all monitoring services (on logout).
 */
export function clearUser(): void {
  setSentryUser(null);
  resetPostHog();
}

export { captureError } from './sentry';
export { track } from './posthog';
