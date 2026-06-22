import { json } from '@remix-run/cloudflare';

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring, load balancers, and uptime checks.
 * Returns minimal health information — no configuration details.
 */
export async function loader() {
  return json(
    { status: 'ok' as const, timestamp: Date.now() },
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    },
  );
}
