import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { createSupabaseServerClient } from '~/lib/.server/supabase';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.auth');

/**
 * Converts raw Supabase SDK errors into user-friendly messages.
 * When the auth service is unreachable (returns HTML/plain text instead of JSON),
 * the SDK produces a cryptic JSON parse error — this translates it.
 */
function sanitizeSupabaseError(message: string): { userMessage: string; status: number } {
  if (message.includes('Unexpected') && message.includes('JSON')) {
    return { userMessage: 'Authentication service is temporarily unavailable. Please try again later.', status: 503 };
  }

  if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
    return { userMessage: 'Unable to connect to authentication service. Please try again later.', status: 503 };
  }

  return { userMessage: message, status: 0 };
}

/**
 * POST /api/auth
 *
 * Handles auth actions: signup, login, logout, oauth
 * Body: { action: string, email?: string, password?: string, provider?: string }
 */
async function authAction({ request, context }: ActionFunctionArgs) {
  const { supabase, responseHeaders } = createSupabaseServerClient(request, context);

  let body: {
    action: 'signup' | 'login' | 'logout' | 'oauth' | 'reset-password';
    email?: string;
    password?: string;
    provider?: string;
  };

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid or malformed JSON in request body' }, { status: 400 });
  }

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
          const sanitized = sanitizeSupabaseError(error.message);

          return json(
            { error: sanitized.userMessage || 'Registration failed' },
            { status: sanitized.status || 400, headers: responseHeaders },
          );
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
          const sanitized = sanitizeSupabaseError(error.message);

          return json(
            { error: sanitized.userMessage || 'Invalid credentials' },
            { status: sanitized.status || 401, headers: responseHeaders },
          );
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

        const supportedOAuthProviders = ['github', 'google', 'gitlab', 'bitbucket', 'azure'] as const;
        type SupportedProvider = (typeof supportedOAuthProviders)[number];

        if (!supportedOAuthProviders.includes(body.provider as SupportedProvider)) {
          return json({ error: `Unsupported OAuth provider: ${body.provider}` }, { status: 400 });
        }

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: body.provider as SupportedProvider,
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

      case 'reset-password': {
        if (!body.email) {
          return json({ error: 'Email is required' }, { status: 400 });
        }

        const { error } = await supabase.auth.resetPasswordForEmail(body.email, {
          redirectTo: `${new URL(request.url).origin}/api/auth/callback?next=/`,
        });

        if (error) {
          logger.error('Password reset error:', error.message);
          return json(
            { error: 'If that email is registered, a reset link has been sent' },
            { status: 200, headers: responseHeaders },
          );
        }

        return json({ success: true }, { headers: responseHeaders });
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Supabase returns plain text (e.g. "404 page not found") when the auth
    // service is unreachable, which the SDK tries to JSON.parse — producing
    // "Unexpected non-whitespace character after JSON at position X"
    if (message.includes('Unexpected') && message.includes('JSON')) {
      logger.error('Supabase auth service unreachable:', message);

      return json(
        { error: 'Authentication service is temporarily unavailable. Please try again later.' },
        { status: 503, headers: responseHeaders },
      );
    }

    if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
      logger.error('Supabase connection failed:', message);

      return json(
        { error: 'Unable to connect to authentication service. Please try again later.' },
        { status: 503, headers: responseHeaders },
      );
    }

    logger.error('Auth error:', error);

    return json({ error: 'An unexpected error occurred' }, { status: 500, headers: responseHeaders });
  }
}

export const action = withSecurity(authAction, { allowedMethods: ['POST'] });
