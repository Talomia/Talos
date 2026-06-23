import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { readVault, writeVault } from '~/lib/.server/api-key-vault';
import { withSecurity } from '~/lib/security';
import { createScopedLogger } from '~/utils/logger';

const FORBIDDEN_PROVIDER_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

const logger = createScopedLogger('api.keys');

/**
 * GET /api/keys - List which providers have keys set (does NOT return actual keys)
 */
export const loader = withSecurity(async ({ request, context }: LoaderFunctionArgs) => {
  try {
    const cookieHeader = request.headers.get('Cookie');
    const env = (context?.cloudflare?.env as unknown as Record<string, string>) || {};
    const vault = await readVault(cookieHeader, env);

    // Return only provider names, never the actual keys
    const providers = Object.entries(vault.apiKeys)
      .filter(([_, value]) => value && value.length > 0)
      .map(([name]) => ({ name, isSet: true }));

    return json({ providers, updatedAt: vault.updatedAt });
  } catch (error) {
    logger.error('Failed to read vault:', error);
    return json({ providers: [], updatedAt: null }, { status: 500 });
  }
});

/**
 * POST /api/keys - Store or update an API key
 * Body: { provider: string, apiKey: string }
 *
 * DELETE /api/keys - Remove an API key
 * Body: { provider: string }
 */
export const action = withSecurity(
  async ({ request, context }: ActionFunctionArgs) => {
    const env = (context?.cloudflare?.env as unknown as Record<string, string>) || {};

    if (request.method === 'POST') {
      try {
        const body = await request.json<{ provider: string; apiKey: string }>();

        if (!body.provider || typeof body.provider !== 'string' || FORBIDDEN_PROVIDER_NAMES.has(body.provider)) {
          return json({ error: 'Invalid provider' }, { status: 400 });
        }

        const cookieHeader = request.headers.get('Cookie');
        const vault = await readVault(cookieHeader, env);

        vault.apiKeys[body.provider] = body.apiKey || '';
        vault.updatedAt = new Date().toISOString();

        // Remove empty keys
        if (!vault.apiKeys[body.provider]) {
          delete vault.apiKeys[body.provider];
        }

        const setCookie = await writeVault(vault, env);

        return json(
          { success: true, provider: body.provider },
          {
            headers: {
              'Set-Cookie': setCookie,
            },
          },
        );
      } catch (error) {
        logger.error('Failed to store key:', error);
        return json({ error: 'Failed to store key' }, { status: 500 });
      }
    }

    if (request.method === 'DELETE') {
      try {
        const body = await request.json<{ provider: string }>();

        if (!body.provider || typeof body.provider !== 'string' || FORBIDDEN_PROVIDER_NAMES.has(body.provider)) {
          return json({ error: 'Invalid provider' }, { status: 400 });
        }

        const cookieHeader = request.headers.get('Cookie');
        const vault = await readVault(cookieHeader, env);

        delete vault.apiKeys[body.provider];
        vault.updatedAt = new Date().toISOString();

        const setCookie = await writeVault(vault, env);

        return json(
          { success: true, provider: body.provider },
          {
            headers: {
              'Set-Cookie': setCookie,
            },
          },
        );
      } catch (error) {
        logger.error('Failed to delete key:', error);
        return json({ error: 'Failed to delete key' }, { status: 500 });
      }
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  },
  { allowedMethods: ['POST', 'DELETE'] },
);
