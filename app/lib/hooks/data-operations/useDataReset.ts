import { useCallback } from 'react';
import { toast } from 'react-toastify';
import { ImportExportService } from '~/lib/services/importExportService';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DataReset');

interface UseDataResetParams {
  db: IDBDatabase | null | undefined;
  showProgress: (message: string, percent: number) => void;
  setIsResetting: (value: boolean) => void;
  setLastOperation: (op: { type: string; data: any } | null) => void;
  onResetSettings?: () => void;
  onResetChats?: () => void;
}

/**
 * Hook for data reset operations (settings, chats)
 */
export function useDataReset({
  db,
  showProgress,
  setIsResetting,
  setLastOperation,
  onResetSettings,
  onResetChats,
}: UseDataResetParams) {
  /**
   * Reset all settings to default values
   */
  const handleResetSettings = useCallback(async () => {
    setIsResetting(true);

    // Dismiss any existing toast first
    toast.dismiss('progress-toast');

    toast.loading('Resetting settings...', {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast',
    });

    try {
      if (db) {
        // Step 1: Save current settings for potential undo
        showProgress('Backing up current settings', 25);

        const currentSettings = await ImportExportService.exportSettings();
        setLastOperation({ type: 'reset-settings', data: { previous: currentSettings } });

        // Step 2: Reset settings
        showProgress('Resetting settings to defaults', 50);
        await ImportExportService.resetAllSettings(db);

        // Step 3: Complete
        showProgress('Completing reset', 100);

        // Dismiss progress toast before showing success toast
        toast.dismiss('progress-toast');

        toast.success('Settings reset successfully', {
          position: 'bottom-right',
          autoClose: 3000,
        });

        if (onResetSettings) {
          onResetSettings();
        }
      } else {
        // Dismiss progress toast before showing error toast
        toast.dismiss('progress-toast');

        toast.error('Database not available', {
          position: 'bottom-right',
          autoClose: 3000,
        });
      }
    } catch (error) {
      logger.error('Error resetting settings:', error);

      // Dismiss progress toast before showing error toast
      toast.dismiss('progress-toast');

      toast.error(`Failed to reset settings: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        position: 'bottom-right',
        autoClose: 3000,
      });
    } finally {
      setIsResetting(false);
    }
  }, [db, onResetSettings, showProgress, setIsResetting, setLastOperation]);

  /**
   * Reset all chats
   */
  const handleResetChats = useCallback(async () => {
    if (!db) {
      toast.error('Database not available', {
        position: 'bottom-right',
        autoClose: 3000,
      });
      return;
    }

    setIsResetting(true);

    // Dismiss any existing toast first
    toast.dismiss('progress-toast');

    toast.loading('Deleting all chats...', {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast',
    });

    try {
      // Step 1: Save current chats for potential undo
      showProgress('Backing up current chats', 25);

      const currentChats = await ImportExportService.exportAllChats(db);
      setLastOperation({ type: 'reset-chats', data: { previous: currentChats } });

      // Step 2: Delete chats
      showProgress('Deleting chats from database', 50);
      await ImportExportService.deleteAllChats(db);

      // Step 3: Complete
      showProgress('Completing deletion', 100);

      // Dismiss progress toast before showing success toast
      toast.dismiss('progress-toast');

      toast.success('All chats deleted successfully', {
        position: 'bottom-right',
        autoClose: 3000,
      });

      if (onResetChats) {
        onResetChats();
      }
    } catch (error) {
      logger.error('Error resetting chats:', error);

      // Dismiss progress toast before showing error toast
      toast.dismiss('progress-toast');

      toast.error(`Failed to delete chats: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        position: 'bottom-right',
        autoClose: 3000,
      });
    } finally {
      setIsResetting(false);
    }
  }, [db, onResetChats, showProgress, setIsResetting, setLastOperation]);

  return {
    handleResetSettings,
    handleResetChats,
  };
}
