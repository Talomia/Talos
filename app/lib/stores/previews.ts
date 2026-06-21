import type { RuntimeEngine } from '~/lib/runtime/runtime-engine';
import { atom } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PreviewsStore');

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
}

// Create a broadcast channel for preview updates
const PREVIEW_CHANNEL = 'preview-updates';

export class PreviewsStore {
  #availablePreviews = new Map<number, PreviewInfo>();
  #engine: Promise<RuntimeEngine>;
  #broadcastChannel?: BroadcastChannel;
  #lastUpdate = new Map<string, number>();
  #refreshTimeouts = new Map<string, NodeJS.Timeout>();
  #REFRESH_DELAY = 300;
  #MAX_TRACKED_UPDATES = 100;
  #storageListener?: (event: StorageEvent) => void;

  previews = atom<PreviewInfo[]>([]);

  constructor(enginePromise: Promise<RuntimeEngine>) {
    this.#engine = enginePromise;
    this.#broadcastChannel = this.#maybeCreateChannel(PREVIEW_CHANNEL);

    if (this.#broadcastChannel) {
      // Listen for preview updates from other tabs
      this.#broadcastChannel.onmessage = (event) => {
        const { type, previewId } = event.data;

        if (type === 'file-change') {
          const timestamp = event.data.timestamp;
          const lastUpdate = this.#lastUpdate.get(previewId) || 0;

          if (timestamp > lastUpdate) {
            this.#lastUpdate.set(previewId, timestamp);
            this.refreshPreview(previewId);
          }
        }
      };
    }

    /*
     * Listen for cross-tab localStorage changes via native StorageEvent API.
     * The browser fires 'storage' events in OTHER tabs automatically when
     * localStorage changes — no monkey-patching needed.
     */
    if (typeof window !== 'undefined') {
      this.#storageListener = (event: StorageEvent) => {
        if (event.key && event.newValue !== null) {
          /*
           * A localStorage key was updated in another tab — refresh previews
           * to pick up any settings/state changes
           */
          this._refreshAllPreviews();
        }
      };
      window.addEventListener('storage', this.#storageListener);
    }

    this.#init();
  }

  /**
   * Clean up all event listeners, channels, and timers.
   * Call this during HMR teardown or component unmount.
   */
  destroy() {
    // Clear all pending refresh timeouts
    for (const timeout of this.#refreshTimeouts.values()) {
      clearTimeout(timeout);
    }

    this.#refreshTimeouts.clear();

    // Close broadcast channel
    this.#broadcastChannel?.close();
    this.#broadcastChannel = undefined;

    // Remove storage event listener
    if (typeof window !== 'undefined' && this.#storageListener) {
      window.removeEventListener('storage', this.#storageListener);
      this.#storageListener = undefined;
    }

    this.#availablePreviews.clear();
    this.#lastUpdate.clear();
  }

  #maybeCreateChannel(name: string): BroadcastChannel | undefined {
    if (typeof globalThis === 'undefined') {
      return undefined;
    }

    const globalBroadcastChannel = (
      globalThis as typeof globalThis & {
        BroadcastChannel?: typeof BroadcastChannel;
      }
    ).BroadcastChannel;

    if (typeof globalBroadcastChannel !== 'function') {
      return undefined;
    }

    try {
      return new globalBroadcastChannel(name);
    } catch (error) {
      logger.warn('[Preview] BroadcastChannel unavailable:', error);
      return undefined;
    }
  }

  // Refresh all active previews
  private _refreshAllPreviews() {
    const previews = this.previews.get();

    previews.forEach((preview) => {
      const previewId = this.getPreviewId(preview.baseUrl);

      if (previewId) {
        this.refreshPreview(previewId);
      }
    });
  }

  async #init() {
    const engine = await this.#engine;

    // Listen for server ready events
    engine.on('server-ready', (port, url) => {
      logger.trace('Server ready on port:', port, url);
      this.broadcastUpdate(url);

      // Refresh previews when server is ready to pick up current state
      this._refreshAllPreviews();
    });

    // Listen for port events
    engine.on('port', (port, type, url) => {
      let previewInfo = this.#availablePreviews.get(port);

      if (type === 'close' && previewInfo) {
        this.#availablePreviews.delete(port);
        this.previews.set(this.previews.get().filter((preview) => preview.port !== port));

        return;
      }

      const previews = this.previews.get();

      if (!previewInfo) {
        previewInfo = { port, ready: type === 'open', baseUrl: url };
        this.#availablePreviews.set(port, previewInfo);
        previews.push(previewInfo);
      }

      previewInfo.ready = type === 'open';
      previewInfo.baseUrl = url;

      this.previews.set([...previews]);

      if (type === 'open') {
        this.broadcastUpdate(url);
      }
    });
  }

  /**
   * Extract preview ID from URL. Handles both engine types:
   * - WebContainer: https://{port}.local-credentialless.webcontainer-api.io → port
   * - Docker: http://localhost:{port} → port
   */
  getPreviewId(url: string): string | null {
    // WebContainer URLs: port is the subdomain
    const wcMatch = url.match(/^https?:\/\/([^.]+)\.local-credentialless\.webcontainer-api\.io/);

    if (wcMatch) {
      return wcMatch[1];
    }

    // Docker engine URLs: port is in the URL
    const dockerMatch = url.match(/^https?:\/\/localhost:(\d+)/);

    if (dockerMatch) {
      return dockerMatch[1];
    }

    return null;
  }

  // Broadcast state change to all tabs
  broadcastStateChange(previewId: string) {
    const timestamp = Date.now();
    this.#trackUpdate(previewId, timestamp);

    this.#broadcastChannel?.postMessage({
      type: 'state-change',
      previewId,
      timestamp,
    });
  }

  // Broadcast file change to all tabs
  broadcastFileChange(previewId: string) {
    const timestamp = Date.now();
    this.#trackUpdate(previewId, timestamp);

    this.#broadcastChannel?.postMessage({
      type: 'file-change',
      previewId,
      timestamp,
    });
  }

  // Broadcast update to all tabs
  broadcastUpdate(url: string) {
    const previewId = this.getPreviewId(url);

    if (previewId) {
      const timestamp = Date.now();
      this.#trackUpdate(previewId, timestamp);

      this.#broadcastChannel?.postMessage({
        type: 'file-change',
        previewId,
        timestamp,
      });
    }
  }

  /**
   * Track update timestamps with bounded growth.
   * Prunes oldest entries when the map exceeds MAX_TRACKED_UPDATES.
   */
  #trackUpdate(previewId: string, timestamp: number) {
    this.#lastUpdate.set(previewId, timestamp);

    if (this.#lastUpdate.size > this.#MAX_TRACKED_UPDATES) {
      // Remove the oldest entry
      const oldestKey = this.#lastUpdate.keys().next().value;

      if (oldestKey !== undefined) {
        this.#lastUpdate.delete(oldestKey);
      }
    }
  }

  // Method to refresh a specific preview
  refreshPreview(previewId: string) {
    // Clear any pending refresh for this preview
    const existingTimeout = this.#refreshTimeouts.get(previewId);

    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set a new timeout for this refresh
    const timeout = setTimeout(() => {
      const previews = this.previews.get();
      const preview = previews.find((p) => this.getPreviewId(p.baseUrl) === previewId);

      if (preview) {
        preview.ready = false;
        this.previews.set([...previews]);

        requestAnimationFrame(() => {
          preview.ready = true;
          this.previews.set([...previews]);
        });
      }

      this.#refreshTimeouts.delete(previewId);
    }, this.#REFRESH_DELAY);

    this.#refreshTimeouts.set(previewId, timeout);
  }

  refreshAllPreviews() {
    const previews = this.previews.get();

    for (const preview of previews) {
      const previewId = this.getPreviewId(preview.baseUrl);

      if (previewId) {
        this.broadcastFileChange(previewId);
      }
    }
  }
}

// Create a singleton instance
let previewsStore: PreviewsStore | null = null;

/**
 * TODO: This function initializes PreviewsStore with a dummy `{} as RuntimeEngine`.
 * Any PreviewsStore method that delegates to the engine (e.g. getPreviewUrl) will
 * fail silently or throw at runtime. It currently only works for operations that
 * don't touch the engine (e.g. refreshAllPreviews via BroadcastChannel).
 *
 * To fix properly, the real RuntimeEngine promise should be injected here — for
 * example by accepting it as a parameter, or by importing the same engine promise
 * used elsewhere in the app.
 */
export function usePreviewStore() {
  if (!previewsStore) {
    previewsStore = new PreviewsStore(Promise.resolve({} as RuntimeEngine));
  }

  return previewsStore;
}
