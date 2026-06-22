import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring, load balancers, and uptime checks.
 * Returns minimal health information — no configuration details.
 * Public endpoint: no requireAuth (health checks must be unauthenticated).
 */
export const loader = withSecurity(async ({ context }: LoaderFunctionArgs) => {
  return json(
    { status: 'ok' as const, timestamp: Date.now() },
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    },
  );
});
