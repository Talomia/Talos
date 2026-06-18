import Cookies from 'js-cookie';
import { getAllChats, deleteChat } from '~/lib/persistence/db';
import { createScopedLogger } from '~/utils/logger';
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
        bolt_user_profile: safeGetItem('bolt_user_profile'),
        bolt_settings: safeGetItem('bolt_settings'),
        bolt_profile: safeGetItem('bolt_profile'),
        theme: safeGetItem('theme'),
      },

      // Provider settings (both local and cloud)
      providers: {
        // Provider configurations from localStorage
        provider_settings: safeGetItem('provider_settings'),

        // API keys from cookies
        apiKeys: allCookies.apiKeys,

        // Selected provider and model
        selectedModel: allCookies.selectedModel,
        selectedProvider: allCookies.selectedProvider,

        // Provider-specific settings
        providers: allCookies.providers,
      },

      // Feature settings
      features: {
        // Feature flags
        viewed_features: safeGetItem('bolt_viewed_features'),
        developer_mode: safeGetItem('bolt_developer_mode'),

        // Context optimization
        contextOptimizationEnabled: safeGetItem('contextOptimizationEnabled'),

        // Auto-select template
        autoSelectTemplate: safeGetItem('autoSelectTemplate'),

        // Latest branch
        isLatestBranch: safeGetItem('isLatestBranch'),

        // Event logs
        isEventLogsEnabled: safeGetItem('isEventLogsEnabled'),

        // Energy saver settings
        energySaverMode: safeGetItem('energySaverMode'),
        autoEnergySaver: safeGetItem('autoEnergySaver'),
      },

      // UI configuration
      ui: {
        // Tab configuration (localStorage only — no cookie needed)
        bolt_tab_configuration: safeGetItem('bolt_tab_configuration'),

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
        acknowledged_debug_issues: safeGetItem('bolt_acknowledged_debug_issues'),
        acknowledged_connection_issue: safeGetItem('bolt_acknowledged_connection_issue'),

        // Error logs
        error_logs: safeGetItem('error_logs'),
        bolt_read_logs: safeGetItem('bolt_read_logs'),

        // Event logs
        eventLogs: allCookies.eventLogs,
      },

      // Update settings
      updates: {
        update_settings: safeGetItem('update_settings'),
        last_acknowledged_update: safeGetItem('bolt_last_acknowledged_version'),
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

    // Import API keys and other provider cookies
    const providerCookies = ['apiKeys', 'selectedModel', 'selectedProvider', 'providers'];
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
    if (data.ui.bolt_tab_configuration) {
      try {
        safeSetItem('bolt_tab_configuration', data.ui.bolt_tab_configuration);
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
      'bolt_acknowledged_debug_issues',
      'bolt_acknowledged_connection_issue',
      'error_logs',
      'bolt_read_logs',
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
        safeSetItem('bolt_last_acknowledged_version', data.updates.last_acknowledged_update);
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
