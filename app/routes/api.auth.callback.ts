import { type LoaderFunctionArgs, redirect } from '@remix-run/cloudflare';
import { createSupabaseServerClient } from '~/lib/.server/supabase';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.auth.callback');

/**
 * GET /api/auth/callback
 *
 * Handles the OAuth callback from Supabase Auth.
 * Exchanges the authorization code for a session.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/';

  if (!code) {
    logger.error('No code parameter in auth callback');
    return redirect('/?error=auth_callback_missing_code');
  }

  const { supabase, responseHeaders } = createSupabaseServerClient(request, context);

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      logger.error('Code exchange error:', error.message);
      return redirect(`/?error=${encodeURIComponent(error.message)}`);
    }

    return redirect(next, { headers: responseHeaders });
  } catch (error) {
    logger.error('Auth callback error:', error);
    return redirect('/?error=auth_callback_failed');
  }
}
