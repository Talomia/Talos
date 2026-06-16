import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('cloud-persistence');

/**
 * Cloud persistence adapter that syncs local IndexedDB data with the
 * server-side Supabase database. This provides:
 *
 * 1. Transparent sync — local writes are mirrored to the server when authenticated
 * 2. Graceful degradation — works fully offline or when unauthenticated
 * 3. Background sync — doesn't block the UI thread
 *
 * The local IndexedDB remains the source of truth for the UI,
 * while the server provides cross-device sync and backup.
 */

interface SyncableChat {
  id: string;
  urlId: string;
  description: string;
  messages: any[];
  metadata?: Record<string, any>;
  snapshot?: {
    chatIndex: string;
    files: Record<string, any>;
    summary?: string;
  };
}

let _isAuthenticated = false;
const _syncQueue: Array<() => Promise<void>> = [];
let _isSyncing = false;

/**
 * Initialize cloud persistence.
 * Checks authentication status and starts any pending sync.
 */
export async function initCloudPersistence(): Promise<void> {
  try {
    const response = await fetch('/api/auth/user');
    const data = (await response.json()) as { user: any };
    _isAuthenticated = !!data.user;

    if (_isAuthenticated) {
      logger.info('Cloud persistence enabled — user is authenticated');
      processSyncQueue();
    } else {
      logger.info('Cloud persistence disabled — user not authenticated');
    }
  } catch {
    _isAuthenticated = false;
    logger.info('Cloud persistence disabled — auth check failed');
  }
}

/**
 * Sync a chat save to the server.
 * Called after every local IndexedDB write.
 */
export function syncChatToCloud(chat: SyncableChat): void {
  if (!_isAuthenticated) {
    return;
  }

  _syncQueue.push(async () => {
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: chat.id,
          urlId: chat.urlId,
          description: chat.description,
          messages: chat.messages,
          metadata: chat.metadata,
          snapshot: chat.snapshot,
        }),
      });
    } catch (error) {
      logger.error('Failed to sync chat to cloud:', error);
    }
  });

  processSyncQueue();
}

/**
 * Sync a chat deletion to the server.
 */
export function syncDeleteToCloud(chatId: string): void {
  if (!_isAuthenticated) {
    return;
  }

  _syncQueue.push(async () => {
    try {
      await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chatId }),
      });
    } catch (error) {
      logger.error('Failed to sync deletion to cloud:', error);
    }
  });

  processSyncQueue();
}

/**
 * Sync a description update to the server.
 */
export function syncDescriptionToCloud(chatId: string, description: string): void {
  if (!_isAuthenticated) {
    return;
  }

  _syncQueue.push(async () => {
    try {
      await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chatId, description }),
      });
    } catch (error) {
      logger.error('Failed to sync description to cloud:', error);
    }
  });

  processSyncQueue();
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
 * Internal queue processor
 * ==========================================
 */

async function processSyncQueue(): Promise<void> {
  if (_isSyncing || _syncQueue.length === 0) {
    return;
  }

  _isSyncing = true;

  try {
    while (_syncQueue.length > 0) {
      const task = _syncQueue.shift();

      if (task) {
        await task();
      }
    }
  } finally {
    _isSyncing = false;
  }
}
