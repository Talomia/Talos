import { setSecureCookie } from '~/lib/api/secureCookies';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('StorageHelpers');

/**
 * Safely get an item from localStorage
 * @param key The key to get
 * @returns The value or null if not found
 */
export function safeGetItem(key: string): unknown {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (err) {
    logger.error(`Error getting localStorage item ${key}:`, err);
    return null;
  }
}

/**
 * Safely set an item in localStorage
 * @param key The key to set
 * @param value The value to set
 */
export function safeSetItem(key: string, value: unknown): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    logger.error(`Error setting localStorage item ${key}:`, err);
  }
}

/**
 * Safely set a cookie
 * @param key The key to set
 * @param value The value to set
 */
export function safeSetCookie(key: string, value: unknown): void {
  try {
    setSecureCookie(key, typeof value === 'string' ? value : JSON.stringify(value), { expires: 365 });
  } catch (err) {
    logger.error(`Error setting cookie ${key}:`, err);
  }
}

/**
 * Get all localStorage items
 * @returns All localStorage items
 */
export function getAllLocalStorage(): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      if (key) {
        try {
          const value = localStorage.getItem(key);
          result[key] = value ? JSON.parse(value) : null;
        } catch {
          result[key] = null;
        }
      }
    }
  } catch (err) {
    logger.error('Error getting all localStorage items:', err);
  }

  return result;
}

/**
 * Get GitHub connections from cookies
 * @param _cookies The cookies object
 * @returns GitHub connections
 */
export function getGitHubConnections(_cookies: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Get GitHub connections from localStorage
  const localStorageKeys = Object.keys(localStorage).filter((key) => key.startsWith('github_'));
  localStorageKeys.forEach((key) => {
    try {
      const value = localStorage.getItem(key);
      result[key] = value ? JSON.parse(value) : null;
    } catch (err) {
      logger.error(`Error getting GitHub connection ${key}:`, err);
      result[key] = null;
    }
  });

  return result;
}

/**
 * Get chat snapshots from localStorage
 * @returns Chat snapshots
 */
export function getChatSnapshots(): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Get chat snapshots from localStorage
  const snapshotKeys = Object.keys(localStorage).filter((key) => key.startsWith('snapshot:'));
  snapshotKeys.forEach((key) => {
    try {
      const value = localStorage.getItem(key);
      result[key] = value ? JSON.parse(value) : null;
    } catch (err) {
      logger.error(`Error getting chat snapshot ${key}:`, err);
      result[key] = null;
    }
  });

  return result;
}
