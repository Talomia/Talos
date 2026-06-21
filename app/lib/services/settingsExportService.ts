import Cookies from 'js-cookie';
import { getAllChats, deleteChat } from '~/lib/persistence/db';
import { createScopedLogger } from '~/utils/logger';
import { STORAGE_KEYS } from '~/lib/app-config';
import {
  safeGetItem,
  safeSetItem,
  safeSetCookie,
  getAllLocalStorage,
  getGitHubConnections,
  getChatSnapshots,
} from '~/lib/services/storageHelpers';

const logger = createScopedLogger('SettingsExportService');

/**
 * Export application settings to a JSON file
 * @returns A promise that resolves to the settings data
 */
export async function exportSettings(): Promise<Record<string, unknown>> {
  try {
    // Get all cookies
    const allCookies = Cookies.get();

    // Create a comprehensive settings object
    return {
      // Core settings
      core: {
        // User profile and main settings
        user_profile: safeGetItem(STORAGE_KEYS.userProfile),
        settings: safeGetItem('app_settings'),
        profile: safeGetItem(STORAGE_KEYS.profile),
        theme: safeGetItem('theme'),
      },

      // Provider settings (both local and cloud)
      providers: {
        // Provider configurations from localStorage
        provider_settings: safeGetItem('provider_settings'),

        // NOTE: API keys are NOT exported — they are stored in an encrypted vault
        // and must be re-entered manually after import for security.

        // Selected provider and model
        selectedModel: allCookies.selectedModel,
        selectedProvider: allCookies.selectedProvider,

        // Provider-specific settings
        providers: allCookies.providers,
      },

      // Feature settings
      features: {
        // Feature flags
        viewed_features: safeGetItem('viewed_features'),
        developer_mode: safeGetItem('developer_mode'),

        // Context optimization
        contextOptimizationEnabled: safeGetItem('contextOptimizationEnabled'),

        // Auto-select template
        autoSelectTemplate: safeGetItem('autoSelectTemplate'),

        // Latest branch
        isLatestBranch: safeGetItem('isLatestBranch'),

        // Event logs
        isEventLogsEnabled: safeGetItem('isEventLogsEnabled'),
      },

      // UI configuration
      ui: {
        // Tab configuration (localStorage only — no cookie needed)
        tab_configuration: safeGetItem(STORAGE_KEYS.tabConfiguration),

        // Prompt settings
        promptId: safeGetItem('promptId'),
        cachedPrompt: allCookies.cachedPrompt,
      },

      // Connections
      connections: {
        // Netlify connection
        netlify_connection: safeGetItem('netlify_connection'),

        // GitHub connections
        ...getGitHubConnections(allCookies),
      },

      // Debug and logs
      debug: {
        // Debug settings
        isDebugEnabled: allCookies.isDebugEnabled,
        acknowledged_debug_issues: safeGetItem('acknowledged_debug_issues'),
        acknowledged_connection_issue: safeGetItem('acknowledged_connection_issue'),

        // Error logs
        error_logs: safeGetItem('error_logs'),
        read_logs: safeGetItem(STORAGE_KEYS.readLogs),

        // Event logs
        eventLogs: allCookies.eventLogs,
      },

      // Update settings
      updates: {
        update_settings: safeGetItem('update_settings'),
        last_acknowledged_update: safeGetItem('last_acknowledged_version'),
      },

      // Chat snapshots (for chat history)
      chatSnapshots: getChatSnapshots(),

      // Raw data (for debugging and complete backup)
      _raw: {
        localStorage: getAllLocalStorage(),
        cookies: allCookies,
      },

      // Export metadata
      _meta: {
        exportDate: new Date().toISOString(),
        version: '2.0',
        appVersion: process.env.NEXT_PUBLIC_VERSION || 'unknown',
      },
    };
  } catch (error) {
    logger.error('Error exporting settings:', error);
    throw error;
  }
}

// Internal interface for settings data with known top-level keys
interface SettingsData {
  _meta?: { version?: string };
  core?: Record<string, unknown>;
  providers?: Record<string, unknown>;
  features?: Record<string, unknown>;
  ui?: Record<string, unknown>;
  connections?: Record<string, unknown>;
  debug?: Record<string, unknown>;
  updates?: Record<string, unknown>;
  chatSnapshots?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Import settings from a JSON file
 * @param importedData The imported data
 */
export async function importSettings(importedData: SettingsData): Promise<void> {
  // Check if this is the new comprehensive format (v2.0)
  const isNewFormat = importedData._meta?.version === '2.0';

  if (isNewFormat) {
    // Import using the new comprehensive format
    await importComprehensiveFormat(importedData);
  } else {
    // Try to handle older formats
    await importLegacyFormat(importedData);
  }
}

/**
 * Reset all settings to default values
 * @param db The IndexedDB database instance
 */
export async function resetAllSettings(db: IDBDatabase): Promise<void> {
  // 1. Clear all localStorage items related to application settings
  const localStorageKeysToPreserve: string[] = ['debug_mode']; // Keys to preserve if needed

  // Get all localStorage keys
  const allLocalStorageKeys = Object.keys(localStorage);

  // Clear all localStorage items except those to preserve
  allLocalStorageKeys.forEach((key) => {
    if (!localStorageKeysToPreserve.includes(key)) {
      try {
        localStorage.removeItem(key);
      } catch (err) {
        logger.error(`Error removing localStorage item ${key}:`, err);
      }
    }
  });

  // 2. Clear all cookies related to application settings
  const cookiesToPreserve: string[] = []; // Cookies to preserve if needed

  // Get all cookies
  const allCookies = Cookies.get();
  const cookieKeys = Object.keys(allCookies);

  // Clear all cookies except those to preserve
  cookieKeys.forEach((key) => {
    if (!cookiesToPreserve.includes(key)) {
      try {
        Cookies.remove(key);
      } catch (err) {
        logger.error(`Error removing cookie ${key}:`, err);
      }
    }
  });

  // 3. Clear all data from IndexedDB
  if (!db) {
    logger.warn('Database not initialized, skipping IndexedDB reset');
  } else {
    // Get all chats and delete them
    const chats = await getAllChats(db);

    const deletePromises = chats.map((chat) => deleteChat(db, chat.id));
    await Promise.all(deletePromises);
  }

  // 4. Clear any chat snapshots
  const snapshotKeys = Object.keys(localStorage).filter((key) => key.startsWith('snapshot:'));
  snapshotKeys.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      logger.error(`Error removing snapshot ${key}:`, err);
    }
  });
}

/**
 * Import settings from a comprehensive format
 * @param data The imported data
 */
async function importComprehensiveFormat(data: SettingsData): Promise<void> {
  // Import core settings
  if (data.core) {
    Object.entries(data.core).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        try {
          safeSetItem(key, value);
        } catch (err) {
          logger.error(`Error importing core setting ${key}:`, err);
        }
      }
    });
  }

  // Import provider settings
  if (data.providers) {
    // Import provider_settings to localStorage
    if (data.providers.provider_settings) {
      try {
        safeSetItem('provider_settings', data.providers.provider_settings);
      } catch (err) {
        logger.error('Error importing provider settings:', err);
      }
    }

    // Import provider cookies (skip apiKeys — keys must be re-entered via UI for vault storage)
    const providerCookies = ['selectedModel', 'selectedProvider', 'providers'];
    providerCookies.forEach((key) => {
      if (data.providers?.[key]) {
        try {
          safeSetCookie(key, data.providers[key]);
        } catch (err) {
          logger.error(`Error importing provider cookie ${key}:`, err);
        }
      }
    });
  }

  // Import feature settings
  if (data.features) {
    Object.entries(data.features).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        try {
          safeSetItem(key, value);
        } catch (err) {
          logger.error(`Error importing feature setting ${key}:`, err);
        }
      }
    });
  }

  // Import UI configuration
  if (data.ui) {
    // Import localStorage UI settings
    if (data.ui.tab_configuration) {
      try {
        safeSetItem(STORAGE_KEYS.tabConfiguration, data.ui.tab_configuration);
      } catch (err) {
        logger.error('Error importing tab configuration:', err);
      }
    }

    if (data.ui.promptId) {
      try {
        safeSetItem('promptId', data.ui.promptId);
      } catch (err) {
        logger.error('Error importing prompt ID:', err);
      }
    }

    // Import UI cookies
    const uiCookies = ['cachedPrompt'];
    uiCookies.forEach((key) => {
      if (data.ui?.[key]) {
        try {
          safeSetCookie(key, data.ui[key]);
        } catch (err) {
          logger.error(`Error importing UI cookie ${key}:`, err);
        }
      }
    });
  }

  // Import connections
  if (data.connections) {
    // Import Netlify connection
    if (data.connections.netlify_connection) {
      try {
        safeSetItem('netlify_connection', data.connections.netlify_connection);
      } catch (err) {
        logger.error('Error importing Netlify connection:', err);
      }
    }

    // Import GitHub connections
    Object.entries(data.connections).forEach(([key, value]) => {
      if (key.startsWith('github_') && value !== null && value !== undefined) {
        try {
          safeSetItem(key, value);
        } catch (err) {
          logger.error(`Error importing GitHub connection ${key}:`, err);
        }
      }
    });
  }

  // Import debug settings
  if (data.debug) {
    // Import debug localStorage settings
    const debugLocalStorageKeys = [
      'acknowledged_debug_issues',
      'acknowledged_connection_issue',
      'error_logs',
      STORAGE_KEYS.readLogs,
    ];

    debugLocalStorageKeys.forEach((key) => {
      if (data.debug?.[key] !== null && data.debug?.[key] !== undefined) {
        try {
          safeSetItem(key, data.debug[key]);
        } catch (err) {
          logger.error(`Error importing debug setting ${key}:`, err);
        }
      }
    });

    // Import debug cookies
    const debugCookies = ['isDebugEnabled', 'eventLogs'];
    debugCookies.forEach((key) => {
      if (data.debug?.[key]) {
        try {
          safeSetCookie(key, data.debug[key]);
        } catch (err) {
          logger.error(`Error importing debug cookie ${key}:`, err);
        }
      }
    });
  }

  // Import update settings
  if (data.updates) {
    if (data.updates.update_settings) {
      try {
        safeSetItem('update_settings', data.updates.update_settings);
      } catch (err) {
        logger.error('Error importing update settings:', err);
      }
    }

    if (data.updates.last_acknowledged_update) {
      try {
        safeSetItem('last_acknowledged_version', data.updates.last_acknowledged_update);
      } catch (err) {
        logger.error('Error importing last acknowledged update:', err);
      }
    }
  }

  // Import chat snapshots
  if (data.chatSnapshots) {
    Object.entries(data.chatSnapshots).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        try {
          safeSetItem(key, value);
        } catch (err) {
          logger.error(`Error importing chat snapshot ${key}:`, err);
        }
      }
    });
  }
}

/**
 * Import settings from a legacy format
 * @param data The imported data
 */
async function importLegacyFormat(data: SettingsData): Promise<void> {
  /**
   * Handle legacy format (v1.0 or earlier)
   * This is a simplified version that tries to import whatever is available
   */

  // Try to import settings directly
  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      // Skip metadata fields
      if (key === 'exportDate' || key === 'version' || key === 'appVersion') {
        return;
      }

      try {
        // Try to determine if this should be a cookie or localStorage item
        const isCookie = [
          'apiKeys',
          'selectedModel',
          'selectedProvider',
          'providers',
          'tabConfiguration', // legacy: kept for backward compat import only
          'cachedPrompt',
          'isDebugEnabled',
          'eventLogs',
        ].includes(key);

        if (isCookie) {
          safeSetCookie(key, value);
        } else {
          safeSetItem(key, value);
        }
      } catch (err) {
        logger.error(`Error importing legacy setting ${key}:`, err);
      }
    }
  });
}
