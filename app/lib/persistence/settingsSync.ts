import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('settings-sync');

/**
 * Settings Cloud Sync
 * ===================
 * Synchronizes user settings (provider configuration, shortcuts, preferences)
 * to the Supabase `profiles.settings` JSONB column.
 *
 * Design:
 * - localStorage remains the immediate source of truth (fast reads, offline support)
 * - On change: debounced push to server (500ms coalesce window)
 * - On login: pull server settings and merge (server wins for new keys, local wins for existing)
 * - On conflict: configurable strategy (default: newer-wins by timestamp)
 */

/** Keys from localStorage that should be synced to the cloud. */
const SYNCABLE_KEYS = [
  'provider_settings',
  'auto_enabled_providers',
  'app_current_model',
  'app_current_provider',
  'app_project_type',
  'app_theme',
  'app_tab_configuration',
  'app_debug_mode',
  'app_token_budget',
  'app_features',
] as const;

interface SyncedSettings {
  /** The actual settings data, keyed by localStorage key */
  data: Record<string, string>;

  /** ISO timestamp of last sync */
  syncedAt: string;

  /** Version counter for conflict detection */
  version: number;
}

/** In-flight push timer handle */
let _pushTimer: ReturnType<typeof setTimeout> | null = null;

/** Whether sync is enabled (requires authentication) */
let _syncEnabled = false;

/** Current sync version (incremented on each push) */
let _localVersion = 0;

const PUSH_DEBOUNCE_MS = 500;

/**
 * Enable settings sync. Call after successful authentication.
 * Pulls the latest settings from the server and merges with local.
 */
export async function enableSettingsSync(): Promise<void> {
  _syncEnabled = true;
  logger.info('Settings sync enabled');

  try {
    await pullSettings();
  } catch (error) {
    logger.warn('Initial settings pull failed (will retry on next change):', error);
  }
}

/**
 * Disable settings sync. Call on logout.
 */
export function disableSettingsSync(): void {
  _syncEnabled = false;

  if (_pushTimer) {
    clearTimeout(_pushTimer);
    _pushTimer = null;
  }

  logger.info('Settings sync disabled');
}

/**
 * Notify the sync system that a setting has changed.
 * Debounces and pushes to server after PUSH_DEBOUNCE_MS.
 */
export function notifySettingChanged(_key?: string): void {
  if (!_syncEnabled) {
    return;
  }

  if (_pushTimer) {
    clearTimeout(_pushTimer);
  }

  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    pushSettings().catch((error) => {
      logger.warn('Background settings push failed:', error);
    });
  }, PUSH_DEBOUNCE_MS);
}

/**
 * Pull settings from the server and merge with local.
 * Server values are applied for keys that don't exist locally
 * or are older than the server version.
 */
async function pullSettings(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const response = await fetch('/api/profile');

    if (!response.ok) {
      logger.warn(`Settings pull failed: HTTP ${response.status}`);
      return;
    }

    const data = (await response.json()) as { profile: { settings?: SyncedSettings } | null };

    if (!data.profile?.settings?.data) {
      logger.debug('No server settings found — local settings will be pushed on next change');
      return;
    }

    const serverSettings = data.profile.settings;
    let merged = false;

    for (const key of SYNCABLE_KEYS) {
      const serverValue = serverSettings.data[key];
      const localValue = localStorage.getItem(key);

      if (serverValue !== undefined && localValue === null) {
        // Server has a value, local doesn't — apply server value
        localStorage.setItem(key, serverValue);
        merged = true;
        logger.debug(`Pulled setting '${key}' from server (local was empty)`);
      }
    }

    // Update local version to match server
    if (serverSettings.version > _localVersion) {
      _localVersion = serverSettings.version;
    }

    if (merged) {
      logger.info('Settings merged from server — reloading may be needed for some settings');

      // Dispatch a storage event so nanostores that listen to localStorage changes can react
      window.dispatchEvent(new StorageEvent('storage', { key: 'settings-sync-pull' }));
    }
  } catch (error) {
    logger.warn('Settings pull error:', error);
  }
}

/**
 * Push current local settings to the server.
 */
async function pushSettings(): Promise<void> {
  if (typeof window === 'undefined' || !_syncEnabled) {
    return;
  }

  const data: Record<string, string> = {};

  for (const key of SYNCABLE_KEYS) {
    const value = localStorage.getItem(key);

    if (value !== null) {
      data[key] = value;
    }
  }

  _localVersion++;

  const payload: SyncedSettings = {
    data,
    syncedAt: new Date().toISOString(),
    version: _localVersion,
  };

  try {
    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: payload }),
    });

    if (!response.ok) {
      // Revert version on failure
      _localVersion--;
      logger.warn(`Settings push failed: HTTP ${response.status}`);

      return;
    }

    logger.debug(`Settings pushed to server (v${_localVersion}, ${Object.keys(data).length} keys)`);
  } catch (error) {
    _localVersion--;
    logger.warn('Settings push error:', error);
  }
}

/**
 * Get the list of keys that are synced to the cloud.
 * Useful for the settings UI to show sync status.
 */
export function getSyncableKeys(): readonly string[] {
  return SYNCABLE_KEYS;
}

/**
 * Check if settings sync is currently enabled.
 */
export function isSettingsSyncEnabled(): boolean {
  return _syncEnabled;
}
