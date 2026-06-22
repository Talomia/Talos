import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('cloud-persistence');

/**
 * Conflict resolution strategy for cloud sync.
 *
 * - 'newer-wins': Accept whichever version has a later `updatedAt` timestamp (default).
 * - 'remote-wins': Always accept the cloud version.
 * - 'local-wins': Always keep the local version.
 */
export type ConflictResolution = 'remote-wins' | 'local-wins' | 'newer-wins';

let _conflictResolution: ConflictResolution = 'newer-wins';

/** Change the conflict resolution strategy at runtime. */
export function setConflictResolution(strategy: ConflictResolution): void {
  _conflictResolution = strategy;
  logger.info(`Conflict resolution strategy set to: ${strategy}`);
}

/** Return the current conflict resolution strategy. */
export function getConflictResolution(): ConflictResolution {
  return _conflictResolution;
}

/**
 * Cloud persistence adapter that syncs local IndexedDB data with the
 * server-side Supabase database. This provides:
 *
 * 1. Transparent sync — local writes are mirrored to the server when authenticated
 * 2. Graceful degradation — works fully offline or when unauthenticated
 * 3. Background sync — doesn't block the UI thread
 * 4. Deduplication — rapid saves to the same chat are coalesced
 *
 * The local IndexedDB remains the source of truth for the UI,
 * while the server provides cross-device sync and backup.
 */

interface SyncableChat {
  id: string;
  urlId: string;
  description: string;
  messages: any[];
  updatedAt?: number;
  metadata?: Record<string, any>;
  snapshot?: {
    chatIndex: string;
    files: Record<string, any>;
    summary?: string;
  };
}

let _isAuthenticated = false;
let _isSyncing = false;

/**
 * Pending sync operations keyed by chat ID.
 * When a new sync for the same chat arrives, it replaces the pending one
 * instead of queuing a redundant request.
 */
const _pendingChatSyncs = new Map<string, SyncableChat>();
const _pendingDeletes = new Set<string>();
const _pendingDescriptions = new Map<string, { chatId: string; description: string }>();
let _syncScheduled = false;

/**
 * Initialize cloud persistence.
 * Checks authentication status, pulls cloud projects, and starts any pending sync.
 */
export async function initCloudPersistence(): Promise<void> {
  try {
    const response = await fetch('/api/auth/user');
    const data = (await response.json()) as { user: any };
    _isAuthenticated = !!data.user;

    if (_isAuthenticated) {
      logger.info('Cloud persistence enabled — user is authenticated');

      // Pull cloud projects into local IDB (non-blocking)
      pullFromCloud().catch((error) => {
        logger.error('Cloud pull failed:', error);
      });

      scheduleSyncFlush();
    } else {
      logger.info('Cloud persistence disabled — user not authenticated');
    }
  } catch {
    _isAuthenticated = false;
    logger.info('Cloud persistence disabled — auth check failed');
  }
}

/**
 * Pull projects from cloud and merge into local IndexedDB.
 *
 * Only imports projects that don't already exist locally — local IDB
 * is always the source of truth for existing chats. This enables
 * cross-device sync: projects created on device A appear on device B.
 *
 * Writes directly to IDB (bypasses `setMessages`) to avoid triggering
 * a circular sync-to-cloud for data that already lives in the cloud.
 */
export async function pullFromCloud(): Promise<number> {
  const cloudProjects = await loadProjectsFromCloud();

  if (!cloudProjects || cloudProjects.length === 0) {
    return 0;
  }

  // Lazy-import to avoid circular dependency (db.ts imports cloudSync.ts)
  const { openDatabase } = await import('./db');
  const db = await openDatabase();

  if (!db) {
    logger.warn('Cloud pull: local database unavailable');
    return 0;
  }

  // Load all local chats keyed by ID for conflict resolution
  const localChats = await new Promise<Map<string, any>>((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.getAll();

    request.onsuccess = () => {
      const map = new Map<string, any>();

      for (const chat of request.result) {
        map.set(chat.id, chat);
      }

      resolve(map);
    };
    request.onerror = () => reject(request.error);
  });

  let imported = 0;

  for (const project of cloudProjects) {
    const localChat = localChats.get(project.id);

    if (!localChat) {
      // Project only exists in cloud — import it
      try {
        await importCloudProject(db, project);
        imported++;
      } catch (error) {
        logger.error(`Cloud pull: failed to import project ${project.id}:`, error);
      }

      continue;
    }

    // Both versions exist — resolve the conflict
    const resolution = resolveConflict(localChat, project);

    if (resolution === 'remote') {
      try {
        await importCloudProject(db, project);
        imported++;
        logger.info(
          `Cloud pull: conflict resolved for ${project.id} — accepted remote version ` +
            `(strategy=${_conflictResolution}, local.updatedAt=${localChat.updatedAt ?? 'none'}, ` +
            `remote.updatedAt=${project.updatedAt ?? 'none'})`,
        );
      } catch (error) {
        logger.error(`Cloud pull: failed to overwrite project ${project.id}:`, error);
      }
    } else {
      logger.debug(
        `Cloud pull: conflict resolved for ${project.id} — kept local version ` +
          `(strategy=${_conflictResolution}, local.updatedAt=${localChat.updatedAt ?? 'none'}, ` +
          `remote.updatedAt=${project.updatedAt ?? 'none'})`,
      );
    }
  }

  if (imported > 0) {
    logger.info(`Cloud pull: imported/updated ${imported} project(s) from cloud`);
  }

  return imported;
}

/**
 * Resolve a conflict between a local and remote version of the same chat.
 * Returns 'local' to keep the local version, or 'remote' to accept the cloud version.
 */
function resolveConflict(localChat: any, remoteChat: SyncableChat): 'local' | 'remote' {
  if (_conflictResolution === 'remote-wins') {
    return 'remote';
  }

  if (_conflictResolution === 'local-wins') {
    return 'local';
  }

  // 'newer-wins' (default): compare updatedAt timestamps
  const localUpdatedAt: number = localChat.updatedAt ?? 0;
  const remoteUpdatedAt: number = remoteChat.updatedAt ?? 0;

  const CLOSE_THRESHOLD_MS = 5_000;

  if (Math.abs(remoteUpdatedAt - localUpdatedAt) <= CLOSE_THRESHOLD_MS) {
    // Timestamps are equal or very close — prefer the version with more messages
    const localMsgCount = Array.isArray(localChat.messages) ? localChat.messages.length : 0;
    const remoteMsgCount = Array.isArray(remoteChat.messages) ? remoteChat.messages.length : 0;

    logger.debug(
      `Cloud pull: timestamps within ${CLOSE_THRESHOLD_MS}ms threshold for ${remoteChat.id} ` +
        `— comparing message counts (local=${localMsgCount}, remote=${remoteMsgCount})`,
    );

    return remoteMsgCount > localMsgCount ? 'remote' : 'local';
  }

  return remoteUpdatedAt > localUpdatedAt ? 'remote' : 'local';
}

/**
 * Write a cloud project into local IDB directly (bypasses setMessages to avoid circular sync).
 */
async function importCloudProject(db: IDBDatabase, project: SyncableChat): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite');
    const store = transaction.objectStore('chats');

    const request = store.put({
      id: project.id,
      urlId: project.urlId || project.id,
      description: project.description || '',
      messages: project.messages || [],
      timestamp: new Date().toISOString(),
      updatedAt: project.updatedAt ?? Date.now(),
      metadata: project.metadata,
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Re-check auth state. Call this when auth state may have changed
 * (e.g., login/logout in another tab).
 */
export async function refreshCloudAuthState(): Promise<void> {
  try {
    const response = await fetch('/api/auth/user');
    const data = (await response.json()) as { user: any };
    const wasAuthenticated = _isAuthenticated;
    _isAuthenticated = !!data.user;

    if (_isAuthenticated && !wasAuthenticated) {
      logger.info('Cloud persistence re-enabled after auth refresh');
      scheduleSyncFlush();
    } else if (!_isAuthenticated && wasAuthenticated) {
      logger.info('Cloud persistence disabled — user logged out');
    }
  } catch {
    _isAuthenticated = false;
  }
}

/**
 * Sync a chat save to the server.
 * Deduplicates: if a sync for the same chatId is already pending,
 * it's replaced with the latest data instead of queuing twice.
 */
export function syncChatToCloud(chat: SyncableChat): void {
  if (!_isAuthenticated) {
    return;
  }

  // Replace any pending sync for the same chat (deduplication)
  _pendingChatSyncs.set(chat.id, chat);
  scheduleSyncFlush();
}

/**
 * Sync a chat deletion to the server.
 */
export function syncDeleteToCloud(chatId: string): void {
  if (!_isAuthenticated) {
    return;
  }

  // If there's a pending save for this chat, remove it — it's being deleted
  _pendingChatSyncs.delete(chatId);
  _pendingDescriptions.delete(chatId);
  _pendingDeletes.add(chatId);
  scheduleSyncFlush();
}

/**
 * Sync all chat deletions to the server.
 */
export function syncDeleteAllToCloud(): void {
  if (!_isAuthenticated) {
    return;
  }

  // Clear all pending operations since everything is being deleted
  _pendingChatSyncs.clear();
  _pendingDescriptions.clear();
  _pendingDeletes.clear();

  // Queue the delete-all operation directly
  flushDeleteAll();
}

/**
 * Sync a description update to the server.
 * Uses lightweight PUT instead of re-uploading all messages.
 */
export function syncDescriptionToCloud(chatId: string, description: string): void {
  if (!_isAuthenticated) {
    return;
  }

  // If there's already a pending full chat sync, just update its description
  const pendingChat = _pendingChatSyncs.get(chatId);

  if (pendingChat) {
    pendingChat.description = description;
    return;
  }

  _pendingDescriptions.set(chatId, { chatId, description });
  scheduleSyncFlush();
}

/**
 * Load all projects from the server.
 * Returns null if not authenticated or on error.
 */
export async function loadProjectsFromCloud(): Promise<SyncableChat[] | null> {
  if (!_isAuthenticated) {
    return null;
  }

  try {
    const response = await fetch('/api/projects');

    if (!response.ok) {
      logger.error(`Failed to load projects: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as { projects?: any[]; authenticated?: boolean };

    if (!data.authenticated || !data.projects) {
      return null;
    }

    return data.projects;
  } catch (error) {
    logger.error('Failed to load projects from cloud:', error);
    return null;
  }
}

/**
 * Load a single project with messages from the server.
 */
export async function loadProjectFromCloud(projectId: string): Promise<{ chat: SyncableChat; snapshot?: any } | null> {
  if (!_isAuthenticated) {
    return null;
  }

  try {
    const response = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`);

    if (!response.ok) {
      logger.error(`Failed to load project: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as { project?: any; snapshot?: any };

    if (!data.project) {
      return null;
    }

    return { chat: data.project, snapshot: data.snapshot };
  } catch (error) {
    logger.error('Failed to load project from cloud:', error);
    return null;
  }
}

/**
 * Check if cloud persistence is enabled (user is authenticated).
 */
export function isCloudEnabled(): boolean {
  return _isAuthenticated;
}

/*
 * ==========================================
 * Internal sync engine with deduplication
 * ==========================================
 */

/**
 * Schedule a debounced sync flush.
 * Coalesces rapid operations into a single flush.
 */
function scheduleSyncFlush(): void {
  if (_syncScheduled) {
    return;
  }

  _syncScheduled = true;

  // Debounce: wait 300ms to coalesce rapid saves
  setTimeout(() => {
    _syncScheduled = false;
    flushPendingSyncs();
  }, 300);
}

async function flushPendingSyncs(): Promise<void> {
  if (_isSyncing) {
    // If already syncing, reschedule
    scheduleSyncFlush();
    return;
  }

  _isSyncing = true;

  try {
    // Re-check auth before syncing
    if (!_isAuthenticated) {
      await refreshCloudAuthState();

      if (!_isAuthenticated) {
        return;
      }
    }

    // Process deletes first
    for (const chatId of _pendingDeletes) {
      await executeSyncOperation(
        async () => {
          const response = await fetch('/api/projects', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: chatId }),
          });

          if (!response.ok) {
            throw new Error(`Delete sync failed: ${response.status}`);
          }
        },
        'deletion',
        chatId,
      );
    }
    _pendingDeletes.clear();

    // Process description-only updates
    for (const [chatId, { description }] of _pendingDescriptions) {
      await executeSyncOperation(
        async () => {
          const response = await fetch('/api/projects', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: chatId, description }),
          });

          if (!response.ok) {
            throw new Error(`Description sync failed: ${response.status}`);
          }
        },
        'description',
        chatId,
      );
    }
    _pendingDescriptions.clear();

    // Process full chat syncs (already deduplicated by Map key)
    for (const [chatId, chat] of _pendingChatSyncs) {
      await executeSyncOperation(
        async () => {
          const response = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: chat.id,
              urlId: chat.urlId,
              description: chat.description,
              messages: chat.messages,
              updatedAt: chat.updatedAt ?? Date.now(),
              metadata: chat.metadata,
              snapshot: chat.snapshot,
            }),
          });

          if (!response.ok) {
            // Handle auth expiry
            if (response.status === 401 || response.status === 403) {
              _isAuthenticated = false;
              logger.warn('Cloud sync auth expired — disabling cloud persistence');
            }

            throw new Error(`Chat sync failed: ${response.status}`);
          }
        },
        'chat',
        chatId,
      );
    }
    _pendingChatSyncs.clear();
  } finally {
    _isSyncing = false;
  }
}

async function flushDeleteAll(): Promise<void> {
  try {
    const response = await fetch('/api/projects', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteAll: true }),
    });

    if (!response.ok) {
      logger.error(`Delete-all sync failed: ${response.status}`);
    }
  } catch (error) {
    logger.error('Failed to sync delete-all to cloud:', error);
  }
}

async function executeSyncOperation(operation: () => Promise<void>, type: string, id: string): Promise<void> {
  try {
    await operation();
  } catch (error) {
    logger.error(`Failed to sync ${type} (${id}) to cloud:`, error);
  }
}
