import type { Message } from 'ai';
import type { Snapshot } from './types';
import { atom } from 'nanostores';
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
  messages: Message[];
  updatedAt?: number;
  metadata?: Record<string, unknown>;
  snapshot?: Snapshot;
}

let _isAuthenticated = false;
let _isSyncing = false;
let _initStarted = false;

/*
 * ==========================================
 * Reactive State (for UI components)
 * ==========================================
 */

/** Reactive sync status for UI binding. */
export const syncStatus = atom<'idle' | 'syncing' | 'synced' | 'error'>('idle');

/** Timestamp of last successful sync. */
export const lastSyncTime = atom<number | null>(null);

/** Whether cloud sync is enabled (user authenticated). */
export const cloudEnabled = atom<boolean>(false);

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
 *
 * Guarded against double invocation (e.g., React strict mode or
 * multiple component mounts triggering init concurrently).
 */
export async function initCloudPersistence(): Promise<void> {
  // Prevent double initialization from React strict mode / concurrent mounts
  if (_initStarted) {
    return;
  }

  _initStarted = true;

  try {
    const response = await fetch('/api/auth/user');
    const data = (await response.json()) as { user: Record<string, unknown> | null };
    _isAuthenticated = !!data.user;
    cloudEnabled.set(_isAuthenticated);

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
    cloudEnabled.set(false);
    _initStarted = false; // Allow retry on failure
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
  // Don't attempt pull while rate-limited
  if (isCircuitBreakerOpen()) {
    logger.debug('Circuit breaker open — skipping cloud pull');
    return 0;
  }

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
  const localChats = await new Promise<Map<string, SyncableChat>>((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.getAll();

    request.onsuccess = () => {
      const map = new Map<string, SyncableChat>();

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

    // Notify other tabs that IDB has been updated
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('talos-sync');
        channel.postMessage({ type: 'cloud-pull-complete', imported });
        channel.close();
      } catch (error) {
        logger.debug('BroadcastChannel notify failed:', error);
      }
    }
  }

  return imported;
}

/**
 * Resolve a conflict between a local and remote version of the same chat.
 * Returns 'local' to keep the local version, or 'remote' to accept the cloud version.
 */
function resolveConflict(localChat: SyncableChat, remoteChat: SyncableChat): 'local' | 'remote' {
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
    const data = (await response.json()) as { user: Record<string, unknown> | null };
    const wasAuthenticated = _isAuthenticated;
    _isAuthenticated = !!data.user;
    cloudEnabled.set(_isAuthenticated);

    if (_isAuthenticated && !wasAuthenticated) {
      logger.info('Cloud persistence re-enabled after auth refresh');
      scheduleSyncFlush();
    } else if (!_isAuthenticated && wasAuthenticated) {
      logger.info('Cloud persistence disabled — user logged out');
    }
  } catch {
    _isAuthenticated = false;
    cloudEnabled.set(false);
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

  // Don't attempt load while rate-limited
  if (isCircuitBreakerOpen()) {
    logger.debug('Circuit breaker open — skipping project load');
    return null;
  }

  try {
    const response = await fetch('/api/projects');

    if (!response.ok) {
      // Track 429s for circuit breaker
      if (response.status === 429) {
        _consecutive429Count++;

        if (_consecutive429Count >= CIRCUIT_BREAKER_THRESHOLD) {
          tripCircuitBreaker();
        }
      }

      logger.error(`Failed to load projects: ${response.status} ${response.statusText}`);

      return null;
    }

    // Success — reset 429 counter
    _consecutive429Count = 0;

    const data = (await response.json()) as { projects?: SyncableChat[]; authenticated?: boolean };

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
export async function loadProjectFromCloud(
  projectId: string,
): Promise<{ chat: SyncableChat; snapshot?: Snapshot } | null> {
  if (!_isAuthenticated) {
    return null;
  }

  try {
    const response = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`);

    if (!response.ok) {
      logger.error(`Failed to load project: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as { project?: SyncableChat; snapshot?: Snapshot };

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
 *
 * Uses a 5-second debounce to prevent overwhelming the server during
 * active streaming, where storeMessageHistory fires every ~50ms.
 * Local IndexedDB is the source of truth; cloud sync is background-only.
 */
function scheduleSyncFlush(): void {
  if (_syncScheduled) {
    return;
  }

  _syncScheduled = true;

  // Debounce: wait 5s to coalesce rapid saves (especially during streaming)
  setTimeout(() => {
    _syncScheduled = false;
    flushPendingSyncs();
  }, 5_000);
}

async function flushPendingSyncs(): Promise<void> {
  if (_isSyncing) {
    // If already syncing, reschedule
    scheduleSyncFlush();
    return;
  }

  // Don't attempt sync while rate-limited
  if (isCircuitBreakerOpen()) {
    logger.debug('Circuit breaker open — deferring sync flush');
    return;
  }

  _isSyncing = true;
  syncStatus.set('syncing');

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
              cloudEnabled.set(false);
              syncStatus.set('error');
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

    if (syncStatus.get() !== 'error') {
      syncStatus.set('synced');
      lastSyncTime.set(Date.now());
    }
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

/*
 * =============================================
 * Failed Sync Retry Queue
 * =============================================
 * When a sync operation fails (network error, server error),
 * it's added to a retry queue with exponential backoff.
 *
 * Rate-limit protection:
 * - 429 responses trigger a circuit breaker that pauses ALL syncs
 * - Retry entries are deduplicated by (type + id)
 * - Queue size is capped to prevent unbounded growth
 */

interface RetryEntry {
  operation: () => Promise<void>;
  type: string;
  id: string;
  attempt: number;
  maxAttempts: number;
  nextRetryAt: number;
}

const _retryQueue: RetryEntry[] = [];
const MAX_RETRY_ATTEMPTS = 5;
const MAX_RETRY_QUEUE_SIZE = 20;
const BASE_RETRY_DELAY_MS = 1000; // 1 second, doubles each attempt
const RATE_LIMIT_RETRY_DELAY_MS = 5000; // 5 seconds for 429 responses
let _retryTimerId: ReturnType<typeof setTimeout> | null = null;

/*
 * Circuit breaker: after repeated 429s, stop all sync attempts
 * for a cooldown period to let the server recover.
 */
let _consecutive429Count = 0;
const CIRCUIT_BREAKER_THRESHOLD = 3; // consecutive 429s before tripping
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000; // 60 seconds cooldown
let _circuitBreakerUntil = 0; // timestamp when circuit breaker resets

function isCircuitBreakerOpen(): boolean {
  if (_circuitBreakerUntil > Date.now()) {
    return true;
  }

  // Circuit breaker has expired — reset
  if (_circuitBreakerUntil > 0) {
    _circuitBreakerUntil = 0;
    _consecutive429Count = 0;
    logger.info('Circuit breaker reset — resuming cloud sync');
  }

  return false;
}

function tripCircuitBreaker(): void {
  _circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  syncStatus.set('error');

  // Clear retry queue — all pending retries would just hit 429 too
  _retryQueue.length = 0;

  if (_retryTimerId) {
    clearTimeout(_retryTimerId);
    _retryTimerId = null;
  }

  logger.warn(
    `Circuit breaker tripped after ${_consecutive429Count} consecutive 429s — ` +
      `pausing cloud sync for ${CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s`,
  );
}

async function executeSyncOperation(operation: () => Promise<void>, type: string, id: string): Promise<void> {
  // Check circuit breaker before attempting
  if (isCircuitBreakerOpen()) {
    logger.debug(`Circuit breaker open — skipping ${type} (${id}) sync`);
    return;
  }

  try {
    await operation();

    // Success — reset 429 counter
    _consecutive429Count = 0;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(`Failed to sync ${type} (${id}) to cloud:`, error);

    // Don't retry auth errors — they won't succeed
    if (errorMessage.includes('401') || errorMessage.includes('403')) {
      return;
    }

    // Handle 429 rate limiting
    if (errorMessage.includes('429')) {
      _consecutive429Count++;

      if (_consecutive429Count >= CIRCUIT_BREAKER_THRESHOLD) {
        tripCircuitBreaker();
        return;
      }
    }

    // Deduplicate: replace existing retry for the same (type + id)
    const existingIndex = _retryQueue.findIndex((e) => e.type === type && e.id === id);

    if (existingIndex >= 0) {
      // Replace the operation but keep the attempt count to avoid resetting backoff
      const existing = _retryQueue[existingIndex];
      existing.operation = operation;

      // Don't reset nextRetryAt — respect the existing backoff schedule
      return;
    }

    // Cap queue size — drop oldest entries if full
    if (_retryQueue.length >= MAX_RETRY_QUEUE_SIZE) {
      const dropped = _retryQueue.shift();
      logger.warn(`Retry queue full — dropped oldest entry: ${dropped?.type} (${dropped?.id})`);
    }

    // Add to retry queue with appropriate delay
    const isRateLimit = errorMessage.includes('429');
    const baseDelay = isRateLimit ? RATE_LIMIT_RETRY_DELAY_MS : BASE_RETRY_DELAY_MS;

    _retryQueue.push({
      operation,
      type,
      id,
      attempt: 0,
      maxAttempts: MAX_RETRY_ATTEMPTS,
      nextRetryAt: Date.now() + baseDelay,
    });

    scheduleRetryFlush();
  }
}

function scheduleRetryFlush(): void {
  if (_retryTimerId) {
    return;
  }

  if (_retryQueue.length === 0) {
    return;
  }

  // Don't schedule if circuit breaker is open
  if (isCircuitBreakerOpen()) {
    return;
  }

  // Find the soonest retry time
  const nextRetry = Math.min(..._retryQueue.map((e) => e.nextRetryAt));
  const delay = Math.max(0, nextRetry - Date.now());

  _retryTimerId = setTimeout(() => {
    _retryTimerId = null;
    processRetryQueue().catch((error) => {
      logger.error('Retry queue processing error:', error);
    });
  }, delay);
}

async function processRetryQueue(): Promise<void> {
  if (_retryQueue.length === 0) {
    return;
  }

  // Check circuit breaker before processing
  if (isCircuitBreakerOpen()) {
    return;
  }

  const now = Date.now();
  const ready = _retryQueue.filter((e) => e.nextRetryAt <= now);

  for (const entry of ready) {
    // Re-check circuit breaker between operations
    if (isCircuitBreakerOpen()) {
      break;
    }

    entry.attempt++;

    try {
      await entry.operation();

      // Success — remove from queue and reset 429 counter
      const index = _retryQueue.indexOf(entry);

      if (index >= 0) {
        _retryQueue.splice(index, 1);
      }

      _consecutive429Count = 0;
      logger.info(`Retry succeeded for ${entry.type} (${entry.id}) on attempt ${entry.attempt}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for 429 in retry
      if (errorMessage.includes('429')) {
        _consecutive429Count++;

        if (_consecutive429Count >= CIRCUIT_BREAKER_THRESHOLD) {
          tripCircuitBreaker();
          return;
        }
      }

      if (entry.attempt >= entry.maxAttempts) {
        // Give up
        const index = _retryQueue.indexOf(entry);

        if (index >= 0) {
          _retryQueue.splice(index, 1);
        }

        logger.error(
          `Retry queue: giving up on ${entry.type} (${entry.id}) after ${entry.maxAttempts} attempts:`,
          error,
        );
      } else {
        // Exponential backoff (longer for 429s)
        const isRateLimit = errorMessage.includes('429');
        const base = isRateLimit ? RATE_LIMIT_RETRY_DELAY_MS : BASE_RETRY_DELAY_MS;
        const delay = base * Math.pow(2, entry.attempt);
        entry.nextRetryAt = Date.now() + delay;
        logger.warn(
          `Retry queue: ${entry.type} (${entry.id}) attempt ${entry.attempt}/${entry.maxAttempts} failed, ` +
            `next retry in ${delay}ms`,
        );
      }
    }
  }

  // Schedule next batch if there are remaining entries
  if (_retryQueue.length > 0) {
    scheduleRetryFlush();
  }
}

/** Get the current retry queue status (for UI display). */
export function getRetryQueueStatus(): {
  pending: number;
  entries: Array<{ type: string; id: string; attempt: number }>;
} {
  return {
    pending: _retryQueue.length,
    entries: _retryQueue.map((e) => ({ type: e.type, id: e.id, attempt: e.attempt })),
  };
}

/** Manually trigger retry of all queued operations. */
export function retryAllPending(): void {
  for (const entry of _retryQueue) {
    entry.nextRetryAt = Date.now();
  }

  scheduleRetryFlush();
}

/*
 * =============================================
 * Cross-tab sync via BroadcastChannel
 * =============================================
 */

if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  try {
    const _syncChannel = new BroadcastChannel('talos-sync');

    _syncChannel.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { type?: string; imported?: number } | undefined;

      if (data?.type === 'cloud-pull-complete' && _isAuthenticated) {
        logger.info(`Another tab synced ${data.imported ?? '?'} project(s) — refreshing local data`);

        /*
         * Re-import from IDB; the other tab already wrote the data,
         * so we just need the UI in *this* tab to pick it up.
         * Dispatch a custom event that UI components can listen for.
         */
        window.dispatchEvent(new CustomEvent('talos-sync-update', { detail: data }));
      }
    });
  } catch (error) {
    logger.debug('BroadcastChannel listener setup failed:', error);
  }
}
