import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

/**
 * Creates or returns a singleton Supabase browser client.
 * Uses environment variables passed from the server via window.__TALOS_ENV.
 *
 * The env vars must be injected in root.tsx loader and passed to the client.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (browserClient) {
    return browserClient;
  }

  const env = (window as unknown as Record<string, Record<string, string | undefined>>).__TALOS_ENV;

  if (!env?.SUPABASE_URL || !env?.SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }

  browserClient = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);

  return browserClient;
}
