import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { createSupabaseServerClient } from '~/lib/.server/supabase';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.auth');

/**
 * POST /api/auth
 *
 * Handles auth actions: signup, login, logout, oauth
 * Body: { action: string, email?: string, password?: string, provider?: string }
 */
export async function action({ request, context }: ActionFunctionArgs) {
  const { supabase, responseHeaders } = createSupabaseServerClient(request, context);

  const body = await request.json<{
    action: 'signup' | 'login' | 'logout' | 'oauth';
    email?: string;
    password?: string;
    provider?: string;
  }>();

  try {
    switch (body.action) {
      case 'signup': {
        if (!body.email || !body.password) {
          return json({ error: 'Email and password required' }, { status: 400 });
        }

        const { data, error } = await supabase.auth.signUp({
          email: body.email,
          password: body.password,
        });

        if (error) {
          logger.error('Signup error:', error.message);
          return json({ error: error.message }, { status: 400, headers: responseHeaders });
        }

        return json(
          {
            success: true,
            user: data.user,
            confirmEmail: !data.session, // If no session, email confirmation is required
          },
          { headers: responseHeaders },
        );
      }

      case 'login': {
        if (!body.email || !body.password) {
          return json({ error: 'Email and password required' }, { status: 400 });
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: body.email,
          password: body.password,
        });

        if (error) {
          logger.error('Login error:', error.message);
          return json({ error: error.message }, { status: 401, headers: responseHeaders });
        }

        return json({ success: true, user: data.user }, { headers: responseHeaders });
      }

      case 'logout': {
        const { error } = await supabase.auth.signOut();

        if (error) {
          logger.error('Logout error:', error.message);
          return json({ error: error.message }, { status: 500, headers: responseHeaders });
        }

        return json({ success: true }, { headers: responseHeaders });
      }

      case 'oauth': {
        if (!body.provider) {
          return json({ error: 'OAuth provider required' }, { status: 400 });
        }

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: body.provider as any,
          options: {
            redirectTo: `${new URL(request.url).origin}/api/auth/callback`,
          },
        });

        if (error) {
          logger.error('OAuth error:', error.message);
          return json({ error: error.message }, { status: 400, headers: responseHeaders });
        }

        return json({ url: data.url }, { headers: responseHeaders });
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    logger.error('Auth error:', error);
    return json({ error: 'Internal server error' }, { status: 500, headers: responseHeaders });
  }
}
