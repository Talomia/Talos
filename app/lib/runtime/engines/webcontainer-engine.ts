/**
 * WebContainerEngine — thin adapter wrapping @webcontainer/api to satisfy RuntimeEngine.
 *
 * This is the DEFAULT engine. It preserves the exact behavior of the original WebContainer
 * integration — no logic changes, just a conformant wrapper.
 */
import { WebContainer } from '@webcontainer/api';
import type {
  RuntimeEngine,
  RuntimeFileSystem,
  RuntimeProcess,
  RuntimeEventMap,
  SpawnOptions,
  SearchOptions,
  SearchProgressCallback,
  WatchConfig,
  FileChangeEvent,
  DirEntry,
} from '~/lib/runtime/runtime-engine';
import { WORK_DIR_NAME } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WebContainerEngine');

type AnyFunction = (...args: any[]) => any;

// ─── Filesystem Adapter ───────────────────────────────────────────────────────

class WebContainerFileSystem implements RuntimeFileSystem {
  #wc: WebContainer;

  constructor(wc: WebContainer) {
    this.#wc = wc;
  }

  readFile(path: string, encoding?: string): Promise<any> {
    if (encoding) {
      return (this.#wc.fs as any).readFile(path, encoding);
    }

    return this.#wc.fs.readFile(path);
  }

  writeFile(path: string, content: string | Uint8Array, encoding?: string): Promise<void> {
    if (encoding) {
      return this.#wc.fs.writeFile(path, content as string, encoding);
    }

    return this.#wc.fs.writeFile(path, content);
  }

  mkdir(path: string, options?: { recursive?: boolean }): Promise<any> {
    if (options?.recursive) {
      return this.#wc.fs.mkdir(path, { recursive: true });
    }

    return this.#wc.fs.mkdir(path);
  }

  async readdir(path: string, options?: { withFileTypes?: boolean }): Promise<any> {
    if (options?.withFileTypes) {
      const entries = await this.#wc.fs.readdir(path, { withFileTypes: true });

      return entries as unknown as DirEntry[];
    }

    return this.#wc.fs.readdir(path);
  }

  rm(path: string, options?: { recursive?: boolean }): Promise<void> {
    return this.#wc.fs.rm(path, options);
  }
}

// ─── Process Adapter ──────────────────────────────────────────────────────────

class WebContainerProcessAdapter implements RuntimeProcess {
  #process: Awaited<ReturnType<WebContainer['spawn']>>;

  constructor(process: Awaited<ReturnType<WebContainer['spawn']>>) {
    this.#process = process;
  }

  get input(): WritableStream<string> {
    return this.#process.input;
  }

  get output(): ReadableStream<string> {
    return this.#process.output;
  }

  get exit(): Promise<number> {
    return this.#process.exit;
  }

  resize(dimensions: { cols: number; rows: number }): void {
    this.#process.resize?.(dimensions);
  }

  kill(): void {
    this.#process.kill();
  }
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class WebContainerEngine implements RuntimeEngine {
  #instance: WebContainer | null = null;
  #fs: WebContainerFileSystem | null = null;
  #bootPromise: Promise<void> | null = null;

  get workdir(): string {
    if (!this.#instance) {
      throw new Error('WebContainerEngine not booted');
    }

    return this.#instance.workdir;
  }

  get fs(): RuntimeFileSystem {
    if (!this.#fs) {
      throw new Error('WebContainerEngine not booted');
    }

    return this.#fs;
  }

  async boot(): Promise<void> {
    if (this.#instance) {
      return;
    }

    if (this.#bootPromise) {
      return this.#bootPromise;
    }

    this.#bootPromise = (async () => {
      logger.info('Booting WebContainer...');

      this.#instance = await WebContainer.boot({
        coep: 'credentialless',
        workdirName: WORK_DIR_NAME,
        forwardPreviewErrors: true,
      });

      this.#fs = new WebContainerFileSystem(this.#instance);
      logger.info('WebContainer booted successfully');
    })();

    try {
      await this.#bootPromise;
    } catch (error) {
      this.#bootPromise = null;
      throw error;
    }
  }

  async teardown(): Promise<void> {
    this.#instance?.teardown();
    this.#instance = null;
    this.#fs = null;
  }

  async spawn(command: string, args: string[], options?: SpawnOptions): Promise<RuntimeProcess> {
    if (!this.#instance) {
      throw new Error('WebContainerEngine not booted');
    }

    const wcOptions: any = {};

    if (options?.terminal) {
      wcOptions.terminal = options.terminal;
    }

    if (options?.env) {
      wcOptions.env = options.env;
    }

    if (options?.cwd) {
      wcOptions.cwd = options.cwd;
    }

    const process = await this.#instance.spawn(command, args, wcOptions);

    return new WebContainerProcessAdapter(process);
  }

  // Track listeners so off() can effectively disable them
  // (WebContainer API has no native off())
  #eventListeners = new Map<string, Set<AnyFunction>>();

  on<K extends keyof RuntimeEventMap>(event: K, callback: RuntimeEventMap[K]): void {
    if (!this.#instance) {
      throw new Error('WebContainerEngine not booted');
    }

    let listeners = this.#eventListeners.get(event);

    if (!listeners) {
      listeners = new Set();
      this.#eventListeners.set(event, listeners);
    }

    if (listeners.has(callback as AnyFunction)) {
      return; // already registered
    }

    listeners.add(callback as AnyFunction);

    // Wrap the callback so we can gate it via the listener set
    const wrapped = ((...args: any[]) => {
      if (this.#eventListeners.get(event)?.has(callback as AnyFunction)) {
        (callback as AnyFunction)(...args);
      }
    }) as any;

    this.#instance.on(event as any, wrapped);
  }

  off<K extends keyof RuntimeEventMap>(event: K, callback: RuntimeEventMap[K]): void {
    const listeners = this.#eventListeners.get(event);

    if (listeners) {
      listeners.delete(callback as AnyFunction);

      if (listeners.size === 0) {
        this.#eventListeners.delete(event);
      }
    }
  }

  async setPreviewScript(script: string): Promise<void> {
    if (!this.#instance) {
      throw new Error('WebContainerEngine not booted');
    }

    try {
      await this.#instance.setPreviewScript(script);
    } catch (error) {
      logger.warn('Failed to set preview script — inspector may not work:', error);
    }
  }

  getPreviewUrl(port: number): string {
    /*
     * WebContainer previews are served from webcontainer-api.io subdomains.
     * The exact URL pattern is returned via the 'server-ready' event.
     * This method provides a fallback format.
     */
    return `https://${port}.local-credentialless.webcontainer-api.io`;
  }

  async textSearch(query: string, options: SearchOptions, onProgress: SearchProgressCallback): Promise<void> {
    if (!this.#instance) {
      throw new Error('WebContainerEngine not booted');
    }

    const wcOptions: any = {};

    if (options.include) {
      wcOptions.include = options.include;
    }

    if (options.exclude) {
      wcOptions.exclude = options.exclude;
    }

    if (options.followSymlinks !== undefined) {
      wcOptions.followSymlinks = options.followSymlinks;
    }

    await this.#instance.internal.textSearch(query, wcOptions, onProgress as any);
  }

  async watchPaths(config: WatchConfig, callback: (events: FileChangeEvent[]) => void): Promise<() => void> {
    if (!this.#instance) {
      throw new Error('WebContainerEngine not booted');
    }

    const unsubscribe = this.#instance.internal.watchPaths(
      {
        include: config.include,
        exclude: config.exclude,
        includeContent: config.includeContent,
      } as any,
      callback as any,
    );

    return unsubscribe;
  }

  /** Direct access to the underlying WebContainer instance for migration edge cases */
  get rawInstance(): WebContainer | null {
    return this.#instance;
  }
}
