import { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent } from '~/components/ui/Card';
import { useDataOperations } from '~/lib/hooks/useDataOperations';
import { getAllChats } from '~/lib/persistence/db';
import { DataVisualization } from '~/components/@settings/tabs/data/DataVisualization';
import { DataActionCard } from '~/components/@settings/tabs/data/DataActionCard';
import { DataTabDialogs } from '~/components/@settings/tabs/data/DataTabDialogs';
import { useHistoryDB } from '~/components/@settings/tabs/data/useHistoryDB';
import { createChatItem, SETTINGS_CATEGORIES } from '~/components/@settings/tabs/data/dataTabTypes';
import type { ExtendedChat, ChatItem } from '~/components/@settings/tabs/data/dataTabTypes';
import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DataTab');

export function DataTab() {
  // Use our custom hook for the history database
  const { db, isLoading: dbLoading } = useHistoryDB();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiKeyFileInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  // State for confirmation dialogs
  const [showResetInlineConfirm, setShowResetInlineConfirm] = useState(false);
  const [showDeleteInlineConfirm, setShowDeleteInlineConfirm] = useState(false);
  const [showSettingsSelection, setShowSettingsSelection] = useState(false);
  const [showChatsSelection, setShowChatsSelection] = useState(false);

  const [availableChats, setAvailableChats] = useState<ExtendedChat[]>([]);
  const [chatItems, setChatItems] = useState<ChatItem[]>([]);

  // Data operations hook with history database
  const {
    isExporting,
    isImporting,
    isResetting,
    isDownloadingTemplate,
    handleExportSettings,
    handleExportSelectedSettings,
    handleExportAllChats,
    handleExportSelectedChats,
    handleImportSettings,
    handleImportChats,
    handleResetSettings,
    handleResetChats,
    handleDownloadTemplate,
    handleImportAPIKeys,
  } = useDataOperations({
    customDb: db || undefined, // Pass the history database, converting null to undefined
    onReloadSettings: () => window.location.reload(),
    onReloadChats: () => {
      // Reload chats after reset
      if (db) {
        getAllChats(db).then((chats) => {
          // Cast to ExtendedChat to handle additional properties
          const extendedChats = chats as ExtendedChat[];
          setAvailableChats(extendedChats);
          setChatItems(extendedChats.map((chat) => createChatItem(chat)));
        });
      }
    },
    onResetSettings: () => setShowResetInlineConfirm(false),
    onResetChats: () => setShowDeleteInlineConfirm(false),
  });

  // Loading states for operations not provided by the hook
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImportingKeys, setIsImportingKeys] = useState(false);

  // Load available chats
  useEffect(() => {
    if (db) {
      logger.debug('Loading chats from history database', {
        name: db.name,
        version: db.version,
        objectStoreNames: Array.from(db.objectStoreNames),
      });

      getAllChats(db)
        .then((chats) => {
          logger.trace('Found chats:', chats.length);

          // Cast to ExtendedChat to handle additional properties
          const extendedChats = chats as ExtendedChat[];
          setAvailableChats(extendedChats);

          // Create ChatItems for selection dialog
          setChatItems(extendedChats.map((chat) => createChatItem(chat)));
        })
        .catch((error) => {
          logger.error('Error loading chats:', error);
          toast.error('Failed to load chats: ' + (error instanceof Error ? error.message : 'Unknown error'));
        });
    }
  }, [db]);

  // Handle file input changes
  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (file) {
        handleImportSettings(file);
      }
    },
    [handleImportSettings],
  );

  const handleAPIKeyFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (file) {
        setIsImportingKeys(true);
        handleImportAPIKeys(file).finally(() => setIsImportingKeys(false));
      }
    },
    [handleImportAPIKeys],
  );

  const handleChatFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (file) {
        handleImportChats(file);
      }
    },
    [handleImportChats],
  );

  // Wrapper for reset chats to handle loading state
  const handleResetChatsWithState = useCallback(() => {
    setIsDeleting(true);
    handleResetChats().finally(() => setIsDeleting(false));
  }, [handleResetChats]);

  // Handler for Export All Chats with validation
  const handleExportAllChatsWithValidation = useCallback(async () => {
    try {
      if (!db) {
        toast.error('Database not available');
        return;
      }

      logger.debug('Database information:', {
        name: db.name,
        version: db.version,
        objectStoreNames: Array.from(db.objectStoreNames),
      });

      if (availableChats.length === 0) {
        toast.warning('No chats available to export');
        return;
      }

      await handleExportAllChats();
    } catch (error) {
      logger.error('Error exporting chats:', error);
      toast.error(`Failed to export chats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [db, availableChats.length, handleExportAllChats]);

  return (
    <div className="space-y-12">
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileInputChange} className="hidden" />
      <input
        ref={apiKeyFileInputRef}
        type="file"
        accept=".json"
        onChange={handleAPIKeyFileInputChange}
        className="hidden"
      />
      <input
        ref={chatFileInputRef}
        type="file"
        accept=".json"
        onChange={handleChatFileInputChange}
        className="hidden"
      />

      {/* Dialogs */}
      <DataTabDialogs
        showResetInlineConfirm={showResetInlineConfirm}
        onCloseResetConfirm={() => setShowResetInlineConfirm(false)}
        isResetting={isResetting}
        onResetSettings={handleResetSettings}
        showDeleteInlineConfirm={showDeleteInlineConfirm}
        onCloseDeleteConfirm={() => setShowDeleteInlineConfirm(false)}
        isDeleting={isDeleting}
        onDeleteChats={handleResetChatsWithState}
        showSettingsSelection={showSettingsSelection}
        onCloseSettingsSelection={() => setShowSettingsSelection(false)}
        onExportSelectedSettings={handleExportSelectedSettings}
        showChatsSelection={showChatsSelection}
        onCloseChatsSelection={() => setShowChatsSelection(false)}
        chatItems={chatItems}
        onExportSelectedChats={handleExportSelectedChats}
      />

      {/* Chats Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-ui-textPrimary">Chats</h2>
        {dbLoading ? (
          <div className="flex items-center justify-center p-4">
            <div className="i-ph-spinner-gap-bold animate-spin w-6 h-6 mr-2" />
            <span>Loading chats database...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <DataActionCard
              icon="i-ph-download-duotone"
              title="Export All Chats"
              description="Export all your chats to a JSON file."
              buttonLabel="Export All"
              loadingLabel="Exporting..."
              isLoading={isExporting}
              isDisabled={availableChats.length === 0}
              disabledLabel="No Chats to Export"
              onClick={handleExportAllChatsWithValidation}
            />
            <DataActionCard
              icon="i-ph:list-checks"
              title="Export Selected Chats"
              description="Choose specific chats to export."
              buttonLabel="Select Chats"
              loadingLabel="Exporting..."
              isLoading={isExporting}
              isDisabled={chatItems.length === 0}
              onClick={() => setShowChatsSelection(true)}
            />
            <DataActionCard
              icon="i-ph-upload-duotone"
              title="Import Chats"
              description="Import chats from a JSON file."
              buttonLabel="Import Chats"
              loadingLabel="Importing..."
              isLoading={isImporting}
              onClick={() => chatFileInputRef.current?.click()}
            />
            <DataActionCard
              icon="i-ph-trash-duotone"
              title="Delete All Chats"
              description="Delete all your chat history."
              buttonLabel="Delete All"
              loadingLabel="Deleting..."
              isLoading={isDeleting}
              isDisabled={chatItems.length === 0}
              iconColorClass="text-red-500 dark:text-red-400"
              onClick={() => setShowDeleteInlineConfirm(true)}
            />
          </div>
        )}
      </div>

      {/* Settings Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-ui-textPrimary">Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <DataActionCard
            icon="i-ph-download-duotone"
            title="Export All Settings"
            description="Export all your settings to a JSON file."
            buttonLabel="Export All"
            loadingLabel="Exporting..."
            isLoading={isExporting}
            onClick={handleExportSettings}
          />
          <DataActionCard
            icon="i-ph-filter-duotone"
            title="Export Selected Settings"
            description="Choose specific settings to export."
            buttonLabel="Select Settings"
            loadingLabel="Exporting..."
            isLoading={isExporting}
            isDisabled={SETTINGS_CATEGORIES.length === 0}
            onClick={() => setShowSettingsSelection(true)}
          />
          <DataActionCard
            icon="i-ph-upload-duotone"
            title="Import Settings"
            description="Import settings from a JSON file."
            buttonLabel="Import Settings"
            loadingLabel="Importing..."
            isLoading={isImporting}
            onClick={() => fileInputRef.current?.click()}
          />
          <DataActionCard
            icon="i-ph-arrow-counter-clockwise-duotone"
            title="Reset All Settings"
            description="Reset all settings to their default values."
            buttonLabel="Reset All"
            loadingLabel="Resetting..."
            isLoading={isResetting}
            iconColorClass="text-red-500 dark:text-red-400"
            onClick={() => setShowResetInlineConfirm(true)}
          />
        </div>
      </div>

      {/* API Keys Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-ui-textPrimary">API Keys</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <DataActionCard
            icon="i-ph-file-text-duotone"
            title="Download Template"
            description="Download a template file for your API keys."
            buttonLabel="Download"
            loadingLabel="Downloading..."
            isLoading={isDownloadingTemplate}
            onClick={handleDownloadTemplate}
          />
          <DataActionCard
            icon="i-ph-upload-duotone"
            title="Import API Keys"
            description="Import API keys from a JSON file."
            buttonLabel="Import Keys"
            loadingLabel="Importing..."
            isLoading={isImportingKeys}
            onClick={() => apiKeyFileInputRef.current?.click()}
          />
        </div>
      </div>

      {/* Data Visualization */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-ui-textPrimary">Data Usage</h2>
        <Card>
          <CardContent className="p-5">
            <DataVisualization chats={availableChats} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
