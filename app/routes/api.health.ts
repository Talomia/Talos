import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring, load balancers, and uptime checks.
 * Returns basic system health information.
 */
export async function loader({ context }: LoaderFunctionArgs) {
  const env = (context?.cloudflare?.env as unknown as Record<string, string>) || {};

  const health = {
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || 'unknown',
    environment: process.env.NODE_ENV || 'unknown',
    services: {
      supabase: !!env.SUPABASE_URL,
      vault: !!env.VAULT_SECRET,
      sentry: !!env.VITE_SENTRY_DSN,
      posthog: !!env.VITE_POSTHOG_KEY,
    },
  };

  return json(health, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
