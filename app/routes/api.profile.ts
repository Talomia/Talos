import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { getAuthenticatedUser } from '~/lib/.server/supabase';
import { getProfile, updateProfile } from '~/lib/.server/persistence';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.profile');

/**
 * GET /api/profile — Get the authenticated user's profile
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { user, supabase, responseHeaders } = await getAuthenticatedUser(request, context);

  if (!user) {
    return json({ profile: null }, { headers: responseHeaders });
  }

  try {
    const profile = await getProfile(supabase, user.id);

    return json({ profile }, { headers: responseHeaders });
  } catch (error) {
    logger.error('Failed to get profile:', error);
    return json({ profile: null }, { status: 500, headers: responseHeaders });
  }
}

/**
 * POST /api/profile — Update the authenticated user's profile
 * Body: { username?, bio?, avatar_url?, settings? }
 */
export async function action({ request, context }: ActionFunctionArgs) {
  const { user, supabase, responseHeaders } = await getAuthenticatedUser(request, context);

  if (!user) {
    return json({ error: 'Authentication required' }, { status: 401, headers: responseHeaders });
  }

  try {
    const body = await request.json<{
      username?: string;
      bio?: string;
      avatar_url?: string;
      settings?: Record<string, any>;
    }>();

    await updateProfile(supabase, user.id, body);

    return json({ success: true }, { headers: responseHeaders });
  } catch (error) {
    logger.error('Failed to update profile:', error);
    return json({ error: 'Failed to update profile' }, { status: 500, headers: responseHeaders });
  }
}
