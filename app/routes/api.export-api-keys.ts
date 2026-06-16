import type { LoaderFunction } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.export-api-keys');

/**
 * GET /api/export-api-keys
 *
 * SECURITY: This endpoint previously returned raw API keys as plaintext JSON
 * with no authentication. It has been disabled.
 *
 * API keys should be managed through the /api/keys endpoint which uses
 * encrypted server-side storage.
 */
export const loader: LoaderFunction = async () => {
  logger.warn('Blocked attempt to access disabled /api/export-api-keys endpoint');

  return json(
    { error: 'This endpoint has been disabled for security reasons. Use /api/keys instead.' },
    { status: 403 },
  );
};
