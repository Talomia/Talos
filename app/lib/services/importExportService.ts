/**
 * Facade module for backward compatibility.
 * Re-exports all import/export functionality from focused sub-modules.
 *
 * Consumers should prefer importing directly from the specific modules:
 * - ~/lib/services/chatExportService
 * - ~/lib/services/settingsExportService
 * - ~/lib/services/apiKeyService
 * - ~/lib/services/storageHelpers
 */

// Chat export operations
export { exportAllChats, deleteAllChats } from '~/lib/services/chatExportService';

// Settings import/export operations
export { exportSettings, importSettings, resetAllSettings } from '~/lib/services/settingsExportService';

// API key management
export { importAPIKeys, createAPIKeysTemplate } from '~/lib/services/apiKeyService';

// Storage helpers (previously private, now available for direct use)
export {
  safeGetItem,
  safeSetItem,
  safeSetCookie,
  getAllLocalStorage,
  getGitHubConnections,
  getChatSnapshots,
} from '~/lib/services/storageHelpers';

// Direct imports for the class facade
import { exportAllChats as _exportAllChats, deleteAllChats as _deleteAllChats } from '~/lib/services/chatExportService';
import {
  exportSettings as _exportSettings,
  importSettings as _importSettings,
  resetAllSettings as _resetAllSettings,
} from '~/lib/services/settingsExportService';
import {
  importAPIKeys as _importAPIKeys,
  createAPIKeysTemplate as _createAPIKeysTemplate,
} from '~/lib/services/apiKeyService';

/**
 * @deprecated Use the individual exported functions directly instead of ImportExportService.
 * This class is preserved only for backward compatibility.
 *
 * Service for handling import and export operations of application data
 */
export class ImportExportService {
  static exportAllChats = _exportAllChats;
  static deleteAllChats = _deleteAllChats;
  static exportSettings = _exportSettings;
  static importSettings = _importSettings;
  static resetAllSettings = _resetAllSettings;
  static importAPIKeys = _importAPIKeys;
  static createAPIKeysTemplate = _createAPIKeysTemplate;
}
