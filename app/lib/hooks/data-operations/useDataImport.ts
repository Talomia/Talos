import { useCallback } from 'react';
import { toast } from 'react-toastify';
import { ImportExportService } from '~/lib/services/importExportService';
import { generateId } from 'ai';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DataImport');

interface UseDataImportParams {
  db: IDBDatabase | null | undefined;
  showProgress: (message: string, percent: number) => void;
  setIsImporting: (value: boolean) => void;
  setLastOperation: (op: { type: string; data: any } | null) => void;
  onReloadSettings?: () => void;
  onReloadChats?: () => void;
}

/**
 * Hook for data import operations (settings, chats, API keys)
 */
export function useDataImport({
  db,
  showProgress,
  setIsImporting,
  setLastOperation,
  onReloadSettings,
  onReloadChats,
}: UseDataImportParams) {
  /**
   * Import settings from a JSON file
   * @param file The file to import
   */
  const handleImportSettings = useCallback(
    async (file: File) => {
      setIsImporting(true);

      // Dismiss any existing toast first
      toast.dismiss('progress-toast');

      toast.loading(`Importing settings from ${file.name}...`, {
        position: 'bottom-right',
        autoClose: 3000,
        toastId: 'progress-toast',
      });

      try {
        // Step 1: Read file
        showProgress('Reading file', 20);

        const fileContent = await file.text();

        // Step 2: Parse JSON
        showProgress('Parsing settings data', 40);

        const importedData = JSON.parse(fileContent);

        // Step 3: Validate data
        showProgress('Validating settings data', 60);

        // Save current settings for potential undo
        const currentSettings = await ImportExportService.exportSettings();
        setLastOperation({ type: 'import-settings', data: { previous: currentSettings } });

        // Step 4: Import settings
        showProgress('Applying settings', 80);
        await ImportExportService.importSettings(importedData);

        // Step 5: Complete
        showProgress('Completing import', 100);

        // Dismiss progress toast before showing success toast
        toast.dismiss('progress-toast');

        toast.success('Settings imported successfully', {
          position: 'bottom-right',
          autoClose: 3000,
        });

        if (onReloadSettings) {
          onReloadSettings();
        }
      } catch (error) {
        logger.error('Error importing settings:', error);

        // Dismiss progress toast before showing error toast
        toast.dismiss('progress-toast');

        toast.error(`Failed to import settings: ${error instanceof Error ? error.message : 'Unknown error'}`, {
          position: 'bottom-right',
          autoClose: 3000,
        });
      } finally {
        setIsImporting(false);
      }
    },
    [onReloadSettings, showProgress, setIsImporting, setLastOperation],
  );

  /**
   * Import chats from a JSON file
   * @param file The file to import
   */
  const handleImportChats = useCallback(
    async (file: File) => {
      if (!db) {
        toast.error('Database not available', {
          position: 'bottom-right',
          autoClose: 3000,
        });
        return;
      }

      setIsImporting(true);

      // Dismiss any existing toast first
      toast.dismiss('progress-toast');

      toast.loading(`Importing chats from ${file.name}...`, {
        position: 'bottom-right',
        autoClose: 3000,
        toastId: 'progress-toast',
      });

      try {
        // Step 1: Read file
        showProgress('Reading file', 20);

        const fileContent = await file.text();

        // Step 2: Parse JSON and validate structure
        showProgress('Parsing chat data', 40);

        const importedData = JSON.parse(fileContent);

        if (!importedData.chats || !Array.isArray(importedData.chats)) {
          throw new Error('Invalid chat data format: missing or invalid chats array');
        }

        // Step 3: Validate each chat object
        showProgress('Validating chat data', 60);

        const validatedChats = importedData.chats.map((chat: any) => {
          if (!chat.id || !Array.isArray(chat.messages)) {
            throw new Error('Invalid chat format: missing required fields');
          }

          // Ensure each message has required fields
          const validatedMessages = chat.messages.map((msg: any) => {
            if (!msg.role || !msg.content) {
              throw new Error('Invalid message format: missing required fields');
            }

            return {
              id: msg.id || generateId(),
              role: msg.role,
              content: msg.content,
              name: msg.name,
              function_call: msg.function_call,
              timestamp: msg.timestamp || Date.now(),
            };
          });

          return {
            id: chat.id,
            description: chat.description || '',
            messages: validatedMessages,
            timestamp: chat.timestamp || new Date().toISOString(),
            urlId: chat.urlId || null,
            metadata: chat.metadata || null,
          };
        });

        // Step 4: Save current chats for potential undo
        showProgress('Preparing database transaction', 70);

        const currentChats = await ImportExportService.exportAllChats(db);
        setLastOperation({ type: 'import-chats', data: { previous: currentChats } });

        // Step 5: Import chats
        showProgress(`Importing ${validatedChats.length} chats`, 80);

        const transaction = db.transaction(['chats'], 'readwrite');
        const store = transaction.objectStore('chats');

        let processed = 0;

        for (const chat of validatedChats) {
          store.put(chat);
          processed++;

          if (processed % 5 === 0 || processed === validatedChats.length) {
            showProgress(
              `Imported ${processed} of ${validatedChats.length} chats`,
              80 + (processed / validatedChats.length) * 20,
            );
          }
        }

        await new Promise((resolve, reject) => {
          transaction.oncomplete = resolve;
          transaction.onerror = reject;
        });

        // Step 6: Complete
        showProgress('Completing import', 100);

        // Dismiss progress toast before showing success toast
        toast.dismiss('progress-toast');

        toast.success(`${validatedChats.length} chats imported successfully`, {
          position: 'bottom-right',
          autoClose: 3000,
        });

        if (onReloadChats) {
          onReloadChats();
        }
      } catch (error) {
        logger.error('Error importing chats:', error);

        // Dismiss progress toast before showing error toast
        toast.dismiss('progress-toast');

        toast.error(`Failed to import chats: ${error instanceof Error ? error.message : 'Unknown error'}`, {
          position: 'bottom-right',
          autoClose: 3000,
        });
      } finally {
        setIsImporting(false);
      }
    },
    [db, onReloadChats, showProgress, setIsImporting, setLastOperation],
  );

  /**
   * Import API keys from a JSON file
   * @param file The file to import
   */
  const handleImportAPIKeys = useCallback(
    async (file: File) => {
      setIsImporting(true);

      // Dismiss any existing toast first
      toast.dismiss('progress-toast');

      toast.loading(`Importing API keys from ${file.name}...`, {
        position: 'bottom-right',
        autoClose: 3000,
        toastId: 'progress-toast',
      });

      try {
        // Step 1: Read file
        showProgress('Reading file', 20);

        const fileContent = await file.text();

        // Step 2: Parse JSON
        showProgress('Parsing API keys data', 40);

        const importedData = JSON.parse(fileContent);

        // Step 3: Validate data
        showProgress('Validating API keys data', 60);

        // Get current API keys from cookies for potential undo
        const apiKeysStr = document.cookie.split(';').find((row) => row.trim().startsWith('apiKeys='));
        const currentApiKeys = apiKeysStr ? JSON.parse(decodeURIComponent(apiKeysStr.split('=')[1])) : {};
        setLastOperation({ type: 'import-api-keys', data: { previous: currentApiKeys } });

        // Step 4: Import API keys
        showProgress('Applying API keys', 80);

        const newKeys = ImportExportService.importAPIKeys(importedData);
        const apiKeysJson = JSON.stringify(newKeys);
        document.cookie = `apiKeys=${apiKeysJson}; path=/; max-age=31536000`;

        // Step 5: Complete
        showProgress('Completing import', 100);

        // Dismiss progress toast before showing success toast
        toast.dismiss('progress-toast');

        // Count how many keys were imported
        const keyCount = Object.keys(newKeys).length;
        const newKeyCount = Object.keys(newKeys).filter(
          (key) => !currentApiKeys[key] || currentApiKeys[key] !== newKeys[key],
        ).length;

        toast.success(
          `${keyCount} API keys imported successfully (${newKeyCount} new/updated)\n` +
            'Note: Keys are stored in browser cookies. For server-side usage, add them to your .env.local file.',
          { position: 'bottom-right', autoClose: 5000 },
        );

        if (onReloadSettings) {
          onReloadSettings();
        }
      } catch (error) {
        logger.error('Error importing API keys:', error);

        // Dismiss progress toast before showing error toast
        toast.dismiss('progress-toast');

        toast.error(`Failed to import API keys: ${error instanceof Error ? error.message : 'Unknown error'}`, {
          position: 'bottom-right',
          autoClose: 3000,
        });
      } finally {
        setIsImporting(false);
      }
    },
    [onReloadSettings, showProgress, setIsImporting, setLastOperation],
  );

  return {
    handleImportSettings,
    handleImportChats,
    handleImportAPIKeys,
  };
}
