/**
 * ContextGraph IndexedDB Store
 * =============================
 * Persistence layer for the ContextGraph DAG.
 * Stores context nodes and branch references in IndexedDB.
 *
 * Object stores:
 * - `context-nodes`: Content-addressed ContextNode objects
 * - `context-branches`: Named branch references
 * - `context-heads`: HEAD pointers per chat
 */

import { createScopedLogger } from '~/utils/logger';
import type { ContextNode, ContextBranch as GraphBranch, HeadPointer, NodeId } from './contextGraph';

const logger = createScopedLogger('context-graph-store');

const DB_NAME = 'talosContextGraph';
const DB_VERSION = 1;

const STORE_NODES = 'context-nodes';
const STORE_BRANCHES = 'context-branches';
const STORE_HEADS = 'context-heads';

/**
 * Open (or create) the ContextGraph database.
 */
export async function openContextGraphDB(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') {
    logger.warn('IndexedDB not available — ContextGraph disabled');
    return undefined;
  }

  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NODES)) {
        const nodeStore = db.createObjectStore(STORE_NODES, { keyPath: 'id' });
        nodeStore.createIndex('chatId', 'chatId', { unique: false });
        nodeStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_BRANCHES)) {
        const branchStore = db.createObjectStore(STORE_BRANCHES, { keyPath: ['chatId', 'name'] });
        branchStore.createIndex('chatId', 'chatId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_HEADS)) {
        db.createObjectStore(STORE_HEADS, { keyPath: 'chatId' });
      }

      logger.info('ContextGraph database initialized');
    };

    request.onsuccess = (event: Event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = () => {
      logger.error('Failed to open ContextGraph database:', request.error);
      resolve(undefined);
    };
  });
}

/*
 * ==========================================
 * Node Operations
 * ==========================================
 */

/** Save a context node to the store. Idempotent (content-addressed). */
export async function saveNode(db: IDBDatabase, node: ContextNode): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NODES, 'readwrite');
    tx.objectStore(STORE_NODES).put(node);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get a context node by its content-addressed ID. */
export async function getNode(db: IDBDatabase, nodeId: NodeId): Promise<ContextNode | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NODES, 'readonly');
    const request = tx.objectStore(STORE_NODES).get(nodeId);
    request.onsuccess = () => resolve(request.result ?? undefined);
    request.onerror = () => reject(request.error);
  });
}

/** Get all context nodes for a chat. */
export async function getNodesByChatId(db: IDBDatabase, chatId: string): Promise<ContextNode[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NODES, 'readonly');
    const index = tx.objectStore(STORE_NODES).index('chatId');
    const request = index.getAll(chatId);
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

/** Count nodes for a chat. */
export async function countNodes(db: IDBDatabase, chatId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NODES, 'readonly');
    const index = tx.objectStore(STORE_NODES).index('chatId');
    const request = index.count(chatId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Delete all nodes for a chat. */
export async function deleteNodesByChatId(db: IDBDatabase, chatId: string): Promise<void> {
  const nodes = await getNodesByChatId(db, chatId);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NODES, 'readwrite');
    const store = tx.objectStore(STORE_NODES);

    for (const node of nodes) {
      store.delete(node.id);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/*
 * ==========================================
 * Branch Operations
 * ==========================================
 */

/** Save or update a branch reference. */
export async function saveBranchRef(db: IDBDatabase, branch: GraphBranch): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BRANCHES, 'readwrite');
    tx.objectStore(STORE_BRANCHES).put(branch);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get a specific branch by chat ID and name. */
export async function getBranch(db: IDBDatabase, chatId: string, name: string): Promise<GraphBranch | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BRANCHES, 'readonly');
    const request = tx.objectStore(STORE_BRANCHES).get([chatId, name]);
    request.onsuccess = () => resolve(request.result ?? undefined);
    request.onerror = () => reject(request.error);
  });
}

/** Get all branches for a chat. */
export async function getBranchesByChatId(db: IDBDatabase, chatId: string): Promise<GraphBranch[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BRANCHES, 'readonly');
    const index = tx.objectStore(STORE_BRANCHES).index('chatId');
    const request = index.getAll(chatId);
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

/** Delete a branch. */
export async function deleteBranchRef(db: IDBDatabase, chatId: string, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BRANCHES, 'readwrite');
    tx.objectStore(STORE_BRANCHES).delete([chatId, name]);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete all branches for a chat. */
export async function deleteAllBranches(db: IDBDatabase, chatId: string): Promise<void> {
  const branches = await getBranchesByChatId(db, chatId);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BRANCHES, 'readwrite');
    const store = tx.objectStore(STORE_BRANCHES);

    for (const branch of branches) {
      store.delete([branch.chatId, branch.name]);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/*
 * ==========================================
 * HEAD Operations
 * ==========================================
 */

/** Save or update the HEAD pointer for a chat. */
export async function saveHead(db: IDBDatabase, head: HeadPointer): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HEADS, 'readwrite');
    tx.objectStore(STORE_HEADS).put(head);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get the HEAD pointer for a chat. */
export async function getHead(db: IDBDatabase, chatId: string): Promise<HeadPointer | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HEADS, 'readonly');
    const request = tx.objectStore(STORE_HEADS).get(chatId);
    request.onsuccess = () => resolve(request.result ?? undefined);
    request.onerror = () => reject(request.error);
  });
}

/** Delete the HEAD pointer for a chat. */
export async function deleteHead(db: IDBDatabase, chatId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HEADS, 'readwrite');
    tx.objectStore(STORE_HEADS).delete(chatId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/*
 * ==========================================
 * Cleanup
 * ==========================================
 */

/** Delete all ContextGraph data for a chat (nodes, branches, HEAD). */
export async function deleteGraphForChat(db: IDBDatabase, chatId: string): Promise<void> {
  await deleteNodesByChatId(db, chatId);
  await deleteAllBranches(db, chatId);
  await deleteHead(db, chatId);
  logger.info(`Deleted context graph for chat ${chatId}`);
}
