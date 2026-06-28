import { type LoaderFunctionArgs, redirect } from '@remix-run/cloudflare';
import { createSupabaseServerClient } from '~/lib/.server/supabase';
import { withSecurity } from '~/lib/security';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.auth.callback');

/**
 * Validate redirect target to prevent open redirects.
 * Must start with `/` and must NOT start with `//` (protocol-relative URL).
 */
function sanitizeRedirect(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return '/';
  }

  return next;
}

/**
 * GET /api/auth/callback
 *
 * Handles the OAuth callback from Supabase Auth.
 * Exchanges the authorization code for a session.
 */
async function authCallbackLoader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = sanitizeRedirect(url.searchParams.get('next'));

  if (!code) {
    logger.error('No code parameter in auth callback');
    return redirect('/?error=auth_callback_missing_code');
  }

  const { supabase, responseHeaders } = createSupabaseServerClient(request, context);

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      logger.error('Code exchange error:', error.message);
      return redirect('/?error=auth_code_exchange_failed');
    }

    return redirect(next, { headers: responseHeaders });
  } catch (error) {
    logger.error('Auth callback error:', error);
    return redirect('/?error=auth_callback_failed');
  }
}

export const loader = withSecurity(authCallbackLoader, { allowedMethods: ['GET'] });
