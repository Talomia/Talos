/**
 * DockerEngine — client-side WebSocket adapter that satisfies RuntimeEngine
 * for server-side Docker container execution.
 *
 * Protocol: JSON-RPC over WebSocket
 *   Request:  { id: number, method: string, params: object }
 *   Response: { id: number, result?: unknown, error?: { code: number, message: string } }
 *   Events:   { event: string, data: object }
 *   Binary:   [1-byte opcode][4-byte processId length][processId bytes][payload bytes]
 */
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
  PreviewMessage,
} from '~/lib/runtime/runtime-engine';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DockerEngine');

// ─── Protocol Constants ───────────────────────────────────────────────────────

const BINARY_OPCODE_STDOUT = 0x01;
const BINARY_OPCODE_STDIN = 0x02;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const PING_INTERVAL_MS = 15_000;
const RPC_TIMEOUT_MS = 30_000;

const DEFAULT_WORKDIR = '/home/user/project';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  id: number;
  method: string;
  params: Record<string, unknown>;
}

interface JsonRpcResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface JsonRpcEvent {
  event: string;
  data: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ─── Binary Frame Helpers ─────────────────────────────────────────────────────

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function encodeBinaryFrame(opcode: number, processId: string, payload: string): ArrayBuffer {
  const idBytes = textEncoder.encode(processId);
  const payloadBytes = textEncoder.encode(payload);

  const buffer = new ArrayBuffer(1 + 4 + idBytes.byteLength + payloadBytes.byteLength);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  view.setUint8(0, opcode);
  view.setUint32(1, idBytes.byteLength, false);
  uint8.set(idBytes, 5);
  uint8.set(payloadBytes, 5 + idBytes.byteLength);

  return buffer;
}

function decodeBinaryFrame(data: ArrayBuffer): { opcode: number; processId: string; payload: string } {
  const view = new DataView(data);
  const uint8 = new Uint8Array(data);

  const opcode = view.getUint8(0);
  const idLen = view.getUint32(1, false);
  const processId = textDecoder.decode(uint8.slice(5, 5 + idLen));
  const payload = textDecoder.decode(uint8.slice(5 + idLen));

  return { opcode, processId, payload };
}

// ─── Docker Filesystem ────────────────────────────────────────────────────────

class DockerFileSystem implements RuntimeFileSystem {
  #rpc: (method: string, params: Record<string, unknown>) => Promise<unknown>;

  constructor(rpc: (method: string, params: Record<string, unknown>) => Promise<unknown>) {
    this.#rpc = rpc;
  }

  readFile(path: string, encoding?: string): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;
  async readFile(path: string, encoding?: string): Promise<string | Uint8Array> {
    const result = await this.#rpc('fs.readFile', { path, encoding });

    if (encoding) {
      return result as string;
    }

    // Server returns base64-encoded binary data when no encoding is specified
    const b64 = result as string;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  async writeFile(path: string, content: string | Uint8Array, encoding?: string): Promise<void> {
    let serializedContent: string;
    let isBinary = false;

    if (content instanceof Uint8Array) {
      // Encode binary content as base64 for JSON transport
      let binary = '';

      for (let i = 0; i < content.length; i++) {
        binary += String.fromCharCode(content[i]);
      }

      serializedContent = btoa(binary);
      isBinary = true;
    } else {
      serializedContent = content;
    }

    await this.#rpc('fs.writeFile', { path, content: serializedContent, encoding, isBinary });
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await this.#rpc('fs.mkdir', { path, options });
  }

  readdir(path: string, options: { withFileTypes: true }): Promise<DirEntry[]>;
  readdir(path: string): Promise<string[]>;
  async readdir(path: string, options?: { withFileTypes?: boolean }): Promise<DirEntry[] | string[]> {
    const result = await this.#rpc('fs.readdir', { path, options });

    if (options?.withFileTypes) {
      const raw = result as Array<{ name: string; type: 'file' | 'directory' }>;

      return raw.map((entry) => ({
        name: entry.name,
        isFile: () => entry.type === 'file',
        isDirectory: () => entry.type === 'directory',
      }));
    }

    return result as string[];
  }

  async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
    await this.#rpc('fs.rm', { path, options });
  }
}

// ─── Docker Process ───────────────────────────────────────────────────────────

class DockerProcess implements RuntimeProcess {
  readonly input: WritableStream<string>;
  readonly output: ReadableStream<string>;
  readonly exit: Promise<number>;

  #processId: string;
  #rpc: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  #sendBinary: (frame: ArrayBuffer) => void;

  constructor(
    processId: string,
    rpc: (method: string, params: Record<string, unknown>) => Promise<unknown>,
    sendBinary: (frame: ArrayBuffer) => void,
    registerOutput: (processId: string, controller: ReadableStreamDefaultController<string>) => void,
    unregisterOutput: (processId: string) => void,
    registerExit: (processId: string, resolve: (code: number) => void) => void,
  ) {
    this.#processId = processId;
    this.#rpc = rpc;
    this.#sendBinary = sendBinary;

    // WritableStream that sends binary frames for stdin
    this.input = new WritableStream<string>({
      write: (chunk) => {
        const frame = encodeBinaryFrame(BINARY_OPCODE_STDIN, processId, chunk);
        this.#sendBinary(frame);
      },
    });

    // ReadableStream that receives binary frames for stdout
    this.output = new ReadableStream<string>({
      start(controller) {
        registerOutput(processId, controller);
      },
      cancel() {
        unregisterOutput(processId);
      },
    });

    /*
     * Ensure controller is registered even if start is called synchronously
     * (ReadableStream spec guarantees start is called synchronously in constructor)
     */

    // Exit promise
    this.exit = new Promise<number>((resolve) => {
      registerExit(processId, resolve);
    });
  }

  resize(dimensions: { cols: number; rows: number }): void {
    this.#rpc('process.resize', {
      processId: this.#processId,
      cols: dimensions.cols,
      rows: dimensions.rows,
    }).catch((err) => {
      logger.warn(`Failed to resize process ${this.#processId}:`, err);
    });
  }

  kill(): void {
    this.#rpc('process.kill', { processId: this.#processId }).catch((err) => {
      logger.warn(`Failed to kill process ${this.#processId}:`, err);
    });
  }
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class DockerEngine implements RuntimeEngine {
  #wsUrl: string;
  #ws: WebSocket | null = null;
  #booted = false;
  #workdir: string = DEFAULT_WORKDIR;

  // JSON-RPC state
  #nextId = 1;
  #pendingRequests = new Map<number, PendingRequest>();
  #requestQueue: Array<{ data: string | ArrayBuffer }> = [];

  // Connection management
  #reconnecting = false;
  #reconnectAttempt = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #pingTimer: ReturnType<typeof setInterval> | null = null;
  #intentionalClose = false;

  // Process I/O registries
  #outputControllers = new Map<string, ReadableStreamDefaultController<string>>();
  #exitResolvers = new Map<string, (code: number) => void>();

  // Event listeners
  #eventListeners: {
    'server-ready': Array<(port: number, url: string) => void>;
    port: Array<(port: number, type: 'open' | 'close', url: string) => void>;
    'preview-message': Array<(message: PreviewMessage) => void>;
  } = {
    'server-ready': [],
    port: [],
    'preview-message': [],
  };

  // Watch subscriptions
  #watchCallbacks = new Map<string, (events: FileChangeEvent[]) => void>();

  // Text search progress
  #searchProgressCallbacks = new Map<string, SearchProgressCallback>();

  // Filesystem
  #fs: DockerFileSystem;

  constructor(wsUrl: string) {
    this.#wsUrl = wsUrl;
    this.#fs = new DockerFileSystem(this.#rpc.bind(this));
  }

  // ─── Public Properties ────────────────────────────────────────────────────

  get workdir(): string {
    if (!this.#booted) {
      throw new Error('DockerEngine not booted');
    }

    return this.#workdir;
  }

  get fs(): RuntimeFileSystem {
    if (!this.#booted) {
      throw new Error('DockerEngine not booted');
    }

    return this.#fs;
  }

  // ─── Boot / Teardown ──────────────────────────────────────────────────────

  async boot(): Promise<void> {
    logger.info('Booting DockerEngine...');

    await this.#connect();

    const result = (await this.#rpc('boot', {})) as { workdir?: string };

    if (result.workdir) {
      this.#workdir = result.workdir;
    }

    this.#booted = true;
    this.#startPingLoop();

    logger.info(`DockerEngine booted — workdir: ${this.#workdir}`);
  }

  async teardown(): Promise<void> {
    logger.info('Tearing down DockerEngine...');

    this.#booted = false;

    // Best-effort teardown RPC
    try {
      await this.#rpc('teardown', {});
    } catch {
      logger.warn('Teardown RPC failed — closing connection anyway');
    }

    this.#disconnect();
    logger.info('DockerEngine torn down');
  }

  // ─── Spawn ────────────────────────────────────────────────────────────────

  async spawn(command: string, args: string[], options?: SpawnOptions): Promise<RuntimeProcess> {
    if (!this.#booted) {
      throw new Error('DockerEngine not booted');
    }

    // Pre-create the process adapter so output controller is registered
    // BEFORE the spawn RPC, preventing early-message loss.
    const process = new DockerProcess(
      null, // processId assigned after RPC
      this.#rpc.bind(this),
      this.#sendBinary.bind(this),
      (pid, controller) => this.#outputControllers.set(pid, controller),
      (pid) => this.#outputControllers.delete(pid),
      (pid, resolve) => this.#exitResolvers.set(pid, resolve),
    );

    const result = (await this.#rpc('spawn', { command, args, options })) as { processId: string };

    // Now bind the real processId — this moves the controller registration
    // from the temporary id to the real one.
    process._assignProcessId(result.processId);

    return process;
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  on<K extends keyof RuntimeEventMap>(event: K, callback: RuntimeEventMap[K]): void {
    const listeners = this.#eventListeners[event];

    if (listeners) {
      listeners.push(callback as any);
    }
  }

  off<K extends keyof RuntimeEventMap>(event: K, callback: RuntimeEventMap[K]): void {
    const listeners = this.#eventListeners[event];

    if (listeners) {
      const idx = listeners.indexOf(callback as any);

      if (idx !== -1) {
        listeners.splice(idx, 1);
      }
    }
  }

  // ─── Preview ──────────────────────────────────────────────────────────────

  async setPreviewScript(script: string): Promise<void> {
    if (!this.#booted) {
      throw new Error('DockerEngine not booted');
    }

    await this.#rpc('setPreviewScript', { script });
  }

  getPreviewUrl(port: number): string {
    return `http://localhost:${port}`;
  }

  // ─── Search ───────────────────────────────────────────────────────────────

  async textSearch(query: string, options: SearchOptions, onProgress: SearchProgressCallback): Promise<void> {
    if (!this.#booted) {
      throw new Error('DockerEngine not booted');
    }

    const result = (await this.#rpc('textSearch', { query, options })) as { searchId: string };

    // Register callback for streaming results
    this.#searchProgressCallbacks.set(result.searchId, onProgress);

    // Wait for search completion
    return new Promise<void>((resolve, reject) => {
      // Timeout fallback
      const timeoutTimer = setTimeout(() => {
        if (this.#searchProgressCallbacks.has(result.searchId)) {
          this.#searchProgressCallbacks.delete(result.searchId);
          this.#searchCompleteResolvers.delete(result.searchId);
          reject(new Error(`Text search timed out for query: "${query}"`));
        }
      }, 60_000);

      const checkCompletion = (searchId: string) => {
        if (searchId === result.searchId) {
          clearTimeout(timeoutTimer);
          this.#searchProgressCallbacks.delete(result.searchId);
          resolve();
        }
      };

      // Store resolver to be called when 'search-complete' event arrives
      this.#searchCompleteResolvers.set(result.searchId, checkCompletion);
    });
  }

  #searchCompleteResolvers = new Map<string, (searchId: string) => void>();

  // ─── Watch ────────────────────────────────────────────────────────────────

  async watchPaths(config: WatchConfig, callback: (events: FileChangeEvent[]) => void): Promise<() => void> {
    if (!this.#booted) {
      throw new Error('DockerEngine not booted');
    }

    const result = (await this.#rpc('watch', { config })) as { watchId: string };
    const watchId = result.watchId;

    this.#watchCallbacks.set(watchId, callback);

    return () => {
      this.#watchCallbacks.delete(watchId);
      this.#rpc('unwatch', { watchId }).catch((err) => {
        logger.warn(`Failed to unwatch ${watchId}:`, err);
      });
    };
  }

  // ─── WebSocket Connection ─────────────────────────────────────────────────

  #connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      logger.info(`Connecting to ${this.#wsUrl}...`);

      const ws = new WebSocket(this.#wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        logger.info('WebSocket connected');
        this.#ws = ws;
        this.#reconnecting = false;
        this.#reconnectAttempt = 0;
        this.#flushQueue();
        resolve();
      };

      ws.onmessage = (event: MessageEvent) => {
        this.#handleMessage(event);
      };

      ws.onclose = (event: CloseEvent) => {
        logger.warn(`WebSocket closed: code=${event.code} reason="${event.reason}"`);
        this.#ws = null;
        this.#stopPingLoop();

        if (!this.#intentionalClose) {
          this.#scheduleReconnect();
        }
      };

      ws.onerror = () => {
        logger.error('WebSocket error');

        if (!this.#ws) {
          reject(new Error(`Failed to connect to ${this.#wsUrl}`));
        }
      };
    });
  }

  #disconnect(): void {
    this.#intentionalClose = true;
    this.#stopPingLoop();

    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }

    // Reject all pending requests
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_id, pending] of this.#pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('DockerEngine disconnected'));
    }

    this.#pendingRequests.clear();
    this.#requestQueue = [];

    // Close all output streams
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_pid, controller] of this.#outputControllers) {
      try {
        controller.close();
      } catch {
        // Stream may already be closed
      }
    }

    this.#outputControllers.clear();

    // Resolve all exit promises with -1
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_pid, resolve] of this.#exitResolvers) {
      resolve(-1);
    }

    this.#exitResolvers.clear();

    if (this.#ws) {
      this.#ws.close(1000, 'teardown');
      this.#ws = null;
    }
  }

  // ─── Reconnection ────────────────────────────────────────────────────────

  #scheduleReconnect(): void {
    if (this.#reconnecting || this.#intentionalClose) {
      return;
    }

    this.#reconnecting = true;
    this.#reconnectAttempt++;

    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, this.#reconnectAttempt - 1), RECONNECT_MAX_MS);

    logger.info(`Reconnecting in ${delay}ms (attempt ${this.#reconnectAttempt})...`);

    this.#reconnectTimer = setTimeout(async () => {
      this.#reconnectTimer = null;

      try {
        await this.#connect();
        logger.info('Reconnected successfully');

        // Clear stale state from previous connection before re-booting
        this.#outputControllers.clear();
        this.#exitResolvers.clear();
        this.#watchCallbacks.clear();
        this.#searchProgressCallbacks.clear();

        // Re-boot if we were previously booted
        if (this.#booted) {
          const result = (await this.#rpc('boot', {})) as { workdir?: string };

          if (result.workdir) {
            this.#workdir = result.workdir;
          }

          this.#startPingLoop();
        }
      } catch {
        logger.error(`Reconnect attempt ${this.#reconnectAttempt} failed`);
        this.#reconnecting = false;
        this.#scheduleReconnect();
      }
    }, delay);
  }

  // ─── Ping / Pong ──────────────────────────────────────────────────────────

  #startPingLoop(): void {
    this.#stopPingLoop();

    this.#pingTimer = setInterval(() => {
      if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
        this.#rpc('ping', {}).catch(() => {
          logger.warn('Ping failed — connection may be dead');
        });
      }
    }, PING_INTERVAL_MS);
  }

  #stopPingLoop(): void {
    if (this.#pingTimer) {
      clearInterval(this.#pingTimer);
      this.#pingTimer = null;
    }
  }

  // ─── JSON-RPC ─────────────────────────────────────────────────────────────

  #rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const id = this.#nextId++;

      const request: JsonRpcRequest = { id, method, params };
      const serialized = JSON.stringify(request);

      const timer = setTimeout(() => {
        this.#pendingRequests.delete(id);
        reject(new Error(`RPC timeout: ${method} (id=${id})`));
      }, RPC_TIMEOUT_MS);

      this.#pendingRequests.set(id, { resolve, reject, timer });

      if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
        this.#ws.send(serialized);
      } else {
        // Queue for when connection is re-established
        this.#requestQueue.push({ data: serialized });
      }
    });
  }

  #sendBinary(frame: ArrayBuffer): void {
    if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
      this.#ws.send(frame);
    } else {
      this.#requestQueue.push({ data: frame });
    }
  }

  #flushQueue(): void {
    const queue = this.#requestQueue;
    this.#requestQueue = [];

    for (const item of queue) {
      if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
        this.#ws.send(item.data);
      }
    }
  }

  // ─── Message Handling ─────────────────────────────────────────────────────

  #handleMessage(event: MessageEvent): void {
    // Binary frame — process stdout
    if (event.data instanceof ArrayBuffer) {
      this.#handleBinaryFrame(event.data);
      return;
    }

    // Text frame — JSON-RPC response or server event
    let parsed: JsonRpcResponse | JsonRpcEvent;

    try {
      parsed = JSON.parse(event.data as string);
    } catch {
      logger.error('Failed to parse WebSocket message:', event.data);
      return;
    }

    if ('id' in parsed && typeof (parsed as JsonRpcResponse).id === 'number') {
      this.#handleRpcResponse(parsed as JsonRpcResponse);
    } else if ('event' in parsed) {
      this.#handleServerEvent(parsed as JsonRpcEvent);
    }
  }

  #handleRpcResponse(response: JsonRpcResponse): void {
    const pending = this.#pendingRequests.get(response.id);

    if (!pending) {
      logger.warn(`Received response for unknown request id=${response.id}`);
      return;
    }

    this.#pendingRequests.delete(response.id);
    clearTimeout(pending.timer);

    if (response.error) {
      pending.reject(new Error(`RPC error [${response.error.code}]: ${response.error.message}`));
    } else {
      pending.resolve(response.result);
    }
  }

  #handleServerEvent(event: JsonRpcEvent): void {
    const { event: eventName, data } = event;

    switch (eventName) {
      case 'server-ready': {
        const { port, url } = data as { port: number; url: string };

        for (const listener of this.#eventListeners['server-ready']) {
          try {
            listener(port, url);
          } catch (err) {
            logger.error('Error in server-ready listener:', err);
          }
        }

        break;
      }

      case 'port': {
        const { port, type, url } = data as { port: number; type: 'open' | 'close'; url: string };

        for (const listener of this.#eventListeners.port) {
          try {
            listener(port, type, url);
          } catch (err) {
            logger.error('Error in port listener:', err);
          }
        }

        break;
      }

      case 'preview-message': {
        const message = data as unknown as PreviewMessage;

        for (const listener of this.#eventListeners['preview-message']) {
          try {
            listener(message);
          } catch (err) {
            logger.error('Error in preview-message listener:', err);
          }
        }

        break;
      }

      case 'process-exit': {
        const { processId, code } = data as { processId: string; code: number };
        const exitResolver = this.#exitResolvers.get(processId);

        if (exitResolver) {
          this.#exitResolvers.delete(processId);
          exitResolver(code);
        }

        // Close the output stream for this process
        const controller = this.#outputControllers.get(processId);

        if (controller) {
          try {
            controller.close();
          } catch {
            // Stream may already be closed
          }

          this.#outputControllers.delete(processId);
        }

        break;
      }

      case 'file-change': {
        const { watchId, events } = data as { watchId: string; events: FileChangeEvent[] };
        const callback = this.#watchCallbacks.get(watchId);

        if (callback) {
          try {
            callback(events);
          } catch (err) {
            logger.error(`Error in watch callback for ${watchId}:`, err);
          }
        }

        break;
      }

      case 'search-progress': {
        const { searchId, results } = data as { searchId: string; results: import('../runtime-engine').SearchMatch[] };
        const progressCb = this.#searchProgressCallbacks.get(searchId);

        if (progressCb) {
          try {
            progressCb(results);
          } catch (err) {
            logger.error(`Error in search progress callback for ${searchId}:`, err);
          }
        }

        break;
      }

      case 'search-complete': {
        const { searchId } = data as { searchId: string };
        const completeResolver = this.#searchCompleteResolvers.get(searchId);

        if (completeResolver) {
          this.#searchCompleteResolvers.delete(searchId);
          completeResolver(searchId);
        }

        break;
      }

      default:
        logger.warn(`Unknown server event: ${eventName}`);
    }
  }

  #handleBinaryFrame(buffer: ArrayBuffer): void {
    try {
      const { opcode, processId, payload } = decodeBinaryFrame(buffer);

      if (opcode === BINARY_OPCODE_STDOUT) {
        const controller = this.#outputControllers.get(processId);

        if (controller) {
          try {
            controller.enqueue(payload);
          } catch {
            // Stream may be closed
            logger.warn(`Output stream closed for process ${processId}`);
          }
        }
      }
    } catch (err) {
      logger.error('Failed to decode binary frame:', err);
    }
  }
}
