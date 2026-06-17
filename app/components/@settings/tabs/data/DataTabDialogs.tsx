import { ConfirmationDialog, SelectionDialog } from '~/components/ui/Dialog';
import type { ChatItem } from '~/components/@settings/tabs/data/dataTabTypes';
import { SETTINGS_CATEGORIES } from '~/components/@settings/tabs/data/dataTabTypes';

export interface DataTabDialogsProps {
  /** Reset settings confirmation dialog */
  showResetInlineConfirm: boolean;
  onCloseResetConfirm: () => void;
  isResetting: boolean;
  onResetSettings: () => void;

  /** Delete chats confirmation dialog */
  showDeleteInlineConfirm: boolean;
  onCloseDeleteConfirm: () => void;
  isDeleting: boolean;
  onDeleteChats: () => void;

  /** Settings selection dialog */
  showSettingsSelection: boolean;
  onCloseSettingsSelection: () => void;
  onExportSelectedSettings: (selectedIds: string[]) => void;

  /** Chats selection dialog */
  showChatsSelection: boolean;
  onCloseChatsSelection: () => void;
  chatItems: ChatItem[];
  onExportSelectedChats: (selectedIds: string[]) => void;
}

export function DataTabDialogs({
  showResetInlineConfirm,
  onCloseResetConfirm,
  isResetting,
  onResetSettings,
  showDeleteInlineConfirm,
  onCloseDeleteConfirm,
  isDeleting,
  onDeleteChats,
  showSettingsSelection,
  onCloseSettingsSelection,
  onExportSelectedSettings,
  showChatsSelection,
  onCloseChatsSelection,
  chatItems,
  onExportSelectedChats,
}: DataTabDialogsProps) {
  return (
    <>
      {/* Reset Settings Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showResetInlineConfirm}
        onClose={onCloseResetConfirm}
        title="Reset All Settings?"
        description="This will reset all your settings to their default values. This action cannot be undone."
        confirmLabel="Reset Settings"
        cancelLabel="Cancel"
        variant="destructive"
        isLoading={isResetting}
        onConfirm={onResetSettings}
      />

      {/* Delete Chats Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteInlineConfirm}
        onClose={onCloseDeleteConfirm}
        title="Delete All Chats?"
        description="This will permanently delete all your chat history. This action cannot be undone."
        confirmLabel="Delete All"
        cancelLabel="Cancel"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={onDeleteChats}
      />

      {/* Settings Selection Dialog */}
      <SelectionDialog
        isOpen={showSettingsSelection}
        onClose={onCloseSettingsSelection}
        title="Select Settings to Export"
        items={SETTINGS_CATEGORIES}
        onConfirm={(selectedIds) => {
          onExportSelectedSettings(selectedIds);
          onCloseSettingsSelection();
        }}
        confirmLabel="Export Selected"
      />

      {/* Chats Selection Dialog */}
      <SelectionDialog
        isOpen={showChatsSelection}
        onClose={onCloseChatsSelection}
        title="Select Chats to Export"
        items={chatItems}
        onConfirm={(selectedIds) => {
          onExportSelectedChats(selectedIds);
          onCloseChatsSelection();
        }}
        confirmLabel="Export Selected"
      />
    </>
  );
}
