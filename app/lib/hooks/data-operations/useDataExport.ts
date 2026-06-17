import { useCallback } from 'react';
import { toast } from 'react-toastify';
import { ImportExportService } from '~/lib/services/importExportService';
import { createScopedLogger } from '~/utils/logger';
import { downloadJsonFile } from './dataOperationUtils';

const logger = createScopedLogger('DataExport');

interface UseDataExportParams {
  db: IDBDatabase | null | undefined;
  showProgress: (message: string, percent: number) => void;
  setIsExporting: (value: boolean) => void;
  setLastOperation: (op: { type: string; data: any } | null) => void;
}

/**
 * Hook for data export operations (settings, chats, API keys)
 */
export function useDataExport({ db, showProgress, setIsExporting, setLastOperation }: UseDataExportParams) {
  /**
   * Export all settings to a JSON file
   */
  const handleExportSettings = useCallback(async () => {
    setIsExporting(true);

    // Dismiss any existing toast first
    toast.dismiss('progress-toast');

    toast.loading('Preparing settings export...', {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast',
    });

    try {
      // Step 1: Export settings
      showProgress('Exporting settings', 25);

      const settingsData = await ImportExportService.exportSettings();

      // Step 2: Create blob
      showProgress('Creating file', 50);

      // Step 3: Download file
      showProgress('Downloading file', 75);

      downloadJsonFile(settingsData, 'bolt-settings.json');

      // Step 4: Complete
      showProgress('Completing export', 100);

      // Dismiss progress toast before showing success toast
      toast.dismiss('progress-toast');

      toast.success('Settings exported successfully', {
        position: 'bottom-right',
        autoClose: 3000,
      });

      // Save operation for potential undo
      setLastOperation({ type: 'export-settings', data: settingsData });
    } catch (error) {
      logger.error('Error exporting settings:', error);

      // Dismiss progress toast before showing error toast
      toast.dismiss('progress-toast');

      toast.error(`Failed to export settings: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        position: 'bottom-right',
        autoClose: 3000,
      });
    } finally {
      setIsExporting(false);
    }
  }, [showProgress, setIsExporting, setLastOperation]);

  /**
   * Export selected settings categories to a JSON file
   * @param categoryIds Array of category IDs to export
   */
  const handleExportSelectedSettings = useCallback(
    async (categoryIds: string[]) => {
      if (!categoryIds || categoryIds.length === 0) {
        toast.error('No settings categories selected', {
          position: 'bottom-right',
          autoClose: 3000,
        });
        return;
      }

      setIsExporting(true);

      // Dismiss any existing toast first
      toast.dismiss('progress-toast');

      toast.loading(`Preparing export of ${categoryIds.length} settings categories...`, {
        position: 'bottom-right',
        autoClose: 3000,
        toastId: 'progress-toast',
      });

      try {
        // Step 1: Export all settings
        showProgress('Exporting settings', 20);

        const allSettings = await ImportExportService.exportSettings();

        // Step 2: Filter settings by category
        showProgress('Filtering selected categories', 40);

        const filteredSettings: Record<string, any> = {
          exportDate: allSettings.exportDate,
        };

        // Add selected categories to filtered settings
        categoryIds.forEach((category) => {
          if (allSettings[category]) {
            filteredSettings[category] = allSettings[category];
          }
        });

        // Step 3: Create blob
        showProgress('Creating file', 60);

        // Step 4: Download file
        showProgress('Downloading file', 80);

        downloadJsonFile(filteredSettings, `bolt-settings-${categoryIds.join('-')}.json`);

        // Step 5: Complete
        showProgress('Completing export', 100);

        // Dismiss progress toast before showing success toast
        toast.dismiss('progress-toast');

        toast.success(`${categoryIds.length} settings categories exported successfully`, {
          position: 'bottom-right',
          autoClose: 3000,
        });

        // Save operation for potential undo
        setLastOperation({
          type: 'export-selected-settings',
          data: { settings: filteredSettings, categories: categoryIds },
        });
      } catch (error) {
        logger.error('Error exporting selected settings:', error);

        // Dismiss progress toast before showing error toast
        toast.dismiss('progress-toast');

        toast.error(`Failed to export settings: ${error instanceof Error ? error.message : 'Unknown error'}`, {
          position: 'bottom-right',
          autoClose: 3000,
        });
      } finally {
        setIsExporting(false);
      }
    },
    [showProgress, setIsExporting, setLastOperation],
  );

  /**
   * Export all chats to a JSON file
   */
  const handleExportAllChats = useCallback(async () => {
    if (!db) {
      toast.error('Database not available', {
        position: 'bottom-right',
        autoClose: 3000,
      });
      return;
    }

    setIsExporting(true);

    // Dismiss any existing toast first
    toast.dismiss('progress-toast');

    toast.loading('Preparing chats export...', {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast',
    });

    try {
      // Step 1: Export chats
      showProgress('Retrieving chats from database', 25);

      // Direct database query approach for more reliable access
      const directChats = await new Promise<any[]>((resolve, reject) => {
        try {
          const transaction = db.transaction(['chats'], 'readonly');
          const store = transaction.objectStore('chats');
          const request = store.getAll();

          request.onsuccess = () => {
            resolve(request.result || []);
          };

          request.onerror = () => {
            logger.error('Error querying chats store:', request.error);
            reject(request.error);
          };
        } catch (err) {
          logger.error('Error creating transaction:', err);
          reject(err);
        }
      });

      // Export data with direct chats
      const exportData = {
        chats: directChats,
        exportDate: new Date().toISOString(),
      };

      // Step 2: Create blob
      showProgress('Creating file', 50);

      // Step 3: Download file
      showProgress('Downloading file', 75);

      downloadJsonFile(exportData, 'bolt-chats.json');

      // Step 4: Complete
      showProgress('Completing export', 100);

      // Dismiss progress toast before showing success toast
      toast.dismiss('progress-toast');

      toast.success(`${exportData.chats.length} chats exported successfully`, {
        position: 'bottom-right',
        autoClose: 3000,
      });

      // Save operation for potential undo
      setLastOperation({ type: 'export-chats', data: exportData });
    } catch (error) {
      logger.error('Error exporting chats:', error);

      // Dismiss progress toast before showing error toast
      toast.dismiss('progress-toast');

      toast.error(`Failed to export chats: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        position: 'bottom-right',
        autoClose: 3000,
      });
    } finally {
      setIsExporting(false);
    }
  }, [db, showProgress, setIsExporting, setLastOperation]);

  /**
   * Export selected chats to a JSON file
   * @param chatIds Array of chat IDs to export
   */
  const handleExportSelectedChats = useCallback(
    async (chatIds: string[]) => {
      if (!db) {
        toast.error('Database not available', {
          position: 'bottom-right',
          autoClose: 3000,
        });
        return;
      }

      if (!chatIds || chatIds.length === 0) {
        toast.error('No chats selected', {
          position: 'bottom-right',
          autoClose: 3000,
        });
        return;
      }

      setIsExporting(true);

      // Dismiss any existing toast first
      toast.dismiss('progress-toast');

      toast.loading(`Preparing export of ${chatIds.length} chats...`, {
        position: 'bottom-right',
        autoClose: 3000,
        toastId: 'progress-toast',
      });

      try {
        // Step 1: Get chats from database
        showProgress('Retrieving chats from database', 25);

        const transaction = db.transaction(['chats'], 'readonly');
        const store = transaction.objectStore('chats');

        // Create an array to store the promises for getting each chat
        const chatPromises = chatIds.map((chatId) => {
          return new Promise<any>((resolve, reject) => {
            const request = store.get(chatId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        });

        // Wait for all promises to resolve
        const chats = await Promise.all(chatPromises);
        const filteredChats = chats.filter(Boolean); // Remove any null/undefined results

        // Create export data
        const exportData = {
          chats: filteredChats,
          exportDate: new Date().toISOString(),
        };

        // Step 2: Create blob
        showProgress('Creating file', 50);

        // Step 3: Download file
        showProgress('Downloading file', 75);

        downloadJsonFile(exportData, 'bolt-selected-chats.json');

        // Step 4: Complete
        showProgress('Completing export', 100);

        // Dismiss progress toast before showing success toast
        toast.dismiss('progress-toast');

        toast.success(`${filteredChats.length} chats exported successfully`, {
          position: 'bottom-right',
          autoClose: 3000,
        });

        // Save operation for potential undo
        setLastOperation({ type: 'export-selected-chats', data: { chatIds, chats: filteredChats } });
      } catch (error) {
        logger.error('Error exporting selected chats:', error);

        // Dismiss progress toast before showing error toast
        toast.dismiss('progress-toast');

        toast.error(`Failed to export selected chats: ${error instanceof Error ? error.message : 'Unknown error'}`, {
          position: 'bottom-right',
          autoClose: 3000,
        });
      } finally {
        setIsExporting(false);
      }
    },
    [db, showProgress, setIsExporting, setLastOperation],
  );

  /**
   * Export API keys to a JSON file
   */
  const handleExportAPIKeys = useCallback(async () => {
    setIsExporting(true);

    // Dismiss any existing toast first
    toast.dismiss('progress-toast');

    toast.loading('Exporting API keys...', {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast',
    });

    try {
      // Step 1: Get API keys from all sources
      showProgress('Retrieving API keys', 25);

      // Create a fetch request to get API keys from server
      const response = await fetch('/api/export-api-keys');

      if (!response.ok) {
        throw new Error('Failed to retrieve API keys from server');
      }

      const apiKeys = await response.json();

      // Step 2: Create blob
      showProgress('Creating file', 50);

      // Step 3: Download file
      showProgress('Downloading file', 75);

      downloadJsonFile(apiKeys, 'bolt-api-keys.json');

      // Step 4: Complete
      showProgress('Completing export', 100);

      // Dismiss progress toast before showing success toast
      toast.dismiss('progress-toast');

      toast.success('API keys exported successfully', {
        position: 'bottom-right',
        autoClose: 3000,
      });

      // Save operation for potential undo
      setLastOperation({ type: 'export-api-keys', data: apiKeys });
    } catch (error) {
      logger.error('Error exporting API keys:', error);

      // Dismiss progress toast before showing error toast
      toast.dismiss('progress-toast');

      toast.error(`Failed to export API keys: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        position: 'bottom-right',
        autoClose: 3000,
      });
    } finally {
      setIsExporting(false);
    }
  }, [showProgress, setIsExporting, setLastOperation]);

  return {
    handleExportSettings,
    handleExportSelectedSettings,
    handleExportAllChats,
    handleExportSelectedChats,
    handleExportAPIKeys,
  };
}
