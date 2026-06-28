import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { atom } from 'nanostores';
import { generateId, type JSONValue, type Message } from 'ai';
import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';
import { workbenchStore } from '~/lib/stores/workbench';
import { logStore } from '~/lib/stores/logs'; // Import logStore
import {
  getMessages,
  getNextId,
  getUrlId,
  openDatabase,
  setMessages,
  duplicateChat,
  createChatFromMessages,
  getSnapshot,
  setSnapshot,
  updateChatMetadata as dbUpdateChatMetadata,
  type IChatMetadata,
} from './db';
import type { FileMap } from '~/lib/stores/files';
import type { Snapshot } from './types';
import { runtime } from '~/lib/webcontainer';
import { detectProjectCommands, createCommandActionsString } from '~/utils/projectCommands';
import { ARTIFACT_TAG_OPEN, ARTIFACT_TAG_CLOSE, ACTION_TAG_OPEN, ACTION_TAG_CLOSE } from '~/lib/app-config';
import type { ContextAnnotation } from '~/types/context';

const logger = createScopedLogger('ChatHistory');

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
  updatedAt?: number;
  metadata?: IChatMetadata;
}

const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;

/*
 * Lazy-initialized database singleton.
 * Uses a promise-based lock to prevent race conditions when multiple
 * callers invoke getDb() before the first openDatabase() resolves.
 */
let _db: IDBDatabase | undefined;
let _dbInitPromise: Promise<IDBDatabase | undefined> | null = null;

/**
 * Get the database instance. Returns undefined if persistence is disabled.
 * Lazily initializes the database on first call and caches the result.
 * Concurrent callers share the same in-flight promise.
 */
export async function getDb(): Promise<IDBDatabase | undefined> {
  if (_db) {
    return _db;
  }

  if (_dbInitPromise) {
    return _dbInitPromise;
  }

  if (!persistenceEnabled) {
    return undefined;
  }

  _dbInitPromise = (async () => {
    try {
      _db = await openDatabase();
      return _db;
    } catch (error) {
      logger.error('Failed to open database:', error);
      return undefined;
    } finally {
      _dbInitPromise = null;
    }
  })();

  return _dbInitPromise;
}

// For backward compatibility: synchronous getter (returns undefined until initialized)
export function getDbSync(): IDBDatabase | undefined {
  return _db;
}

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const chatMetadata = atom<IChatMetadata | undefined>(undefined);
export function useChatHistory() {
  const navigate = useNavigate();
  const { id: mixedId } = useLoaderData<{ id?: string }>();
  const [searchParams] = useSearchParams();

  const [archivedMessages, setArchivedMessages] = useState<Message[]>([]);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();
  const [db, setDb] = useState<IDBDatabase | undefined>(undefined);

  // Refs to avoid stale closures in storeMessageHistory
  const initialMessagesRef = useRef<Message[]>(initialMessages);
  const archivedMessagesRef = useRef<Message[]>(archivedMessages);

  // Serialization guard: prevents concurrent storeMessageHistory calls from racing
  const storeQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    initialMessagesRef.current = initialMessages;
  }, [initialMessages]);

  useEffect(() => {
    archivedMessagesRef.current = archivedMessages;
  }, [archivedMessages]);

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

  const restoreSnapshot = useCallback(async (id: string, snapshot?: Snapshot) => {
    try {
      const container = await runtime;

      const validSnapshot = snapshot || { chatIndex: '', files: {} };

      if (!validSnapshot?.files) {
        return;
      }

      const entries = Object.entries(validSnapshot.files);

      // Create directories first (sequentially to ensure parent dirs exist)
      for (const [rawKey, value] of entries) {
        if (value?.type === 'folder') {
          let key = rawKey;

          if (key.startsWith(container.workdir)) {
            key = key.replace(container.workdir, '');
          }

          try {
            await container.fs.mkdir(key, { recursive: true });
          } catch (error) {
            logger.error(`Failed to create directory ${key}:`, error);
          }
        }
      }

      // Then write files
      for (const [rawKey, value] of entries) {
        if (value?.type === 'file') {
          let key = rawKey;

          if (key.startsWith(container.workdir)) {
            key = key.replace(container.workdir, '');
          }

          try {
            await container.fs.writeFile(key, value.content, value.isBinary ? undefined : 'utf8');
          } catch (error) {
            logger.error(`Failed to write file ${key}:`, error);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to restore snapshot:', error);
    }
  }, []);

  const processLoadedChat = useCallback(
    async (storedMessages: ChatHistoryItem, snapshot: Snapshot | undefined) => {
      const validSnapshot = snapshot || { chatIndex: '', files: {} };
      const summary = validSnapshot.summary;

      const rewindId = searchParams.get('rewindTo');
      let startingIdx = -1;
      const endingIdx = rewindId
        ? storedMessages.messages.findIndex((m) => m.id === rewindId) + 1
        : storedMessages.messages.length;
      const snapshotIndex = storedMessages.messages.findIndex((m) => m.id === validSnapshot.chatIndex);

      if (snapshotIndex >= 0 && snapshotIndex < endingIdx) {
        startingIdx = snapshotIndex;
      }

      if (snapshotIndex > 0 && storedMessages.messages[snapshotIndex].id == rewindId) {
        startingIdx = -1;
      }

      let filteredMessages = storedMessages.messages.slice(startingIdx + 1, endingIdx);
      let archivedMessages: Message[] = [];

      if (startingIdx >= 0) {
        archivedMessages = storedMessages.messages.slice(0, startingIdx + 1);
      }

      setArchivedMessages(archivedMessages);

      if (startingIdx > 0) {
        const files = Object.entries(validSnapshot?.files || {})
          .map(([key, value]) => {
            if (value?.type !== 'file') {
              return null;
            }

            return {
              content: value.content,
              path: key,
            };
          })
          .filter((x): x is { content: string; path: string } => !!x);
        const projectCommands = await detectProjectCommands(files);

        // Call the modified function to get only the command actions string
        const commandActionsString = createCommandActionsString(projectCommands);

        filteredMessages = [
          {
            id: generateId(),
            role: 'user',
            content: `Restore project from snapshot`,
            annotations: ['no-store', 'hidden'],
          },
          {
            id: storedMessages.messages[snapshotIndex].id,
            role: 'assistant',

            // Combine followup message and the artifact with files and command actions
            content: `Your chat has been restored from a snapshot. You can revert this message to load the full chat history.
            ${ARTIFACT_TAG_OPEN} id="restored-project-setup" title="Restored Project & Setup" type="bundled">
            ${Object.entries(snapshot?.files || {})
              .map(([key, value]) => {
                if (value?.type === 'file') {
                  return `
                ${ACTION_TAG_OPEN} type="file" filePath="${key}">
${value.content}
                ${ACTION_TAG_CLOSE}
                `;
                } else {
                  return ``;
                }
              })
              .join('\n')}
            ${commandActionsString} 
            ${ARTIFACT_TAG_CLOSE}
            `,
            annotations: [
              'no-store',
              ...(summary
                ? [
                    {
                      chatId: storedMessages.messages[snapshotIndex].id,
                      type: 'chatSummary',
                      summary,
                    } satisfies ContextAnnotation,
                  ]
                : []),
            ],
          },
          ...filteredMessages,
        ];
        restoreSnapshot(storedMessages.id, snapshot).catch((err) => logger.error('Failed to restore snapshot:', err));
      }

      setInitialMessages(filteredMessages);

      setUrlId(storedMessages.urlId);
      description.set(storedMessages.description);
      chatId.set(storedMessages.id);
      chatMetadata.set(storedMessages.metadata);
    },
    [searchParams, restoreSnapshot],
  );

  useEffect(() => {
    // Wait for db initialization before proceeding
    if (db === undefined && persistenceEnabled) {
      return;
    }

    if (!db) {
      setReady(true);

      if (persistenceEnabled) {
        const error = new Error('Chat persistence is unavailable');
        logStore.logError('Chat persistence initialization failed', error);
        toast.error('Chat persistence is unavailable');
      }

      return;
    }

    if (mixedId) {
      Promise.all([
        getMessages(db, mixedId),
        getSnapshot(db, mixedId), // Fetch snapshot from DB
      ])
        .then(async ([storedMessages, snapshot]) => {
          if (storedMessages && storedMessages.messages.length > 0) {
            await processLoadedChat(storedMessages, snapshot);
            setReady(true);
          } else {
            // Try fetching from the cloud
            try {
              const response = await fetch(`/api/projects?id=${encodeURIComponent(mixedId)}`);

              if (response.ok) {
                const data = (await response.json()) as {
                  project?: {
                    id: string;
                    urlId: string;
                    description: string;
                    messages: Message[];
                    metadata?: Record<string, unknown>;
                  };
                  snapshot?: Snapshot;
                  authenticated?: boolean;
                };

                if (data.project && data.project.messages && data.project.messages.length > 0) {
                  // Save fetched project & snapshot into local IndexedDB
                  await setMessages(
                    db,
                    data.project.id,
                    data.project.messages,
                    data.project.urlId,
                    data.project.description,
                    new Date().toISOString(),
                    data.project.metadata as IChatMetadata,
                  );

                  if (data.snapshot) {
                    await setSnapshot(db, data.project.id, data.snapshot);
                  }

                  const chatItem: ChatHistoryItem = {
                    id: data.project.id,
                    urlId: data.project.urlId,
                    description: data.project.description,
                    messages: data.project.messages,
                    timestamp: new Date().toISOString(),
                    metadata: data.project.metadata as IChatMetadata,
                  };

                  await processLoadedChat(chatItem, data.snapshot);
                  setReady(true);
                } else {
                  navigate('/', { replace: true });
                  setReady(true);
                }
              } else {
                navigate('/', { replace: true });
                setReady(true);
              }
            } catch (error) {
              logger.error('Failed to load project from cloud:', error);
              navigate('/', { replace: true });
              setReady(true);
            }
          }
        })
        .catch((error) => {
          logger.error(error);

          logStore.logError('Failed to load chat messages or snapshot', error);
          toast.error('Failed to load chat: ' + error.message);
          setReady(true);
        });
    } else {
      // Handle case where there is no mixedId (e.g., new chat)
      setReady(true);
    }
  }, [mixedId, db, navigate, searchParams, processLoadedChat]);

  const takeSnapshot = useCallback(
    async (chatIdx: string, files: FileMap, _chatId?: string | undefined, chatSummary?: string) => {
      const id = chatId.get();

      if (!id || !db) {
        return;
      }

      const snapshot: Snapshot = {
        chatIndex: chatIdx,
        files,
        summary: chatSummary,
      };

      // localStorage.setItem(`snapshot:${id}`, JSON.stringify(snapshot)); // Remove localStorage usage
      try {
        await setSnapshot(db, id, snapshot);
      } catch (error) {
        logger.error('Failed to save snapshot:', error);
        toast.error('Failed to save chat snapshot.');
      }
    },
    [db],
  );

  return {
    ready: !mixedId || ready,
    initialMessages,
    updateChatMetadata: async (metadata: IChatMetadata) => {
      const id = chatId.get();

      if (!db || !id) {
        return;
      }

      try {
        await dbUpdateChatMetadata(db, id, metadata);
        chatMetadata.set(metadata);
      } catch (error) {
        toast.error('Failed to update chat metadata');
        logger.error(error);
      }
    },
    storeMessageHistory: async (messages: Message[]) => {
      if (!db || messages.length === 0) {
        return;
      }

      /*
       * Chain onto the serialization queue to prevent concurrent calls from
       * racing to set chatId or overwriting each other's messages
       */
      const operation = storeQueueRef.current
        .then(async () => {
          if (!db || messages.length === 0) {
            return;
          }

          const { firstArtifact } = workbenchStore;
          messages = messages.filter((m) => !(Array.isArray(m.annotations) && m.annotations.includes('no-store')));

          let _urlId = urlId;

          if (!urlId && firstArtifact?.id) {
            const urlId = await getUrlId(db, firstArtifact.id);
            _urlId = urlId;
            navigateChat(urlId);
            setUrlId(urlId);
          }

          let chatSummary: string | undefined = undefined;
          const lastMessage = messages[messages.length - 1];

          if (lastMessage.role === 'assistant') {
            const annotations = lastMessage.annotations;
            const filteredAnnotations = (
              Array.isArray(annotations)
                ? annotations.filter(
                    (annotation: JSONValue) =>
                      annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
                  )
                : []
            ) as { type: string; value: any } & { [key: string]: any }[];

            if (filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')) {
              chatSummary = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')?.summary;
            }
          }

          takeSnapshot(messages[messages.length - 1].id, workbenchStore.files.get(), _urlId, chatSummary);

          if (!description.get() && firstArtifact?.title) {
            description.set(firstArtifact?.title);
          }

          // Ensure chatId.get() is used here as well
          if (initialMessagesRef.current.length === 0 && !chatId.get()) {
            const nextId = await getNextId(db);

            chatId.set(nextId);

            if (!urlId) {
              navigateChat(nextId);
            }
          }

          // Ensure chatId.get() is used for the final setMessages call
          const finalChatId = chatId.get();

          if (!finalChatId) {
            logger.error('Cannot save messages, chat ID is not set.');
            toast.error('Failed to save chat messages: Chat ID missing.');

            return;
          }

          await setMessages(
            db,
            finalChatId, // Use the potentially updated chatId
            [...archivedMessagesRef.current, ...messages],
            _urlId,
            description.get(),
            undefined,
            chatMetadata.get(),
          );
        })
        .catch((error) => {
          logger.error('storeMessageHistory failed:', error);
        });

      storeQueueRef.current = operation;
      await operation;
    },
    duplicateCurrentChat: async (listItemId: string) => {
      if (!db || (!mixedId && !listItemId)) {
        return;
      }

      try {
        const newId = await duplicateChat(db, mixedId || listItemId);
        navigate(`/chat/${newId}`);
        toast.success('Chat duplicated successfully');
      } catch (error) {
        toast.error('Failed to duplicate chat');
        logger.error('Failed to duplicate chat', error);
      }
    },
    importChat: async (description: string, messages: Message[], metadata?: IChatMetadata) => {
      if (!db) {
        return;
      }

      try {
        const newId = await createChatFromMessages(db, description, messages, metadata);
        window.location.href = `/chat/${newId}`;
        toast.success('Chat imported successfully');
      } catch (error) {
        if (error instanceof Error) {
          toast.error('Failed to import chat: ' + error.message);
        } else {
          toast.error('Failed to import chat');
        }
      }
    },
    exportChat: async (id = urlId) => {
      if (!db || !id) {
        return;
      }

      const chat = await getMessages(db, id);

      if (!chat) {
        toast.error('Chat not found');
        return;
      }

      const chatData = {
        messages: chat.messages,
        description: chat.description,
        exportDate: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };
}

function navigateChat(nextId: string) {
  /**
   * Design choice: We use `window.history.replaceState` instead of React Router's
   * `navigate()` because the latter triggers a full rerender of the <Chat />
   * component tree, which breaks active streaming state. The manual history
   * manipulation updates the URL without unmounting/remounting components.
   *
   * Original intent: `navigate(`/chat/${nextId}`, { replace: true });`
   */
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;

  window.history.replaceState({}, '', url);
}
