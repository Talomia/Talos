import { motion, type Variants } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';

const ControlPanel = lazy(() =>
  import('~/components/@settings/core/ControlPanel').then((m) => ({ default: m.ControlPanel })),
);
import { ErrorBoundary } from '~/components/ui/ErrorBoundary';
import { SettingsButton, HelpButton } from '~/components/ui/SettingsButton';
import { Button } from '~/components/ui/Button';
import { getDb, deleteById, getAll, chatId, type ChatHistoryItem, useChatHistory } from '~/lib/persistence';
import { getBranchesByParent, getBranchById, getMessages } from '~/lib/persistence/db';
import { cubicEasingFn } from '~/utils/easings';
import { HistoryItem } from './HistoryItem';
import { binDates } from './date-binning';
import { useSearchFilter } from '~/lib/hooks/useSearchFilter';
import { classNames } from '~/utils/classNames';
import { useStore } from '@nanostores/react';
import { profileStore } from '~/lib/stores/profile';
import { STORAGE_KEYS } from '~/lib/app-config';

const menuVariants = {
  closed: {
    opacity: 0,
    visibility: 'hidden',
    left: '-340px',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    opacity: 1,
    visibility: 'initial',
    left: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

type DialogContent =
  | { type: 'delete'; item: ChatHistoryItem }
  | { type: 'bulkDelete'; items: ChatHistoryItem[] }
  | null;

function CurrentDateTime() {
  const [dateTime, setDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-ui-textSecondary border-b border-ui-borderColor">
      <div className="h-4 w-4 i-ph:clock opacity-80" />
      <div className="flex gap-2">
        <span>{dateTime.toLocaleDateString()}</span>
        <span>{dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}

const logger = createScopedLogger('Menu');

export const Menu = () => {
  const { duplicateCurrentChat, exportChat } = useChatHistory();
  const menuRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<ChatHistoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState<DialogContent>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const profile = useStore(profileStore);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [branchMeta, setBranchMeta] = useState<
    Map<string, { isFork: boolean; parentDescription?: string; branchCount: number }>
  >(new Map());

  // Pinned chats state (localStorage-backed)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.pinnedChats);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      try {
        localStorage.setItem(STORAGE_KEYS.pinnedChats, JSON.stringify([...next]));
      } catch {
        // localStorage unavailable
      }

      return next;
    });
  }, []);

  const { filteredItems: filteredList, handleSearchChange } = useSearchFilter({
    items: list,
    searchFields: ['description'],
    debounceMs: 200,
  });

  const [db, setDb] = useState<IDBDatabase | undefined>(undefined);

  // Initialize database on mount
  useEffect(() => {
    let cancelled = false;

    getDb().then((resolvedDb) => {
      if (!cancelled) {
        setDb(resolvedDb);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for ⌘B sidebar toggle
  useEffect(() => {
    const handleToggle = () => setOpen((prev) => !prev);
    window.addEventListener('talos:toggle-sidebar', handleToggle);

    return () => window.removeEventListener('talos:toggle-sidebar', handleToggle);
  }, []);

  const loadEntries = useCallback(() => {
    if (db) {
      setLoadError(null);

      getAll(db)
        .then((list) => list.filter((item) => item.urlId && item.description))
        .then((filteredList) => {
          setList(filteredList);

          // Batch-load branch metadata for all entries
          const ids = filteredList.map((item) => item.id);
          const metaPromises = ids.map(async (id) => {
            const [branchData, children] = await Promise.all([
              getBranchById(db, id).catch(() => undefined),
              getBranchesByParent(db, id).catch(() => []),
            ]);

            let parentDescription: string | undefined;

            if (branchData) {
              try {
                const parent = await getMessages(db, branchData.parentChatId);
                parentDescription = parent?.description;
              } catch {
                // Parent may have been deleted
              }
            }

            return {
              id,
              isFork: !!branchData,
              parentDescription,
              branchCount: children.length,
            };
          });

          Promise.all(metaPromises)
            .then((results) => {
              const map = new Map<string, { isFork: boolean; parentDescription?: string; branchCount: number }>();

              for (const r of results) {
                map.set(r.id, { isFork: r.isFork, parentDescription: r.parentDescription, branchCount: r.branchCount });
              }

              setBranchMeta(map);
            })
            .catch(() => {
              // Branch metadata is supplementary; don't block on errors
            });
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Failed to load chats';
          logger.error('Failed to load chat entries:', error);
          setLoadError(message);
        });
    }
  }, [db]);

  const deleteChat = useCallback(
    async (id: string): Promise<void> => {
      if (!db) {
        throw new Error('Database not available');
      }

      // Delete chat snapshot from localStorage
      try {
        const snapshotKey = `snapshot:${id}`;
        localStorage.removeItem(snapshotKey);
      } catch (snapshotError) {
        logger.error(`Error deleting snapshot for chat ${id}:`, snapshotError);
      }

      // Delete the chat from the database
      await deleteById(db, id);
    },
    [db],
  );

  const deleteItem = useCallback(
    (event: React.UIEvent, item: ChatHistoryItem) => {
      event.preventDefault();
      event.stopPropagation();

      setDeletingId(item.id);

      deleteChat(item.id)
        .then(() => {
          toast.success('Chat deleted successfully', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          // Clean up pinned state for deleted chat
          setPinnedIds((prev) => {
            if (!prev.has(item.id)) {
              return prev;
            }

            const next = new Set(prev);
            next.delete(item.id);

            try {
              localStorage.setItem(STORAGE_KEYS.pinnedChats, JSON.stringify([...next]));
            } catch {
              // localStorage unavailable
            }

            return next;
          });

          // Always refresh the list
          loadEntries();

          if (chatId.get() === item.id) {
            // hard page navigation to clear the stores
            window.location.pathname = '/';
          }
        })
        .catch((error) => {
          logger.error('Failed to delete chat:', error);
          toast.error('Failed to delete conversation', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          // Still try to reload entries in case data has changed
          loadEntries();
        })
        .finally(() => {
          setDeletingId(null);
        });
    },
    [loadEntries, deleteChat],
  );

  const deleteSelectedItems = useCallback(
    async (itemsToDeleteIds: string[]) => {
      if (!db || itemsToDeleteIds.length === 0) {
        return;
      }

      let deletedCount = 0;
      const errors: string[] = [];
      const currentChatId = chatId.get();
      let shouldNavigate = false;

      // Process deletions sequentially using the shared deleteChat logic
      for (const id of itemsToDeleteIds) {
        try {
          await deleteChat(id);
          deletedCount++;

          // Clean up pinned state for deleted chat
          setPinnedIds((prev) => {
            if (!prev.has(id)) {
              return prev;
            }

            const next = new Set(prev);
            next.delete(id);

            try {
              localStorage.setItem(STORAGE_KEYS.pinnedChats, JSON.stringify([...next]));
            } catch {
              // localStorage unavailable
            }

            return next;
          });

          if (id === currentChatId) {
            shouldNavigate = true;
          }
        } catch (error) {
          logger.error(`Error deleting chat ${id}:`, error);
          errors.push(id);
        }
      }

      // Show appropriate toast message
      if (errors.length === 0) {
        toast.success(`${deletedCount} chat${deletedCount === 1 ? '' : 's'} deleted successfully`);
      } else {
        toast.warning(`Deleted ${deletedCount} of ${itemsToDeleteIds.length} chats. ${errors.length} failed.`, {
          autoClose: 5000,
        });
      }

      // Reload the list after all deletions
      await loadEntries();

      // Clear selection state
      setSelectedItems([]);
      setSelectionMode(false);

      // Navigate if needed
      if (shouldNavigate) {
        window.location.pathname = '/';
      }
    },
    [deleteChat, loadEntries, db],
  );

  const closeDialog = () => {
    setDialogContent(null);
  };

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);

    if (selectionMode) {
      // If turning selection mode OFF, clear selection
      setSelectedItems([]);
    }
  };

  const toggleItemSelection = useCallback((id: string) => {
    setSelectedItems((prev) => {
      const newSelectedItems = prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id];
      return newSelectedItems; // Return the new array
    });
  }, []); // No dependencies needed

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedItems.length === 0) {
      toast.info('Select at least one chat to delete');
      return;
    }

    const selectedChats = list.filter((item) => selectedItems.includes(item.id));

    if (selectedChats.length === 0) {
      toast.error('Could not find selected chats');
      return;
    }

    setDialogContent({ type: 'bulkDelete', items: selectedChats });
  }, [selectedItems, list]); // Keep list dependency

  const selectAll = useCallback(() => {
    const allFilteredIds = filteredList.map((item) => item.id);
    setSelectedItems((prev) => {
      const allFilteredAreSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => prev.includes(id));

      if (allFilteredAreSelected) {
        // Deselect only the filtered items
        const newSelectedItems = prev.filter((id) => !allFilteredIds.includes(id));
        return newSelectedItems;
      } else {
        // Select all filtered items, adding them to any existing selections
        const newSelectedItems = [...new Set([...prev, ...allFilteredIds])];
        return newSelectedItems;
      }
    });
  }, [filteredList]); // Depends only on filteredList

  useEffect(() => {
    if (open) {
      loadEntries();
    }
  }, [open, loadEntries]);

  useEffect(() => {
    const enterThreshold = 20;
    const exitThreshold = 20;

    function onMouseMove(event: MouseEvent) {
      if (isSettingsOpen) {
        return;
      }

      if (event.pageX < enterThreshold) {
        setOpen(true);
      }

      if (menuRef.current && event.clientX > menuRef.current.getBoundingClientRect().right + exitThreshold) {
        setOpen(false);
      }
    }

    window.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [isSettingsOpen]);

  const handleDuplicate = async (id: string) => {
    await duplicateCurrentChat(id);
    loadEntries(); // Reload the list after duplication
  };

  const handleSettingsClick = () => {
    setIsSettingsOpen(true);
    setOpen(false);
  };

  const handleSettingsClose = () => {
    setIsSettingsOpen(false);
  };

  const setDialogContentWithLogging = useCallback((content: DialogContent) => {
    setDialogContent(content);
  }, []);

  return (
    <>
      <motion.div
        ref={menuRef}
        initial="closed"
        animate={open ? 'open' : 'closed'}
        variants={menuVariants}
        style={{ width: '340px' }}
        className={classNames(
          'flex selection-accent flex-col side-menu fixed top-0 h-full rounded-r-2xl',
          'bg-white dark:bg-gray-950 border-r border-ui-borderColor',
          'shadow-sm text-sm',
          isSettingsOpen ? 'z-40' : 'z-sidebar',
        )}
        role="navigation"
        aria-label="Chat history"
      >
        <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100 dark:border-gray-800/50 bg-gray-50/50 dark:bg-gray-900/50 rounded-tr-2xl">
          <div className="text-gray-900 dark:text-white font-medium"></div>
          <div className="flex items-center gap-3">
            <HelpButton onClick={() => window.open('#', '_blank')} />
            <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
              {profile?.username || 'Guest User'}
            </span>
            <div className="flex items-center justify-center w-[32px] h-[32px] overflow-hidden bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-500 rounded-full shrink-0">
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile?.username || 'User'}
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding="sync"
                />
              ) : (
                <div className="i-ph:user-fill text-lg" />
              )}
            </div>
          </div>
        </div>
        <CurrentDateTime />
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <a
                href="/"
                className="flex-1 flex gap-2 items-center bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-500/20 rounded-lg px-4 py-2 transition-colors"
              >
                <span className="inline-block i-ph:plus-circle h-4 w-4" />
                <span className="text-sm font-medium">Start new chat</span>
              </a>
              <button
                onClick={toggleSelectionMode}
                className={classNames(
                  'flex gap-1 items-center rounded-lg px-3 py-2 transition-colors',
                  selectionMode
                    ? 'bg-purple-600 dark:bg-purple-500 text-white border border-purple-700 dark:border-purple-600'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700',
                )}
                aria-label={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
              >
                <span className={selectionMode ? 'i-ph:x h-4 w-4' : 'i-ph:check-square h-4 w-4'} />
              </button>
            </div>
            <div className="relative w-full">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <span className="i-ph:magnifying-glass h-4 w-4 text-gray-400 dark:text-gray-500" />
              </div>
              <input
                className="w-full bg-gray-50 dark:bg-gray-900 relative pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500/50 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-500 border border-gray-200 dark:border-gray-800"
                type="search"
                placeholder="Search chats..."
                onChange={handleSearchChange}
                aria-label="Search chats"
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-sm px-4 py-2">
            <div className="font-medium text-gray-600 dark:text-gray-400">Your Chats</div>
            {selectionMode && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll}>
                  {selectedItems.length === filteredList.length ? 'Deselect all' : 'Select all'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDeleteClick}
                  disabled={selectedItems.length === 0}
                >
                  Delete selected
                </Button>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto px-3 pb-3" role="list">
            {loadError ? (
              <div className="px-4 py-6 text-center">
                <div className="i-ph:warning-circle h-8 w-8 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-red-500 dark:text-red-400 mb-3">{loadError}</p>
                <button
                  onClick={loadEntries}
                  className="text-sm px-4 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : filteredList.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                <div className="i-ph:chat-circle-dots h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                  {list.length === 0 ? 'No conversations yet' : 'No matches found'}
                </p>
                {list.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Start a new chat or press{' '}
                    <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-mono text-[10px]">
                      ⌘K
                    </kbd>
                  </p>
                )}
              </div>
            ) : null}
            <DialogRoot open={dialogContent !== null}>
              {/* Pinned chats section */}
              {filteredList.filter((item) => pinnedIds.has(item.id)).length > 0 && (
                <div className="mt-2 first:mt-0 space-y-1">
                  <div className="text-xs font-medium text-purple-500 dark:text-purple-400 sticky top-0 z-1 bg-white dark:bg-gray-950 px-4 py-1 flex items-center gap-1">
                    <span className="i-ph:push-pin-fill text-[10px]" />
                    Pinned
                  </div>
                  <div className="space-y-0.5 pr-1">
                    {filteredList
                      .filter((item) => pinnedIds.has(item.id))
                      .map((item) => (
                        <HistoryItem
                          key={item.id}
                          item={item}
                          exportChat={exportChat}
                          onDelete={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setDialogContentWithLogging({ type: 'delete', item });
                          }}
                          onDuplicate={() => handleDuplicate(item.id)}
                          selectionMode={selectionMode}
                          isSelected={selectedItems.includes(item.id)}
                          onToggleSelection={toggleItemSelection}
                          isDeleting={deletingId === item.id}
                          isPinned={true}
                          onTogglePin={togglePin}
                          isFork={branchMeta.get(item.id)?.isFork}
                          parentDescription={branchMeta.get(item.id)?.parentDescription}
                          branchCount={branchMeta.get(item.id)?.branchCount}
                        />
                      ))}
                  </div>
                </div>
              )}
              {/* Date-binned chats (excluding pinned) */}
              {binDates(filteredList.filter((item) => !pinnedIds.has(item.id))).map(({ category, items }) => (
                <div key={category} className="mt-2 first:mt-0 space-y-1">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 sticky top-0 z-1 bg-white dark:bg-gray-950 px-4 py-1">
                    {category}
                  </div>
                  <div className="space-y-0.5 pr-1">
                    {items.map((item) => (
                      <HistoryItem
                        key={item.id}
                        item={item}
                        exportChat={exportChat}
                        onDelete={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDialogContentWithLogging({ type: 'delete', item });
                        }}
                        onDuplicate={() => handleDuplicate(item.id)}
                        selectionMode={selectionMode}
                        isSelected={selectedItems.includes(item.id)}
                        onToggleSelection={toggleItemSelection}
                        isDeleting={deletingId === item.id}
                        isPinned={false}
                        onTogglePin={togglePin}
                        isFork={branchMeta.get(item.id)?.isFork}
                        parentDescription={branchMeta.get(item.id)?.parentDescription}
                        branchCount={branchMeta.get(item.id)?.branchCount}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <Dialog onBackdrop={closeDialog} onClose={closeDialog}>
                {dialogContent?.type === 'delete' && (
                  <>
                    <div className="p-6 bg-white dark:bg-gray-950">
                      <DialogTitle className="text-gray-900 dark:text-white">Delete Chat?</DialogTitle>
                      <DialogDescription className="mt-2 text-gray-600 dark:text-gray-400">
                        <p>
                          You are about to delete{' '}
                          <span className="font-medium text-gray-900 dark:text-white">
                            {dialogContent.item.description}
                          </span>
                        </p>
                        <p className="mt-2">Are you sure you want to delete this chat?</p>
                      </DialogDescription>
                    </div>
                    <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
                      <DialogButton type="secondary" onClick={closeDialog}>
                        Cancel
                      </DialogButton>
                      <DialogButton
                        type="danger"
                        onClick={(event) => {
                          deleteItem(event, dialogContent.item);
                          closeDialog();
                        }}
                      >
                        Delete
                      </DialogButton>
                    </div>
                  </>
                )}
                {dialogContent?.type === 'bulkDelete' && (
                  <>
                    <div className="p-6 bg-white dark:bg-gray-950">
                      <DialogTitle className="text-gray-900 dark:text-white">Delete Selected Chats?</DialogTitle>
                      <DialogDescription className="mt-2 text-gray-600 dark:text-gray-400">
                        <p>
                          You are about to delete {dialogContent.items.length}{' '}
                          {dialogContent.items.length === 1 ? 'chat' : 'chats'}:
                        </p>
                        <div className="mt-2 max-h-32 overflow-auto border border-gray-100 dark:border-gray-800 rounded-md bg-gray-50 dark:bg-gray-900 p-2">
                          <ul className="list-disc pl-5 space-y-1">
                            {dialogContent.items.map((item) => (
                              <li key={item.id} className="text-sm">
                                <span className="font-medium text-gray-900 dark:text-white">{item.description}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <p className="mt-3">Are you sure you want to delete these chats?</p>
                      </DialogDescription>
                    </div>
                    <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
                      <DialogButton type="secondary" onClick={closeDialog}>
                        Cancel
                      </DialogButton>
                      <DialogButton
                        type="danger"
                        onClick={() => {
                          /*
                           * Pass the current selectedItems to the delete function.
                           * This captures the state at the moment the user confirms.
                           */
                          const itemsToDeleteNow = [...selectedItems];
                          deleteSelectedItems(itemsToDeleteNow);
                          closeDialog();
                        }}
                      >
                        Delete
                      </DialogButton>
                    </div>
                  </>
                )}
              </Dialog>
            </DialogRoot>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-800 px-4 py-3">
            <div className="flex items-center gap-3">
              <SettingsButton onClick={handleSettingsClick} />
            </div>
            <ThemeSwitch />
          </div>
        </div>
      </motion.div>

      <ErrorBoundary panelName="the settings panel">
        <Suspense fallback={null}>
          <ControlPanel open={isSettingsOpen} onClose={handleSettingsClose} />
        </Suspense>
      </ErrorBoundary>
    </>
  );
};
