import type { Message } from 'ai';
import { createScopedLogger } from '~/utils/logger';
import type { ChatHistoryItem } from './useChatHistory';
import type { Snapshot } from './types'; // Import Snapshot type
import { syncChatToCloud, syncDeleteToCloud, syncDeleteAllToCloud } from './cloudSync';
import { handleIDBQuotaError } from '~/utils/safeStorage';

export interface IChatMetadata {
  gitUrl: string;
  gitBranch?: string;
  netlifySiteId?: string;
  [key: string]: unknown;
}

/**
 * Backward-compatible alias for ChatHistoryItem.
 * Used by settings UI and import/export service.
 */
export type Chat = ChatHistoryItem;

const logger = createScopedLogger('ChatHistory');

// this is used at the top level and never rejects
export async function openDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') {
    logger.error('indexedDB is not available in this environment.');
    return undefined;
  }

  return new Promise((resolve) => {
    const request = indexedDB.open('appHistory', 3);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('chats')) {
          const store = db.createObjectStore('chats', { keyPath: 'id' });
          store.createIndex('id', 'id', { unique: true });
          store.createIndex('urlId', 'urlId', { unique: true });
        }
      }

      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', { keyPath: 'chatId' });
        }
      }

      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('branches')) {
          const branchStore = db.createObjectStore('branches', { keyPath: 'id' });
          branchStore.createIndex('parentChatId', 'parentChatId', { unique: false });
        }
      }
    };

    request.onblocked = () => {
      logger.warn('Database upgrade blocked — another tab may have an open connection. Close other tabs and reload.');
      resolve(undefined);
    };

    request.onsuccess = (event: Event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Handle version change from another tab (e.g., schema upgrade)
      db.onversionchange = () => {
        db.close();
        logger.info('Database version changed in another tab — connection closed. Please reload.');
      };

      resolve(db);
    };

    request.onerror = (event: Event) => {
      resolve(undefined);
      logger.error((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function getAll(db: IDBDatabase): Promise<ChatHistoryItem[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as ChatHistoryItem[]);
    request.onerror = () => reject(request.error);
  });
}

export async function setMessages(
  db: IDBDatabase,
  id: string,
  messages: Message[],
  urlId?: string,
  description?: string,
  timestamp?: string,
  metadata?: IChatMetadata,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite');
    const store = transaction.objectStore('chats');

    if (timestamp && isNaN(Date.parse(timestamp))) {
      reject(new Error('Invalid timestamp'));
      return;
    }

    const now = Date.now();

    const request = store.put({
      id,
      messages,
      urlId,
      description,
      timestamp: timestamp ?? new Date().toISOString(),
      updatedAt: now,
      metadata,
    });

    request.onerror = () => reject(request.error);

    transaction.oncomplete = () => {
      // Background sync to cloud (non-blocking) — only after transaction commits
      syncChatToCloud({
        id,
        urlId: urlId || id,
        description: description || '',
        messages,
        updatedAt: now,
        metadata: metadata as Record<string, unknown> | undefined,
      });
      resolve();
    };

    transaction.onerror = () => {
      if (handleIDBQuotaError(transaction.error, 'setMessages')) {
        reject(
          new Error('Storage quota exceeded while saving chat messages. Please free up space by deleting old chats.'),
        );
      } else {
        reject(transaction.error);
      }
    };
  });
}

export async function getMessages(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return (await getMessagesById(db, id)) || (await getMessagesByUrlId(db, id));
}

export async function getMessagesByUrlId(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const index = store.index('urlId');
    const request = index.get(id);

    request.onsuccess = () => resolve(request.result as ChatHistoryItem);
    request.onerror = () => reject(request.error);
  });
}

export async function getMessagesById(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as ChatHistoryItem);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteById(db: IDBDatabase, id: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['chats', 'snapshots', 'branches'], 'readwrite');
    const chatStore = transaction.objectStore('chats');
    const snapshotStore = transaction.objectStore('snapshots');

    chatStore.delete(id);
    snapshotStore.delete(id); // Also delete snapshot
    transaction.objectStore('branches').delete(id); // Delete branch metadata for this chat

    transaction.oncomplete = () => {
      // Background sync deletion to cloud — only after transaction commits
      syncDeleteToCloud(id);
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });

  // Clean up child branch references (branches that were forked FROM this chat)
  try {
    const childBranches = await getBranchesByParent(db, id);

    if (childBranches.length > 0) {
      const cleanupTx = db.transaction('branches', 'readwrite');

      for (const branch of childBranches) {
        cleanupTx.objectStore('branches').delete(branch.id);
      }
    }
  } catch {
    // Branch cleanup is best-effort
  }

  // Clean up ContextGraph data for this chat (separate IDB database)
  try {
    const { openContextGraphDB, deleteGraphForChat } = await import('./contextGraphStore');
    const graphDb = await openContextGraphDB();

    if (graphDb) {
      await deleteGraphForChat(graphDb, id);
    }
  } catch {
    // ContextGraph cleanup is best-effort
  }
}

export async function getNextId(_db: IDBDatabase): Promise<string> {
  /*
   * Use crypto.randomUUID() for strong uniqueness guarantees.
   * Falls back to timestamp + random suffix for environments without crypto.
   */
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function getUrlId(db: IDBDatabase, id: string): Promise<string> {
  const idList = await getUrlIds(db);

  if (!idList.includes(id)) {
    return id;
  } else {
    const MAX_ITERATIONS = 100;
    let i = 2;

    while (idList.includes(`${id}-${i}`)) {
      i++;

      if (i > MAX_ITERATIONS + 1) {
        // Fallback to a UUID-style suffix to guarantee uniqueness
        return `${id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      }
    }

    return `${id}-${i}`;
  }
}

async function getUrlIds(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const idList: string[] = [];

    const request = store.openCursor();

    request.onsuccess = (event: Event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

      if (cursor) {
        idList.push(cursor.value.urlId);
        cursor.continue();
      } else {
        resolve(idList);
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export interface ContextBranch {
  id: string;
  parentChatId: string;
  forkMessageId: string;
  forkMessageIndex: number;
  name: string;
  createdAt: number;
}

export async function forkChat(
  db: IDBDatabase,
  chatId: string,
  messageId: string,
  branchName?: string,
): Promise<string> {
  const chat = await getMessages(db, chatId);

  if (!chat) {
    throw new Error('Chat not found');
  }

  const messageIndex = chat.messages.findIndex((msg) => msg.id === messageId);

  if (messageIndex === -1) {
    throw new Error('Message not found');
  }

  const messages = chat.messages.slice(0, messageIndex + 1);
  const description = branchName || `${chat.description || 'Chat'} (fork)`;
  const urlId = await createChatFromMessages(db, description, messages);

  // Save branch metadata for ContextGraph tracking
  const newChat = await getMessagesByUrlId(db, urlId);

  if (newChat) {
    await saveBranch(db, {
      id: newChat.id,
      parentChatId: chatId,
      forkMessageId: messageId,
      forkMessageIndex: messageIndex,
      name: description,
      createdAt: Date.now(),
    });

    // Optionally track fork in ContextGraph
    try {
      const { openContextGraphDB, saveNode } = await import('./contextGraphStore');
      const { createNode } = await import('./contextGraph');
      const graphDb = await openContextGraphDB();

      if (graphDb) {
        const node = await createNode({
          parents: [],
          chatId: newChat.id,
          messageIndex,
          messageCount: messages.length,
          changeSummary: `Forked from ${chatId} at message ${messageIndex}`,
          currentFiles: {},
          previousFiles: {},
        });
        await saveNode(graphDb, node);
      }
    } catch {
      // ContextGraph integration is optional
    }
  }

  return urlId;
}

export async function duplicateChat(db: IDBDatabase, id: string): Promise<string> {
  const chat = await getMessages(db, id);

  if (!chat) {
    throw new Error('Chat not found');
  }

  return createChatFromMessages(db, `${chat.description || 'Chat'} (copy)`, chat.messages);
}

export async function createChatFromMessages(
  db: IDBDatabase,
  description: string,
  messages: Message[],
  metadata?: IChatMetadata,
): Promise<string> {
  const newId = await getNextId(db);
  const newUrlId = await getUrlId(db, newId); // Get a new urlId for the duplicated chat

  await setMessages(
    db,
    newId,
    messages,
    newUrlId, // Use the new urlId
    description,
    undefined, // Use the current timestamp
    metadata,
  );

  return newUrlId; // Return the urlId instead of id for navigation
}

export async function updateChatDescription(db: IDBDatabase, id: string, description: string): Promise<void> {
  const chat = await getMessages(db, id);

  if (!chat) {
    throw new Error('Chat not found');
  }

  if (!description.trim()) {
    throw new Error('Description cannot be empty');
  }

  // Update locally — setMessages already triggers cloud sync via transaction.oncomplete
  await setMessages(db, id, chat.messages, chat.urlId, description, chat.timestamp, chat.metadata);
}

export async function updateChatMetadata(
  db: IDBDatabase,
  id: string,
  metadata: IChatMetadata | undefined,
): Promise<void> {
  const chat = await getMessages(db, id);

  if (!chat) {
    throw new Error('Chat not found');
  }

  await setMessages(db, id, chat.messages, chat.urlId, chat.description, chat.timestamp, metadata);
}

export async function getSnapshot(db: IDBDatabase, chatId: string): Promise<Snapshot | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshots', 'readonly');
    const store = transaction.objectStore('snapshots');
    const request = store.get(chatId);

    request.onsuccess = () => resolve(request.result?.snapshot as Snapshot | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function setSnapshot(db: IDBDatabase, chatId: string, snapshot: Snapshot): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshots', 'readwrite');
    const store = transaction.objectStore('snapshots');
    const request = store.put({ chatId, snapshot });

    request.onsuccess = () => resolve();

    request.onerror = () => {
      if (handleIDBQuotaError(request.error, 'setSnapshot')) {
        reject(new Error('Storage quota exceeded while saving snapshot. Please free up space by deleting old chats.'));
      } else {
        reject(request.error);
      }
    };
  });
}

export async function deleteSnapshot(db: IDBDatabase, chatId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshots', 'readwrite');
    const store = transaction.objectStore('snapshots');
    const request = store.delete(chatId);

    request.onsuccess = () => resolve();

    request.onerror = (event) => {
      if ((event.target as IDBRequest).error?.name === 'NotFoundError') {
        resolve();
      } else {
        reject(request.error);
      }
    };
  });
}

export async function deleteAllChats(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['chats', 'snapshots', 'branches'], 'readwrite');
    const chatStore = transaction.objectStore('chats');
    const snapshotStore = transaction.objectStore('snapshots');
    const branchStore = transaction.objectStore('branches');

    const clearChats = chatStore.clear();
    const clearSnapshots = snapshotStore.clear();
    const clearBranches = branchStore.clear();

    let chatsCleared = false;
    let snapshotsCleared = false;
    let branchesCleared = false;

    const checkCompletion = () => {
      if (chatsCleared && snapshotsCleared && branchesCleared) {
        // Sync delete-all to cloud
        syncDeleteAllToCloud();

        // Also clear the ContextGraph database (separate IDB)
        try {
          indexedDB.deleteDatabase('talosContextGraph');
        } catch {
          // ContextGraph DB may not exist — that's fine
        }

        resolve();
      }
    };

    clearChats.onsuccess = () => {
      chatsCleared = true;
      checkCompletion();
    };
    clearChats.onerror = () => reject(clearChats.error);

    clearSnapshots.onsuccess = () => {
      snapshotsCleared = true;
      checkCompletion();
    };
    clearSnapshots.onerror = () => reject(clearSnapshots.error);

    clearBranches.onsuccess = () => {
      branchesCleared = true;
      checkCompletion();
    };
    clearBranches.onerror = () => reject(clearBranches.error);

    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Backward-compatible aliases for migration from chats.ts.
 */
export const getAllChats = getAll;
export const deleteChat = deleteById;

export async function saveBranch(db: IDBDatabase, branch: ContextBranch): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('branches', 'readwrite');
    tx.objectStore('branches').put(branch);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBranchesByParent(db: IDBDatabase, parentChatId: string): Promise<ContextBranch[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('branches', 'readonly');
    const index = tx.objectStore('branches').index('parentChatId');
    const request = index.getAll(parentChatId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getBranchById(db: IDBDatabase, chatId: string): Promise<ContextBranch | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('branches', 'readonly');
    const request = tx.objectStore('branches').get(chatId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteBranch(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('branches', 'readwrite');
    tx.objectStore('branches').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
