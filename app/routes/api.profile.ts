import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { getAuthenticatedUser } from '~/lib/.server/supabase';
import { getProfile, updateProfile } from '~/lib/.server/persistence';
import { withSecurity } from '~/lib/security';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.profile');

/**
 * GET /api/profile — Get the authenticated user's profile
 */
export const loader = withSecurity(async ({ request, context }: LoaderFunctionArgs) => {
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
});

/**
 * POST /api/profile — Update the authenticated user's profile
 * Body: { username?, bio?, avatar_url?, settings? }
 */
export const action = withSecurity(async ({ request, context }: ActionFunctionArgs) => {
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

    // Validate field lengths
    if (body.username && body.username.length > 50) {
      return json({ error: 'Username must be 50 characters or less' }, { status: 400, headers: responseHeaders });
    }

    if (body.bio && body.bio.length > 500) {
      return json({ error: 'Bio must be 500 characters or less' }, { status: 400, headers: responseHeaders });
    }

    await updateProfile(supabase, user.id, body);

    return json({ success: true }, { headers: responseHeaders });
  } catch (error) {
    logger.error('Failed to update profile:', error);
    return json({ error: 'Failed to update profile' }, { status: 500, headers: responseHeaders });
  }
});
