import { atom, computed } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('auth-store');

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  provider: string;
  createdAt: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
}

export const authStore = atom<AuthState>({
  user: null,
  isLoading: true,
  error: null,
});

export const isAuthenticated = computed(authStore, (state) => !!state.user);
export const currentUser = computed(authStore, (state) => state.user);
export const authLoading = computed(authStore, (state) => state.isLoading);

/**
 * Fetches the current auth state from the server.
 * Call this on app initialization.
 * Returns a cleanup function that clears the session refresh interval.
 */
export async function initAuth(): Promise<() => void> {
  let intervalId: ReturnType<typeof setInterval> | null = null;

  try {
    authStore.set({ ...authStore.get(), isLoading: true, error: null });

    const response = await fetch('/api/auth/user');
    const data = (await response.json()) as { user: AuthUser | null };

    authStore.set({ user: data.user, isLoading: false, error: null });

    // Update monitoring identity
    if (data.user) {
      import('~/lib/monitoring').then(({ identifyUser }) =>
        identifyUser({ id: data.user!.id, email: data.user!.email || undefined, name: data.user!.name || undefined }),
      );

      // Enable settings cloud sync
      import('~/lib/persistence/settingsSync').then(({ enableSettingsSync }) => enableSettingsSync());

      // Set up periodic session refresh every 5 minutes
      intervalId = setInterval(
        async () => {
          try {
            const refreshResponse = await fetch('/api/auth/user');
            const refreshData = (await refreshResponse.json()) as { user: AuthUser | null };

            if (!refreshData.user) {
              authStore.set({ user: null, isLoading: false, error: null });

              // Show a toast notification if available in the browser
              if (typeof window !== 'undefined') {
                import('react-toastify').then(({ toast }) => {
                  toast.warning('Your session has expired. Please sign in again.');
                });
              }

              // Clear the interval since the user is no longer authenticated
              if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
              }
            }
          } catch {
            logger.warn('Session refresh check failed');
          }
        },
        5 * 60 * 1000,
      ); // 5 minutes
    }
  } catch (_err) {
    logger.error('Failed to fetch auth state:', _err);
    authStore.set({ user: null, isLoading: false, error: 'Failed to check authentication' });
  }

  return () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

/**
 * Sign up with email and password.
 */
export async function signUp(
  email: string,
  password: string,
): Promise<{ success: boolean; error?: string; confirmEmail?: boolean }> {
  try {
    authStore.set({ ...authStore.get(), isLoading: true, error: null });

    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signup', email, password }),
    });

    const data = (await response.json()) as { error?: string; confirmEmail?: boolean; user?: AuthUser | null };

    if (!response.ok) {
      authStore.set({ ...authStore.get(), isLoading: false, error: data.error ?? null });
      return { success: false, error: data.error };
    }

    if (data.confirmEmail) {
      authStore.set({ ...authStore.get(), isLoading: false });
      return { success: true, confirmEmail: true };
    }

    // Auto-login on signup (if no email confirmation required)
    authStore.set({ user: data.user ?? null, isLoading: false, error: null });

    return { success: true };
  } catch {
    const msg = 'Failed to sign up';
    authStore.set({ ...authStore.get(), isLoading: false, error: msg });

    return { success: false, error: msg };
  }
}

/**
 * Sign in with email and password.
 */
export async function signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    authStore.set({ ...authStore.get(), isLoading: true, error: null });

    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password }),
    });

    const data = (await response.json()) as { error?: string; user?: AuthUser | null };

    if (!response.ok) {
      authStore.set({ ...authStore.get(), isLoading: false, error: data.error ?? null });
      return { success: false, error: data.error };
    }

    authStore.set({ user: data.user ?? null, isLoading: false, error: null });

    return { success: true };
  } catch {
    const msg = 'Failed to sign in';
    authStore.set({ ...authStore.get(), isLoading: false, error: msg });

    return { success: false, error: msg };
  }
}

/**
 * Sign in with OAuth provider (Google, GitHub, etc.)
 */
export async function signInWithOAuth(provider: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'oauth', provider }),
    });

    const data = (await response.json()) as { error?: string; url?: string };

    if (!response.ok) {
      return { success: false, error: data.error };
    }

    // Redirect to OAuth provider
    if (data.url) {
      window.location.href = data.url;
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Failed to start OAuth flow' };
  }
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  try {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });

    authStore.set({ user: null, isLoading: false, error: null });

    // Clear monitoring identity
    import('~/lib/monitoring').then(({ clearUser }) => clearUser());

    // Disable settings cloud sync
    import('~/lib/persistence/settingsSync').then(({ disableSettingsSync }) => disableSettingsSync());
  } catch (_err) {
    logger.error('Failed to sign out:', _err);

    // Clear local state even if server call fails
    authStore.set({ user: null, isLoading: false, error: null });
  }
}
