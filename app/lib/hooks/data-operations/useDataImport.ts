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
        showProgress('Reading file', 10);

        const fileContent = await file.text();

        // Step 2: Parse JSON and validate top-level structure
        showProgress('Parsing chat data', 20);

        let importedData: unknown;

        try {
          importedData = JSON.parse(fileContent);
        } catch {
          toast.dismiss('progress-toast');
          toast.error('Invalid JSON: the file does not contain valid JSON data.', {
            position: 'bottom-right',
            autoClose: 5000,
          });
          return;
        }

        // Validate the parsed data is an object or array
        if (importedData === null || typeof importedData !== 'object') {
          toast.dismiss('progress-toast');
          toast.error('Invalid format: imported data must be a JSON object or array.', {
            position: 'bottom-right',
            autoClose: 5000,
          });
          return;
        }

        // Normalize: if it's an array, wrap it as { chats: [...] }
        const normalizedData = Array.isArray(importedData)
          ? { chats: importedData }
          : (importedData as Record<string, unknown>);

        if (!normalizedData.chats || !Array.isArray(normalizedData.chats)) {
          toast.dismiss('progress-toast');
          toast.error('Invalid chat data format: missing or invalid "chats" array in the imported file.', {
            position: 'bottom-right',
            autoClose: 5000,
          });
          return;
        }

        // Step 3: Validate each chat object
        showProgress('Validating chat data', 30);

        for (let i = 0; i < (normalizedData.chats as any[]).length; i++) {
          const chat = (normalizedData.chats as any[])[i];

          if (!chat || typeof chat !== 'object') {
            toast.dismiss('progress-toast');
            toast.error(`Invalid chat at index ${i}: each chat must be a JSON object.`, {
              position: 'bottom-right',
              autoClose: 5000,
            });
            return;
          }

          if (!chat.id || typeof chat.id !== 'string') {
            toast.dismiss('progress-toast');
            toast.error(`Invalid chat at index ${i}: missing or non-string "id" field.`, {
              position: 'bottom-right',
              autoClose: 5000,
            });
            return;
          }

          if (!Array.isArray(chat.messages)) {
            toast.dismiss('progress-toast');
            toast.error(`Invalid chat "${chat.id}": missing or non-array "messages" field.`, {
              position: 'bottom-right',
              autoClose: 5000,
            });
            return;
          }
        }

        showProgress('Building validated chat objects', 40);

        const validatedChats = (normalizedData.chats as any[]).map((chat: any) => {
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
        showProgress('Preparing database transaction', 50);

        const currentChats = await ImportExportService.exportAllChats(db);
        setLastOperation({ type: 'import-chats', data: { previous: currentChats } });

        // Step 5: Import chats
        showProgress(`Importing ${validatedChats.length} chats`, 60);

        const transaction = db.transaction(['chats'], 'readwrite');
        const store = transaction.objectStore('chats');

        let processed = 0;

        for (const chat of validatedChats) {
          store.put(chat);
          processed++;

          if (processed % 5 === 0 || processed === validatedChats.length) {
            showProgress(
              `Imported ${processed} of ${validatedChats.length} chats`,
              60 + (processed / validatedChats.length) * 20,
            );
          }
        }

        await new Promise((resolve, reject) => {
          transaction.oncomplete = resolve;
          transaction.onerror = reject;
        });

        // Step 6: Import snapshots if present
        const importedSnapshots = (normalizedData as Record<string, unknown>).snapshots;

        if (Array.isArray(importedSnapshots) && importedSnapshots.length > 0 && db.objectStoreNames.contains('snapshots')) {
          showProgress(`Importing ${importedSnapshots.length} snapshots`, 85);

          const snapshotTx = db.transaction(['snapshots'], 'readwrite');
          const snapshotStore = snapshotTx.objectStore('snapshots');

          for (const snapshot of importedSnapshots) {
            if (snapshot && typeof snapshot === 'object') {
              snapshotStore.put(snapshot);
            }
          }

          await new Promise((resolve, reject) => {
            snapshotTx.oncomplete = resolve;
            snapshotTx.onerror = () => {
              logger.warn('Snapshot import failed, continuing:', snapshotTx.error);
              resolve(undefined);
            };
          });
        }

        // Step 7: Complete
        showProgress('Completing import', 100);

        // Dismiss progress toast before showing success toast
        toast.dismiss('progress-toast');

        const snapshotCount = Array.isArray(importedSnapshots) ? importedSnapshots.length : 0;
        const snapshotMsg = snapshotCount > 0 ? ` and ${snapshotCount} snapshots` : '';

        toast.success(`${validatedChats.length} chats${snapshotMsg} imported successfully`, {
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

        // Note: API keys are now stored in the server-side vault, not cookies.
        // Undo is not reliably possible once keys are saved to the vault.
        setLastOperation({ type: 'import-api-keys', data: { previous: null } });

        // Step 4: Import API keys to encrypted vault
        showProgress('Applying API keys', 80);

        const newKeys = await ImportExportService.importAPIKeys(importedData);

        // Step 5: Complete
        showProgress('Completing import', 100);

        // Dismiss progress toast before showing success toast
        toast.dismiss('progress-toast');

        // Count how many keys were imported
        const keyCount = Object.keys(newKeys).length;

        toast.success(
          `${keyCount} API keys imported to encrypted vault successfully.\n` +
            'Keys are securely stored server-side.',
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
