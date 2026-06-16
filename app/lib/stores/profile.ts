import { atom } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('profile-store');

interface Profile {
  username: string;
  bio: string;
  avatar: string;
}

// Initialize with stored profile or defaults
const storedProfile = typeof window !== 'undefined' ? localStorage.getItem('bolt_profile') : null;
const initialProfile: Profile = storedProfile
  ? JSON.parse(storedProfile)
  : {
      username: '',
      bio: '',
      avatar: '',
    };

export const profileStore = atom<Profile>(initialProfile);

/**
 * Initialize the profile store.
 * Fetches profile from server (Supabase) if authenticated,
 * falls back to localStorage for unauthenticated/offline users.
 */
export async function initProfile(): Promise<void> {
  try {
    const response = await fetch('/api/profile');

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { profile: any };

    if (data.profile) {
      const serverProfile: Profile = {
        username: data.profile.username || '',
        bio: data.profile.bio || '',
        avatar: data.profile.avatar_url || '',
      };
      profileStore.set(serverProfile);

      // Update localStorage cache
      if (typeof window !== 'undefined') {
        localStorage.setItem('bolt_profile', JSON.stringify(serverProfile));
      }

      logger.info('Profile loaded from server');
    }
  } catch {
    // Graceful degradation — use localStorage profile
    logger.info('Using local profile (server unavailable)');
  }
}

/**
 * Update the profile both locally and on the server.
 */
export const updateProfile = (updates: Partial<Profile>) => {
  profileStore.set({ ...profileStore.get(), ...updates });

  const current = profileStore.get();

  // Persist to localStorage (immediate, always works)
  if (typeof window !== 'undefined') {
    localStorage.setItem('bolt_profile', JSON.stringify(current));
  }

  // Sync to server in background (non-blocking)
  fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: current.username,
      bio: current.bio,
      avatar_url: current.avatar,
    }),
  }).catch(() => {
    // Silently fail — localStorage is the fallback
    logger.warn('Failed to sync profile to server');
  });
};
