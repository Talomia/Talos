import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase server client for use in Remix loaders and actions.
 * Handles cookie-based session management for SSR.
 *
 * Usage in a loader/action:
 * ```ts
 * const { supabase, responseHeaders } = createSupabaseServerClient(request, context);
 * const { data: { user } } = await supabase.auth.getUser();
 * return json({ user }, { headers: responseHeaders });
 * ```
 */
export function createSupabaseServerClient(
  request: Request,
  context?: any,
): { supabase: SupabaseClient; responseHeaders: Headers } {
  const responseHeaders = new Headers();
  const env = context?.cloudflare?.env || {};

  const supabaseUrl = env.SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY. ' +
        'Set these in your .env.local or Cloudflare Worker bindings.',
    );
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('Cookie') ?? '').map((c) => ({
          name: c.name,
          value: c.value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          responseHeaders.append('Set-Cookie', serializeCookieHeader(name, value, options)),
        );
      },
    },
  });

  return { supabase, responseHeaders };
}

/**
 * Gets the authenticated user from the request, or null if not authenticated.
 * Uses getUser() (which validates the JWT against the Supabase Auth server)
 * rather than getSession() (which only decodes the JWT locally).
 */
export async function getAuthenticatedUser(request: Request, context?: any) {
  const { supabase, responseHeaders } = createSupabaseServerClient(request, context);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { user: error ? null : user, supabase, responseHeaders };
}

/**
 * Middleware-style function for protecting API routes.
 * Returns the user if authenticated, or throws a 401 Response.
 */
export async function requireAuth(request: Request, context?: any) {
  const { user, supabase, responseHeaders } = await getAuthenticatedUser(request, context);

  if (!user) {
    throw new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(responseHeaders),
      },
    });
  }

  return { user, supabase, responseHeaders };
}

/**
 * Optional auth middleware. Returns the authenticated user if available,
 * or null if auth is not configured or user is not logged in.
 * Unlike requireAuth(), this never rejects — it gracefully degrades.
 */
export async function optionalAuth(
  request: Request,
  context: any,
): Promise<{
  userId: string | null;
  responseHeaders: Headers;
}> {
  try {
    const { user, responseHeaders } = await getAuthenticatedUser(request, context);
    return { userId: user?.id || null, responseHeaders };
  } catch {
    return { userId: null, responseHeaders: new Headers() };
  }
}
