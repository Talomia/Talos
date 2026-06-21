import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { ImportExportService } from '~/lib/services/importExportService';
import { useIndexedDB } from '~/lib/hooks/useIndexedDB';
import { createScopedLogger } from '~/utils/logger';
import { useDataExport } from './data-operations/useDataExport';
import { useDataImport } from './data-operations/useDataImport';
import { useDataReset } from './data-operations/useDataReset';
import { downloadJsonFile } from './data-operations/dataOperationUtils';

const logger = createScopedLogger('DataOperations');

interface UseDataOperationsProps {
  /**
   * Callback to reload settings after import
   */
  onReloadSettings?: () => void;

  /**
   * Callback to reload chats after import
   */
  onReloadChats?: () => void;

  /**
   * Callback to reset settings to defaults
   */
  onResetSettings?: () => void;

  /**
   * Callback to reset chats
   */
  onResetChats?: () => void;

  /**
   * Custom database instance (optional)
   */
  customDb?: IDBDatabase;
}

/**
 * Hook for managing data operations in the DataTab
 */
export function useDataOperations({
  onReloadSettings,
  onReloadChats,
  onResetSettings,
  onResetChats,
  customDb,
}: UseDataOperationsProps = {}) {
  const { db: defaultDb } = useIndexedDB();

  // Use the custom database if provided, otherwise use the default
  const db = customDb || defaultDb;
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [lastOperation, setLastOperation] = useState<{ type: string; data: any } | null>(null);

  /**
   * Show progress toast with percentage
   */
  const showProgress = useCallback((message: string, percent: number) => {
    setProgressMessage(message);
    setProgressPercent(percent);

    // Dismiss any existing progress toast before showing a new one
    toast.dismiss('progress-toast');

    toast.loading(`${message} (${percent}%)`, {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast', // Use the same ID for all progress messages
    });
  }, []);

  // --- Composed sub-hooks ---

  const {
    handleExportSettings,
    handleExportSelectedSettings,
    handleExportAllChats,
    handleExportSelectedChats,
    handleExportAPIKeys,
  } = useDataExport({ db, showProgress, setIsExporting, setLastOperation });

  const { handleImportSettings, handleImportChats, handleImportAPIKeys } = useDataImport({
    db,
    showProgress,
    setIsImporting,
    setLastOperation,
    onReloadSettings,
    onReloadChats,
  });

  const { handleResetSettings, handleResetChats } = useDataReset({
    db,
    showProgress,
    setIsResetting,
    setLastOperation,
    onResetSettings,
    onResetChats,
  });

  // --- Inline handlers (unique to this composition layer) ---

  /**
   * Download API keys template
   */
  const handleDownloadTemplate = useCallback(async () => {
    setIsDownloadingTemplate(true);
    setProgressPercent(0);

    // Dismiss any existing toast first
    toast.dismiss('progress-toast');

    toast.loading('Creating API keys template...', {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast',
    });

    try {
      // Step 1: Create template
      showProgress('Creating template', 50);

      const templateData = ImportExportService.createAPIKeysTemplate();

      // Step 2: Download file
      showProgress('Downloading template', 75);

      downloadJsonFile(templateData, 'app-api-keys-template.json');

      // Step 3: Complete
      showProgress('Completing download', 100);

      // Dismiss progress toast before showing success toast
      toast.dismiss('progress-toast');

      toast.success('Template downloaded successfully', {
        position: 'bottom-right',
        autoClose: 3000,
      });
    } catch (error) {
      logger.error('Error downloading template:', error);

      // Dismiss progress toast before showing error toast
      toast.dismiss('progress-toast');

      toast.error(`Failed to download template: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        position: 'bottom-right',
        autoClose: 3000,
      });
    } finally {
      setIsDownloadingTemplate(false);
      setProgressPercent(0);
      setProgressMessage('');
    }
  }, [showProgress]);

  /**
   * Undo the last operation if possible
   */
  const handleUndo = useCallback(async () => {
    if (!lastOperation || !db) {
      toast.error('Nothing to undo', {
        position: 'bottom-right',
        autoClose: 3000,
      });
      return;
    }

    // Dismiss any existing toast first
    toast.dismiss('progress-toast');

    toast.loading('Processing undo operation...', {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast',
    });

    try {
      switch (lastOperation.type) {
        case 'import-settings': {
          // Restore previous settings
          await ImportExportService.importSettings(lastOperation.data.previous);

          // Dismiss progress toast before showing success toast
          toast.dismiss('progress-toast');

          toast.success('Operation undone successfully', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          if (onReloadSettings) {
            onReloadSettings();
          }

          break;
        }

        case 'import-chats': {
          // Delete imported chats and restore previous state
          await ImportExportService.deleteAllChats(db);

          // Reimport previous chats
          const transaction = db.transaction(['chats'], 'readwrite');
          const store = transaction.objectStore('chats');

          for (const chat of lastOperation.data.previous.chats) {
            store.put(chat);
          }

          await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = reject;
          });

          // Dismiss progress toast before showing success toast
          toast.dismiss('progress-toast');

          toast.success('Operation undone successfully', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          if (onReloadChats) {
            onReloadChats();
          }

          break;
        }

        case 'reset-settings': {
          // Restore previous settings
          await ImportExportService.importSettings(lastOperation.data.previous);

          // Dismiss progress toast before showing success toast
          toast.dismiss('progress-toast');

          toast.success('Operation undone successfully', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          if (onReloadSettings) {
            onReloadSettings();
          }

          break;
        }

        case 'reset-chats': {
          // Restore previous chats
          const chatTransaction = db.transaction(['chats'], 'readwrite');
          const chatStore = chatTransaction.objectStore('chats');

          for (const chat of lastOperation.data.previous.chats) {
            chatStore.put(chat);
          }

          await new Promise((resolve, reject) => {
            chatTransaction.oncomplete = resolve;
            chatTransaction.onerror = reject;
          });

          // Dismiss progress toast before showing success toast
          toast.dismiss('progress-toast');

          toast.success('Operation undone successfully', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          if (onReloadChats) {
            onReloadChats();
          }

          break;
        }

        case 'import-api-keys': {
          // Restore previous API keys via encrypted vault
          const previousAPIKeys = lastOperation.data.previous;
          await ImportExportService.importAPIKeys(previousAPIKeys);

          // Dismiss progress toast before showing success toast
          toast.dismiss('progress-toast');

          toast.success('API keys restored successfully', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          if (onReloadSettings) {
            onReloadSettings();
          }

          break;
        }

        default:
          // Dismiss progress toast before showing error toast
          toast.dismiss('progress-toast');

          toast.error('Cannot undo this operation', {
            position: 'bottom-right',
            autoClose: 3000,
          });
      }

      // Clear the last operation after undoing
      setLastOperation(null);
    } catch (error) {
      logger.error('Error undoing operation:', error);

      // Dismiss progress toast before showing error toast
      toast.dismiss('progress-toast');

      toast.error(`Failed to undo: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        position: 'bottom-right',
        autoClose: 3000,
      });
    }
  }, [lastOperation, db, onReloadSettings, onReloadChats]);

  return {
    isExporting,
    isImporting,
    isResetting,
    isDownloadingTemplate,
    progressMessage,
    progressPercent,
    lastOperation,
    handleExportSettings,
    handleExportSelectedSettings,
    handleExportAllChats,
    handleExportSelectedChats,
    handleImportSettings,
    handleImportChats,
    handleImportAPIKeys,
    handleResetSettings,
    handleResetChats,
    handleDownloadTemplate,
    handleExportAPIKeys,
    handleUndo,
  };
}
