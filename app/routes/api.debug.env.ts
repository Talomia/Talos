import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';

/**
 * GET /api/debug/env
 *
 * Diagnostic endpoint reporting which env vars are set (without exposing values).
 * Useful for verifying Docker/EasyPanel bindings are correctly passed through.
 */
export const loader = withSecurity(
  async ({ context }: LoaderFunctionArgs) => {
    // Block in production — debug endpoints should never be publicly accessible
    if (process.env.NODE_ENV === 'production') {
      return json({ error: 'Not found' }, { status: 404 });
    }

    const env = (context?.cloudflare?.env || {}) as Record<string, string | undefined>;

    const check = (key: string) => {
      const val = env[key];
      return { set: !!val && val.length > 0, length: val?.length ?? 0 };
    };

    return json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      bindings: {
        SUPABASE_URL: check('SUPABASE_URL'),
        SUPABASE_PUBLISHABLE_KEY: check('SUPABASE_PUBLISHABLE_KEY'),
        OPENAI_API_KEY: check('OPENAI_API_KEY'),
        VAULT_SECRET: check('VAULT_SECRET'),
        RUNNING_IN_DOCKER: check('RUNNING_IN_DOCKER'),
        VITE_SUPABASE_URL: check('VITE_SUPABASE_URL'),
        VITE_SUPABASE_ANON_KEY: check('VITE_SUPABASE_ANON_KEY'),
        GROQ_API_KEY: check('GROQ_API_KEY'),
        ANTHROPIC_API_KEY: check('ANTHROPIC_API_KEY'),
      },
    });
  },
  { requireAuth: true },
);
