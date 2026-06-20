/**
 * RuntimeEngine — the core abstraction between Talos and execution backends.
 *
 * Implementations:
 *   - WebContainerEngine: In-browser Node.js via StackBlitz WebContainer API
 *   - DockerEngine: Server-side Docker containers via WebSocket
 *
 * Every store, runner, and component consumes RuntimeEngine — never a concrete backend.
 */

// ─── Filesystem ───────────────────────────────────────────────────────────────

export interface RuntimeFileSystem {
  readFile(path: string, encoding: string): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, content: string | Uint8Array, encoding?: string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readdir(path: string, options?: { withFileTypes: true }): Promise<DirEntry[]>;
  readdir(path: string): Promise<string[]>;
  rm(path: string, options?: { recursive?: boolean }): Promise<void>;
}

export interface DirEntry {
  name: string;
  isFile(): boolean;
  isDirectory(): boolean;
}

// ─── Process ──────────────────────────────────────────────────────────────────

export interface SpawnOptions {
  terminal?: { cols: number; rows: number };
  env?: Record<string, string>;
  cwd?: string;
}

export interface RuntimeProcess {
  readonly input: WritableStream<string>;
  readonly output: ReadableStream<string>;
  readonly exit: Promise<number>;
  resize(dimensions: { cols: number; rows: number }): void;
  kill(): void;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export interface PreviewMessage {
  type: 'PREVIEW_UNCAUGHT_EXCEPTION' | 'PREVIEW_UNHANDLED_REJECTION';
  message: string;
  pathname: string;
  search: string;
  hash: string;
  port: number;
  stack?: string;
}

// ─── File Watching ────────────────────────────────────────────────────────────

export type FileChangeType = 'add_file' | 'change' | 'remove_file' | 'add_dir' | 'remove_dir' | 'update_directory';

export interface FileChangeEvent {
  type: FileChangeType;
  path: string;
  buffer?: Uint8Array;
}

export interface WatchConfig {
  include: string[];
  exclude: string[];
  includeContent?: boolean;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchOptions {
  include?: string;
  exclude?: string;
  followSymlinks?: boolean;
}

export interface SearchMatch {
  file: string;
  line: number;
  column: number;
  length: number;
  preview: string;
}

export type SearchProgressCallback = (results: SearchMatch[]) => void;

// ─── Core Engine ──────────────────────────────────────────────────────────────

export type RuntimeEventMap = {
  'server-ready': (port: number, url: string) => void;
  port: (port: number, type: 'open' | 'close', url: string) => void;
  'preview-message': (message: PreviewMessage) => void;
};

export interface RuntimeEngine {
  /** Bootstrap the runtime — creates the execution sandbox */
  boot(): Promise<void>;

  /** Shut down the runtime — destroys the sandbox */
  teardown(): Promise<void>;

  /** Absolute path to the working directory inside the runtime */
  readonly workdir: string;

  /** Filesystem operations */
  readonly fs: RuntimeFileSystem;

  /** Spawn a process inside the runtime */
  spawn(command: string, args: string[], options?: SpawnOptions): Promise<RuntimeProcess>;

  /** Subscribe to runtime events */
  on<K extends keyof RuntimeEventMap>(event: K, callback: RuntimeEventMap[K]): void;

  /** Inject a script into preview iframes */
  setPreviewScript(script: string): Promise<void>;

  /** Get the URL for a preview running on the given port */
  getPreviewUrl(port: number): string;

  /** Full-text search across files in the working directory */
  textSearch(query: string, options: SearchOptions, onProgress: SearchProgressCallback): Promise<void>;

  /** Watch for filesystem changes */
  watchPaths(config: WatchConfig, callback: (events: FileChangeEvent[]) => void): Promise<() => void>;
}

// ─── Engine Type ──────────────────────────────────────────────────────────────

export type EngineType = 'webcontainer' | 'docker';
