import { atom } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import { STORAGE_KEYS } from '~/lib/app-config';

const logger = createScopedLogger('profile-store');

interface Profile {
  username: string;
  bio: string;
  avatar: string;
}

// Initialize with stored profile or defaults
const storedProfile = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.profile) : null;
let initialProfile: Profile;

try {
  initialProfile = storedProfile
    ? JSON.parse(storedProfile)
    : { username: '', bio: '', avatar: '' };
} catch {
  logger.warn('Failed to parse stored profile, using defaults');
  initialProfile = { username: '', bio: '', avatar: '' };
}

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
        localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(serverProfile));
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
  const previousProfile = profileStore.get();

  profileStore.set({ ...previousProfile, ...updates });

  const current = profileStore.get();

  // Persist to localStorage (immediate, always works)
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(current));
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
    // Revert local state to the pre-update snapshot so the UI doesn't
    // show data that the server never received.
    logger.warn('Failed to sync profile to server — reverting local state');
    profileStore.set(previousProfile);

    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(previousProfile));
    }
  });
};
