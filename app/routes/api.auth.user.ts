import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { getAuthenticatedUser } from '~/lib/.server/supabase';

/**
 * GET /api/auth/user
 *
 * Returns the currently authenticated user, or null.
 * Used by the client to check auth state on page load.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { user, responseHeaders } = await getAuthenticatedUser(request, context);

  if (!user) {
    return json({ user: null }, { headers: responseHeaders });
  }

  return json(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        avatarUrl: user.user_metadata?.avatar_url || null,
        provider: user.app_metadata?.provider || 'email',
        createdAt: user.created_at,
      },
    },
    { headers: responseHeaders },
  );
}
