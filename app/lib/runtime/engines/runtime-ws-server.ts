/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function */
/**
 * runtime-ws-server.ts — Server-side WebSocket handler for DockerEngine.
 *
 * Accepts WebSocket connections from the DockerEngine client, manages one
 * Docker container per session via raw Docker Engine API (unix socket), and
 * handles the full JSON-RPC protocol for filesystem, process, search, watch,
 * and port forwarding operations.
 *
 * Zero external dependencies beyond Node.js built-ins and `ws`.
 */

import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as childProcess from 'node:child_process';

// @ts-ignore — ws is installed at runtime in the Docker container, not in the main app
import { WebSocketServer, WebSocket, type RawData } from 'ws';

// ─── Logger ───────────────────────────────────────────────────────────────────

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

const CURRENT_LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'debug';

function createLogger(scope: string) {
  function emit(level: LogLevel, ...args: unknown[]) {
    if (LOG_LEVELS[level] < LOG_LEVELS[CURRENT_LOG_LEVEL]) {
      return;
    }

    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.toUpperCase()}] [${scope}]`;
    (console as any)[level === 'trace' ? 'debug' : level](prefix, ...args);
  }

  return {
    trace: (...args: unknown[]) => emit('trace', ...args),
    debug: (...args: unknown[]) => emit('debug', ...args),
    info: (...args: unknown[]) => emit('info', ...args),
    warn: (...args: unknown[]) => emit('warn', ...args),
    error: (...args: unknown[]) => emit('error', ...args),
  };
}

const serverLog = createLogger('RuntimeWSServer');

// ─── Configuration ────────────────────────────────────────────────────────────

const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE || 'node:22-slim';
const CONTAINER_WORKDIR = '/home/user/project';
const PORT_POLL_INTERVAL_MS = 2000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

interface DirEntry {
  name: string;
  type: 'file' | 'directory';
}

interface ExecProcess {
  execId: string;
  processId: string;
  socket: net.Socket | null;
  killed: boolean;
}

interface WatcherEntry {
  /** Absolute path on the host filesystem being watched. */
  hostPath: string;

  /** AbortController to kill the watcher. */
  controller: AbortController;
}

interface RuntimeServerOptions {
  /** Port to listen on. Default: 3001 */
  port?: number;

  /** Host to bind to. Default: '0.0.0.0' */
  host?: string;

  /** Optional TLS options for HTTPS. */
  tls?: { key: string; cert: string };
}

interface DockerExecCreateResponse {
  Id: string;
}

interface DockerContainerCreateResponse {
  Id: string;
  Warnings: string[];
}

// ─── Docker API Client ────────────────────────────────────────────────────────

/**
 * Raw HTTP client for the Docker Engine API over a unix socket.
 * All methods return parsed JSON or raw Buffers.
 */
class DockerApi {
  private socketPath: string;
  private log = createLogger('DockerApi');

  constructor(socketPath: string) {
    this.socketPath = socketPath;
  }

  /**
   * Make an HTTP request to the Docker daemon.
   */
  async request<T = unknown>(
    method: string,
    urlPath: string,
    body?: unknown,
    options?: { hijack?: boolean; headers?: Record<string, string> },
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : undefined;

      const reqOptions: http.RequestOptions = {
        socketPath: this.socketPath,
        path: urlPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload).toString() } : {}),
          ...(options?.headers || {}),
        },
      };

      const req = http.request(reqOptions, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => chunks.push(chunk));

        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          const statusCode = res.statusCode || 0;

          if (statusCode >= 200 && statusCode < 300) {
            if (raw.length === 0) {
              resolve(undefined as unknown as T);
              return;
            }

            try {
              resolve(JSON.parse(raw.toString('utf-8')) as T);
            } catch {
              // Some Docker endpoints return non-JSON (e.g. logs)
              resolve(raw as unknown as T);
            }
          } else {
            let message = `Docker API error: ${method} ${urlPath} -> ${statusCode}`;

            try {
              const errBody = JSON.parse(raw.toString('utf-8'));
              message += `: ${errBody.message || raw.toString('utf-8')}`;
            } catch {
              message += `: ${raw.toString('utf-8')}`;
            }

            reject(new Error(message));
          }
        });

        res.on('error', reject);
      });

      req.on('error', reject);

      if (payload) {
        req.write(payload);
      }

      req.end();
    });
  }

  /**
   * Start an exec instance with hijacked connection (returns raw TCP socket).
   * Used for interactive process I/O.
   */
  hijackExec(execId: string, tty: boolean): Promise<net.Socket> {
    return new Promise<net.Socket>((resolve, reject) => {
      const payload = JSON.stringify({ Detach: false, Tty: tty });

      const reqOptions: http.RequestOptions = {
        socketPath: this.socketPath,
        path: `/exec/${execId}/start`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload).toString(),
          Connection: 'Upgrade',
          Upgrade: 'tcp',
        },
      };

      const req = http.request(reqOptions);

      req.on('upgrade', (_res, socket, _head) => {
        this.log.debug(`Exec ${execId} hijacked successfully`);
        resolve(socket as net.Socket);
      });

      req.on('response', (res) => {
        // If the server doesn't upgrade, it sends a normal response
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));

        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');

          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            /*
             * Some Docker versions don't upgrade for non-TTY — fallback
             * We still need a socket; create a dummy PassThrough
             */
            reject(new Error(`Exec started without upgrade; status=${res.statusCode}, body=${body}`));
          } else {
            reject(new Error(`Exec hijack failed: ${res.statusCode} ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  // ── Container lifecycle ─────────────────────────────────────────────────────

  async createContainer(image: string, workdir: string, hostMountPath: string, extraEnv?: string[]): Promise<string> {
    const body = {
      Image: image,
      WorkingDir: workdir,
      Cmd: ['sleep', 'infinity'],
      Tty: true,
      OpenStdin: true,
      Env: ['TERM=xterm-256color', ...(extraEnv || [])],
      HostConfig: {
        Binds: [`${hostMountPath}:${workdir}`],

        // Publish all exposed ports to random host ports
        PublishAllPorts: true,

        /*
         * Network mode host gives us simpler port forwarding
         * But for isolation we use bridge mode with mapped ports
         */
        NetworkMode: 'bridge',
      },
      ExposedPorts: {
        // Expose common dev ports
        '3000/tcp': {},
        '3001/tcp': {},
        '4200/tcp': {},
        '5173/tcp': {},
        '5174/tcp': {},
        '8000/tcp': {},
        '8080/tcp': {},
        '8888/tcp': {},
      },
    };

    const res = await this.request<DockerContainerCreateResponse>(
      'POST',
      `/containers/create?name=talos-sandbox-${crypto.randomUUID().slice(0, 8)}`,
      body,
    );

    this.log.info(`Container created: ${res.Id.slice(0, 12)}`);

    return res.Id;
  }

  async startContainer(containerId: string): Promise<void> {
    await this.request('POST', `/containers/${containerId}/start`);
    this.log.info(`Container started: ${containerId.slice(0, 12)}`);
  }

  async stopContainer(containerId: string, timeout = 5): Promise<void> {
    try {
      await this.request('POST', `/containers/${containerId}/stop?t=${timeout}`);
      this.log.info(`Container stopped: ${containerId.slice(0, 12)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      // 304 = already stopped, 404 = already removed — both are fine
      if (msg.includes('304') || msg.includes('404')) {
        this.log.debug(`Container already stopped/removed: ${containerId.slice(0, 12)}`);
      } else {
        throw err;
      }
    }
  }

  async removeContainer(containerId: string): Promise<void> {
    try {
      await this.request('DELETE', `/containers/${containerId}?force=true&v=true`);
      this.log.info(`Container removed: ${containerId.slice(0, 12)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes('404')) {
        this.log.debug(`Container already removed: ${containerId.slice(0, 12)}`);
      } else {
        throw err;
      }
    }
  }

  async inspectContainer(containerId: string): Promise<any> {
    return this.request('GET', `/containers/${containerId}/json`);
  }

  // ── Exec ────────────────────────────────────────────────────────────────────

  async createExec(
    containerId: string,
    cmd: string[],
    opts?: {
      tty?: boolean;
      env?: string[];
      workdir?: string;
      stdin?: boolean;
    },
  ): Promise<string> {
    const body = {
      AttachStdin: opts?.stdin ?? true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: opts?.tty ?? false,
      Cmd: cmd,
      Env: opts?.env,
      WorkingDir: opts?.workdir,
    };

    const res = await this.request<DockerExecCreateResponse>('POST', `/containers/${containerId}/exec`, body);

    return res.Id;
  }

  async startExec(execId: string, tty: boolean): Promise<Buffer> {
    const body = { Detach: false, Tty: tty };
    return this.request<Buffer>('POST', `/exec/${execId}/start`, body);
  }

  async resizeExec(execId: string, cols: number, rows: number): Promise<void> {
    await this.request('POST', `/exec/${execId}/resize?h=${rows}&w=${cols}`);
  }

  async inspectExec(execId: string): Promise<any> {
    return this.request('GET', `/exec/${execId}/json`);
  }
}

// ─── Session ──────────────────────────────────────────────────────────────────

/**
 * Represents a single WebSocket client session.
 * Each session owns one Docker container and manages its lifecycle.
 */
class Session {
  readonly id: string;
  private ws: WebSocket;
  private docker: DockerApi;
  private log: ReturnType<typeof createLogger>;

  private containerId: string | null = null;
  private hostMountPath: string | null = null;
  private processes = new Map<string, ExecProcess>();
  private watchers = new Map<string, WatcherEntry>();
  private portPollTimer: ReturnType<typeof setInterval> | null = null;
  private knownPorts = new Set<number>();
  private firstPortDetected = false;
  private destroyed = false;

  constructor(ws: WebSocket, docker: DockerApi) {
    this.id = crypto.randomUUID();
    this.ws = ws;
    this.docker = docker;
    this.log = createLogger(`Session:${this.id.slice(0, 8)}`);

    this.ws.on('message', (data: RawData, isBinary: boolean) => {
      this.handleMessage(data, isBinary).catch((err) => {
        this.log.error('Unhandled error in message handler:', err);
      });
    });

    this.ws.on('close', () => {
      this.log.info('WebSocket closed');
      this.cleanup().catch((err) => {
        this.log.error('Cleanup error:', err);
      });
    });

    this.ws.on('error', (err: Error) => {
      this.log.error('WebSocket error:', err);
    });

    this.log.info('Session created');
  }

  // ── Message Dispatch ────────────────────────────────────────────────────────

  private async handleMessage(data: RawData, isBinary: boolean): Promise<void> {
    if (isBinary) {
      this.handleBinaryFrame(data as Buffer);
      return;
    }

    let req: JsonRpcRequest;

    try {
      req = JSON.parse(data.toString('utf-8'));
    } catch {
      this.log.warn('Invalid JSON received, ignoring');
      return;
    }

    if (req.jsonrpc !== '2.0') {
      this.log.warn('Not a JSON-RPC 2.0 message, ignoring');
      return;
    }

    this.log.debug(`RPC: ${req.method} (id=${req.id})`);

    try {
      const result = await this.dispatchMethod(req.method, req.params || {});

      if (req.id !== null && req.id !== undefined) {
        this.sendResponse({ jsonrpc: '2.0', id: req.id, result });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(`RPC error for ${req.method}:`, message);

      if (req.id !== null && req.id !== undefined) {
        this.sendResponse({
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32000, message },
        });
      }
    }
  }

  private async dispatchMethod(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      // ── Lifecycle ──
      case 'boot':
        return this.handleBoot();
      case 'teardown':
        return this.handleTeardown();

      // ── Filesystem ──
      case 'fs.readFile':
        return this.handleReadFile(params);
      case 'fs.writeFile':
        return this.handleWriteFile(params);
      case 'fs.mkdir':
        return this.handleMkdir(params);
      case 'fs.readdir':
        return this.handleReaddir(params);
      case 'fs.rm':
        return this.handleRm(params);

      // ── Processes ──
      case 'spawn':
        return this.handleSpawn(params);
      case 'process.resize':
        return this.handleProcessResize(params);
      case 'process.kill':
        return this.handleProcessKill(params);

      // ── Search ──
      case 'textSearch':
        return this.handleTextSearch(params);

      // ── Watch ──
      case 'watch':
        return this.handleWatch(params);
      case 'unwatch':
        return this.handleUnwatch(params);

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  private async handleBoot(): Promise<{ workdir: string }> {
    if (this.containerId) {
      this.log.warn('Already booted, returning existing workdir');
      return { workdir: CONTAINER_WORKDIR };
    }

    // Create a temp directory on the host for the bind mount
    this.hostMountPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'talos-sandbox-'));
    this.log.info(`Host mount path: ${this.hostMountPath}`);

    // Create the container
    this.containerId = await this.docker.createContainer(SANDBOX_IMAGE, CONTAINER_WORKDIR, this.hostMountPath);

    // Start the container
    await this.docker.startContainer(this.containerId);

    // Ensure the workdir exists inside the container with correct permissions
    await this.execSimple(['mkdir', '-p', CONTAINER_WORKDIR]);
    await this.execSimple(['chown', '-R', '1000:1000', '/home/user']);

    // Start port detection polling
    this.startPortPolling();

    this.log.info('Container booted successfully');

    return { workdir: CONTAINER_WORKDIR };
  }

  private async handleTeardown(): Promise<void> {
    await this.cleanup();
  }

  // ── Filesystem ──────────────────────────────────────────────────────────────

  /**
   * Convert a container-relative path to a host-side absolute path.
   * Paths are expected relative to CONTAINER_WORKDIR.
   */
  private resolveHostPath(containerPath: string): string {
    if (!this.hostMountPath) {
      throw new Error('Container not booted');
    }

    // Normalize: strip leading CONTAINER_WORKDIR prefix if present
    let relative = containerPath;

    if (relative.startsWith(CONTAINER_WORKDIR)) {
      relative = relative.slice(CONTAINER_WORKDIR.length);
    }

    // Strip leading slash
    if (relative.startsWith('/')) {
      relative = relative.slice(1);
    }

    const resolved = path.resolve(this.hostMountPath, relative);

    // Prevent directory traversal
    if (!resolved.startsWith(this.hostMountPath)) {
      throw new Error(`Path traversal detected: ${containerPath}`);
    }

    return resolved;
  }

  private async handleReadFile(params: Record<string, unknown>): Promise<string> {
    const filePath = params.path as string;
    const encoding = (params.encoding as string) || 'utf-8';

    if (!filePath) {
      throw new Error('Missing required parameter: path');
    }

    const hostPath = this.resolveHostPath(filePath);

    try {
      return await fsp.readFile(hostPath, { encoding: encoding as BufferEncoding });
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;

      if (code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }

      throw err;
    }
  }

  private async handleWriteFile(params: Record<string, unknown>): Promise<void> {
    const filePath = params.path as string;
    const content = params.content as string;
    const encoding = (params.encoding as string) || 'utf-8';

    if (!filePath) {
      throw new Error('Missing required parameter: path');
    }

    if (content === undefined || content === null) {
      throw new Error('Missing required parameter: content');
    }

    const hostPath = this.resolveHostPath(filePath);

    // Ensure parent directories exist
    await fsp.mkdir(path.dirname(hostPath), { recursive: true });
    await fsp.writeFile(hostPath, content, { encoding: encoding as BufferEncoding });
  }

  private async handleMkdir(params: Record<string, unknown>): Promise<void> {
    const dirPath = params.path as string;
    const recursive = (params.recursive as boolean) ?? true;

    if (!dirPath) {
      throw new Error('Missing required parameter: path');
    }

    const hostPath = this.resolveHostPath(dirPath);
    await fsp.mkdir(hostPath, { recursive });
  }

  private async handleReaddir(params: Record<string, unknown>): Promise<string[] | DirEntry[]> {
    const dirPath = params.path as string;
    const withFileTypes = (params.withFileTypes as boolean) ?? false;

    if (!dirPath) {
      throw new Error('Missing required parameter: path');
    }

    const hostPath = this.resolveHostPath(dirPath);

    if (withFileTypes) {
      const entries = await fsp.readdir(hostPath, { withFileTypes: true });

      return entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? ('directory' as const) : ('file' as const),
      }));
    }

    return fsp.readdir(hostPath);
  }

  private async handleRm(params: Record<string, unknown>): Promise<void> {
    const targetPath = params.path as string;
    const recursive = (params.recursive as boolean) ?? true;

    if (!targetPath) {
      throw new Error('Missing required parameter: path');
    }

    const hostPath = this.resolveHostPath(targetPath);
    await fsp.rm(hostPath, { recursive, force: true });
  }

  // ── Process Management ──────────────────────────────────────────────────────

  private async handleSpawn(params: Record<string, unknown>): Promise<{ processId: string }> {
    if (!this.containerId) {
      throw new Error('Container not booted');
    }

    const command = params.command as string;
    const args = (params.args as string[]) || [];
    const cwd = (params.cwd as string) || CONTAINER_WORKDIR;
    const terminal = params.terminal as { cols: number; rows: number } | undefined;
    const envRecord = (params.env as Record<string, string>) || {};
    const useTty = !!terminal;

    if (!command) {
      throw new Error('Missing required parameter: command');
    }

    const envArr = Object.entries(envRecord).map(([k, v]) => `${k}=${v}`);

    // Build the command to execute
    const cmd = [command, ...args];

    const execId = await this.docker.createExec(this.containerId, cmd, {
      tty: useTty,
      env: envArr.length > 0 ? envArr : undefined,
      workdir: cwd,
      stdin: true,
    });

    const processId = crypto.randomUUID();

    // Hijack the exec to get a bidirectional socket
    let socket: net.Socket;

    try {
      socket = await this.docker.hijackExec(execId, useTty);
    } catch {
      // Fallback: start exec non-hijacked and use polling
      this.log.warn(`Hijack failed for exec ${execId}, starting non-interactively`);
      await this.docker.startExec(execId, useTty);

      const proc: ExecProcess = {
        execId,
        processId,
        socket: null,
        killed: false,
      };

      this.processes.set(processId, proc);

      return { processId };
    }

    const proc: ExecProcess = {
      execId,
      processId,
      socket,
      killed: false,
    };

    this.processes.set(processId, proc);

    // Forward stdout/stderr from exec socket to the WS client as binary frames
    socket.on('data', (chunk: Buffer) => {
      if (this.ws.readyState !== WebSocket.OPEN || proc.killed) {
        return;
      }

      // Binary frame format: first 36 bytes = processId UUID string, rest = data
      const idBuf = Buffer.from(processId, 'utf-8'); // 36 bytes for UUID
      const frame = Buffer.concat([idBuf, chunk]);
      this.ws.send(frame, { binary: true });
    });

    socket.on('end', () => {
      this.log.debug(`Exec socket ended for process ${processId.slice(0, 8)}`);
      this.handleProcessExit(processId);
    });

    socket.on('error', (err) => {
      this.log.error(`Exec socket error for process ${processId.slice(0, 8)}:`, err.message);
      this.handleProcessExit(processId);
    });

    // Set initial terminal size if provided
    if (terminal) {
      try {
        await this.docker.resizeExec(execId, terminal.cols, terminal.rows);
      } catch (err: unknown) {
        this.log.warn(`Failed to resize exec ${execId}:`, err);
      }
    }

    this.log.info(`Process spawned: ${processId.slice(0, 8)} (cmd: ${cmd.join(' ')})`);

    return { processId };
  }

  private async handleProcessResize(params: Record<string, unknown>): Promise<void> {
    const processId = params.processId as string;
    const cols = params.cols as number;
    const rows = params.rows as number;

    if (!processId) {
      throw new Error('Missing required parameter: processId');
    }

    const proc = this.processes.get(processId);

    if (!proc) {
      throw new Error(`Process not found: ${processId}`);
    }

    await this.docker.resizeExec(proc.execId, cols, rows);
  }

  private async handleProcessKill(params: Record<string, unknown>): Promise<void> {
    const processId = params.processId as string;

    if (!processId) {
      throw new Error('Missing required parameter: processId');
    }

    const proc = this.processes.get(processId);

    if (!proc) {
      this.log.warn(`Process not found for kill: ${processId.slice(0, 8)}`);
      return;
    }

    proc.killed = true;

    if (proc.socket) {
      proc.socket.destroy();
    }

    // Also try to kill the process inside the container via its PID
    try {
      const execInfo = await this.docker.inspectExec(proc.execId);

      if (execInfo.Pid && execInfo.Pid > 0) {
        await this.execSimple(['kill', '-9', String(execInfo.Pid)]);
      }
    } catch {
      // Best-effort; process may already be dead
    }

    this.processes.delete(processId);
    this.log.info(`Process killed: ${processId.slice(0, 8)}`);
  }

  /**
   * Handle incoming binary frames from the client (stdin for a process).
   * Format: first 36 bytes = processId UUID, rest = stdin data.
   */
  private handleBinaryFrame(data: Buffer): void {
    if (data.length < 36) {
      this.log.warn('Binary frame too short, ignoring');
      return;
    }

    const processId = data.subarray(0, 36).toString('utf-8');
    const payload = data.subarray(36);

    const proc = this.processes.get(processId);

    if (!proc) {
      this.log.warn(`Binary frame for unknown process: ${processId.slice(0, 8)}`);
      return;
    }

    if (proc.socket && !proc.killed) {
      proc.socket.write(payload);
    }
  }

  private handleProcessExit(processId: string): void {
    const proc = this.processes.get(processId);

    if (!proc) {
      return;
    }

    // Determine exit code if possible
    this.docker
      .inspectExec(proc.execId)
      .then((info) => {
        const exitCode = info.ExitCode ?? -1;
        this.sendNotification('process.exit', { processId, exitCode });
        this.log.debug(`Process ${processId.slice(0, 8)} exited with code ${exitCode}`);
      })
      .catch(() => {
        this.sendNotification('process.exit', { processId, exitCode: -1 });
      })
      .finally(() => {
        this.processes.delete(processId);
      });
  }

  // ── Text Search ─────────────────────────────────────────────────────────────

  private async handleTextSearch(params: Record<string, unknown>): Promise<void> {
    if (!this.containerId) {
      throw new Error('Container not booted');
    }

    const query = params.query as string;
    const include = params.include as string | undefined;
    const exclude = params.exclude as string | undefined;

    if (!query) {
      throw new Error('Missing required parameter: query');
    }

    // Build rg command
    const cmd = ['rg', '--json', '--line-number', '--column'];

    if (include) {
      cmd.push('--glob', include);
    }

    if (exclude) {
      cmd.push('--glob', `!${exclude}`);
    }

    cmd.push('--', query, CONTAINER_WORKDIR);

    // Execute rg in the container
    const execId = await this.docker.createExec(this.containerId, cmd, {
      tty: false,
      stdin: false,
    });

    let socket: net.Socket;

    try {
      socket = await this.docker.hijackExec(execId, false);
    } catch {
      // Fallback to non-hijacked execution
      try {
        const output = await this.docker.startExec(execId, false);
        this.parseAndSendSearchResults(output as unknown as Buffer);
      } catch {
        // rg returns exit code 1 for no matches
        this.sendNotification('textSearch.complete', {});
      }

      return;
    }

    const chunks: Buffer[] = [];

    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);

      // Try to parse and send intermediate results
      this.parseAndSendSearchResults(Buffer.concat(chunks), true);
    });

    socket.on('end', () => {
      this.parseAndSendSearchResults(Buffer.concat(chunks), false);
      this.sendNotification('textSearch.complete', {});
    });

    socket.on('error', () => {
      this.sendNotification('textSearch.complete', {});
    });
  }

  private parseAndSendSearchResults(data: Buffer, partial = false): void {
    const text = data.toString('utf-8');
    const lines = text.split('\n').filter(Boolean);
    const matches: Array<{ file: string; line: number; column: number; length: number; preview: string }> = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);

        if (parsed.type === 'match') {
          const matchData = parsed.data;
          const filePath = matchData.path?.text || '';

          for (const submatch of matchData.submatches || []) {
            matches.push({
              file: filePath.replace(CONTAINER_WORKDIR + '/', ''),
              line: matchData.line_number || 0,
              column: (submatch.start || 0) + 1,
              length: (submatch.end || 0) - (submatch.start || 0),
              preview: matchData.lines?.text || '',
            });
          }
        }
      } catch {
        // Not valid JSON — skip (e.g. Docker stream header bytes)
      }
    }

    if (matches.length > 0) {
      this.sendNotification('textSearch.progress', { matches });
    }
  }

  // ── File Watching ───────────────────────────────────────────────────────────

  private async handleWatch(params: Record<string, unknown>): Promise<{ watchId: string }> {
    if (!this.hostMountPath) {
      throw new Error('Container not booted');
    }

    const containerPath = (params.path as string) || CONTAINER_WORKDIR;
    const include = (params.include as string[]) || ['**/*'];
    const exclude = (params.exclude as string[]) || ['**/node_modules/**', '**/.git/**'];
    const includeContent = (params.includeContent as boolean) ?? false;

    const hostPath = this.resolveHostPath(containerPath);
    const watchId = crypto.randomUUID();

    const controller = new AbortController();

    // Use Node.js recursive fs.watch
    try {
      const watcher = fsp.watch(hostPath, {
        recursive: true,
        signal: controller.signal,
      } as any);

      // Process events asynchronously
      (async () => {
        try {
          for await (const event of watcher) {
            if (controller.signal.aborted) {
              break;
            }

            const eventType = event.eventType as string;
            const filename = event.filename as string | null;

            if (!filename) {
              continue;
            }

            // Check against include/exclude patterns
            if (this.isExcluded(filename, exclude)) {
              continue;
            }

            const fullHostPath = path.join(hostPath, filename);
            const containerFilePath = path.join(containerPath, filename);

            let fileType: string;
            let buffer: string | undefined;

            try {
              const stat = await fsp.stat(fullHostPath);

              if (stat.isDirectory()) {
                fileType = eventType === 'rename' ? 'add_dir' : 'update_directory';
              } else {
                fileType = eventType === 'rename' ? 'add_file' : 'change';

                if (includeContent && stat.isFile() && stat.size < 1024 * 1024) {
                  buffer = await fsp.readFile(fullHostPath, 'utf-8');
                }
              }
            } catch {
              // File was deleted
              fileType = 'remove_file';
            }

            this.sendNotification('watch.event', {
              watchId,
              events: [
                {
                  type: fileType,
                  path: containerFilePath,
                  ...(buffer !== undefined ? { content: buffer } : {}),
                },
              ],
            });
          }
        } catch (err: unknown) {
          if ((err as any)?.name !== 'AbortError') {
            this.log.error(`Watcher error for ${watchId}:`, err);
          }
        }
      })();

      this.watchers.set(watchId, { hostPath, controller });
      this.log.info(`Watcher started: ${watchId.slice(0, 8)} on ${hostPath}`);
    } catch (err: unknown) {
      this.log.error('Failed to start watcher:', err);
      throw err;
    }

    return { watchId };
  }

  private async handleUnwatch(params: Record<string, unknown>): Promise<void> {
    const watchId = params.watchId as string;

    if (!watchId) {
      throw new Error('Missing required parameter: watchId');
    }

    const entry = this.watchers.get(watchId);

    if (entry) {
      entry.controller.abort();
      this.watchers.delete(watchId);
      this.log.info(`Watcher stopped: ${watchId.slice(0, 8)}`);
    }
  }

  private isExcluded(filename: string, excludePatterns: string[]): boolean {
    for (const pattern of excludePatterns) {
      // Simple glob matching: handle **/name/** patterns
      const normalized = pattern.replace(/\*\*/g, '');
      const segments = normalized.split('/').filter(Boolean);

      for (const segment of segments) {
        if (segment === '*') {
          continue;
        }

        if (filename.includes(segment)) {
          return true;
        }
      }
    }

    return false;
  }

  // ── Port Detection ──────────────────────────────────────────────────────────

  private startPortPolling(): void {
    if (this.portPollTimer) {
      return;
    }

    this.portPollTimer = setInterval(() => {
      this.detectPorts().catch((err) => {
        this.log.trace('Port detection error:', err);
      });
    }, PORT_POLL_INTERVAL_MS);

    // Initial detection after a short delay
    setTimeout(() => {
      this.detectPorts().catch(() => {});
    }, 1000);
  }

  private async detectPorts(): Promise<void> {
    if (!this.containerId || this.destroyed) {
      return;
    }

    try {
      // Use `ss -tlnp` to detect listening TCP ports inside the container
      const output = await this.execSimple(['sh', '-c', 'ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || true']);
      const lines = output.split('\n');
      const currentPorts = new Set<number>();

      for (const line of lines) {
        /*
         * Parse ss output: LISTEN  0  128  0.0.0.0:3000  0.0.0.0:*
         * Also handles :::3000 format
         */
        const matches = line.match(/:(\d+)\s/);

        if (matches) {
          const port = parseInt(matches[1], 10);

          // Filter out ephemeral/system ports, keep dev server ports
          if (port > 0 && port < 65536) {
            currentPorts.add(port);
          }
        }
      }

      // Detect newly opened ports
      for (const port of currentPorts) {
        if (!this.knownPorts.has(port)) {
          this.knownPorts.add(port);

          // Try to get the mapped host port from Docker
          const hostPort = await this.getHostPort(port);
          const url = `http://localhost:${hostPort || port}`;

          if (!this.firstPortDetected) {
            this.firstPortDetected = true;
            this.sendNotification('server-ready', { port, url });
            this.log.info(`Server ready on port ${port} -> ${url}`);
          }

          this.sendNotification('port', { port, type: 'open', url });
        }
      }

      // Detect closed ports
      for (const port of this.knownPorts) {
        if (!currentPorts.has(port)) {
          this.knownPorts.delete(port);
          this.sendNotification('port', { port, type: 'close', url: '' });
        }
      }
    } catch {
      // Container might be stopping — ignore
    }
  }

  private async getHostPort(containerPort: number): Promise<number | null> {
    if (!this.containerId) {
      return null;
    }

    try {
      const info = await this.docker.inspectContainer(this.containerId);
      const portBindings = info?.NetworkSettings?.Ports;

      if (!portBindings) {
        return null;
      }

      const key = `${containerPort}/tcp`;
      const bindings = portBindings[key];

      if (bindings && bindings.length > 0) {
        return parseInt(bindings[0].HostPort, 10);
      }
    } catch {
      // Ignore
    }

    return null;
  }

  // ── Docker Exec Helpers ─────────────────────────────────────────────────────

  /**
   * Run a simple command in the container and return stdout as a string.
   * Used for internal operations like port detection.
   */
  private async execSimple(cmd: string[]): Promise<string> {
    if (!this.containerId) {
      throw new Error('Container not booted');
    }

    const execId = await this.docker.createExec(this.containerId, cmd, {
      tty: false,
      stdin: false,
    });

    const output = await this.docker.startExec(execId, false);

    if (Buffer.isBuffer(output)) {
      return this.stripDockerStreamHeaders(output);
    }

    return String(output || '');
  }

  /**
   * Docker multiplexed stream format (non-TTY): each frame has an 8-byte header.
   * [stream_type(1)][0(3)][size(4)][payload(size)]
   * stream_type: 0=stdin, 1=stdout, 2=stderr
   */
  private stripDockerStreamHeaders(data: Buffer): string {
    const parts: string[] = [];
    let offset = 0;

    while (offset + 8 <= data.length) {
      // const streamType = data[offset]; // 0=stdin, 1=stdout, 2=stderr
      const frameSize = data.readUInt32BE(offset + 4);

      if (offset + 8 + frameSize > data.length) {
        // Incomplete frame — take what we can
        parts.push(data.subarray(offset + 8).toString('utf-8'));
        break;
      }

      parts.push(data.subarray(offset + 8, offset + 8 + frameSize).toString('utf-8'));
      offset += 8 + frameSize;
    }

    // If no valid frames were found, return the raw string (might be plain text)
    if (parts.length === 0 && data.length > 0) {
      return data.toString('utf-8');
    }

    return parts.join('');
  }

  // ── Transport ───────────────────────────────────────────────────────────────

  private sendResponse(response: JsonRpcResponse): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(response));
    }
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      const notification: JsonRpcNotification = {
        jsonrpc: '2.0',
        method,
        params,
      };

      this.ws.send(JSON.stringify(notification));
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  private async cleanup(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.log.info('Cleaning up session...');

    // Stop port polling
    if (this.portPollTimer) {
      clearInterval(this.portPollTimer);
      this.portPollTimer = null;
    }

    // Kill all exec processes
    for (const [pid, proc] of this.processes) {
      this.log.debug(`Killing process ${pid.slice(0, 8)}`);
      proc.killed = true;

      if (proc.socket) {
        proc.socket.destroy();
      }
    }

    this.processes.clear();

    // Stop all watchers
    for (const [wid, entry] of this.watchers) {
      this.log.debug(`Stopping watcher ${wid.slice(0, 8)}`);
      entry.controller.abort();
    }

    this.watchers.clear();

    // Stop and remove the container
    if (this.containerId) {
      try {
        await this.docker.stopContainer(this.containerId);
      } catch (err: unknown) {
        this.log.warn('Error stopping container:', err);
      }

      try {
        await this.docker.removeContainer(this.containerId);
      } catch (err: unknown) {
        this.log.warn('Error removing container:', err);
      }

      this.containerId = null;
    }

    // Clean up the temp directory
    if (this.hostMountPath) {
      try {
        await fsp.rm(this.hostMountPath, { recursive: true, force: true });
        this.log.info(`Removed host mount: ${this.hostMountPath}`);
      } catch (err: unknown) {
        this.log.warn(`Failed to remove host mount ${this.hostMountPath}:`, err);
      }

      this.hostMountPath = null;
    }

    this.log.info('Session cleanup complete');
  }
}

// ─── Server Factory ───────────────────────────────────────────────────────────

/**
 * Create an HTTP server with WebSocket upgrade handling for Docker runtime sessions.
 *
 * Usage:
 * ```ts
 * const server = createRuntimeServer({ port: 3001 });
 * ```
 */
export function createRuntimeServer(options: RuntimeServerOptions = {}): http.Server | https.Server {
  const port = options.port ?? 3001;
  const host = options.host ?? '0.0.0.0';
  const docker = new DockerApi(DOCKER_SOCKET);

  // Create HTTP(S) server
  let server: http.Server | https.Server;

  if (options.tls) {
    server = https.createServer({
      key: fs.readFileSync(options.tls.key),
      cert: fs.readFileSync(options.tls.cert),
    });
  } else {
    server = http.createServer((_req, res) => {
      // Health check endpoint
      if (_req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));

        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });
  }

  // Create WebSocket server attached to the HTTP server
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 50 * 1024 * 1024, // 50 MB max payload
    perMessageDeflate: false,
  });

  const sessions = new Map<string, Session>();

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const clientIp = req.socket.remoteAddress || 'unknown';
    serverLog.info(`New WebSocket connection from ${clientIp}`);

    const session = new Session(ws, docker);
    sessions.set(session.id, session);

    ws.on('close', () => {
      sessions.delete(session.id);
      serverLog.info(`Session ${session.id.slice(0, 8)} removed (${sessions.size} active)`);
    });
  });

  wss.on('error', (err: Error) => {
    serverLog.error('WebSocket server error:', err);
  });

  // Graceful shutdown
  const shutdown = async () => {
    serverLog.info('Shutting down runtime server...');

    // Close WebSocket server (stops accepting new connections)
    wss.close();

    // Close all existing connections — each session will clean up its container
    for (const client of wss.clients) {
      client.close(1001, 'Server shutting down');
    }

    // Wait a bit for cleanup
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));

    server.close(() => {
      serverLog.info('Server closed');
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      serverLog.warn('Force exiting after shutdown timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start listening
  server.listen(port, host, () => {
    serverLog.info(`Runtime WebSocket server listening on ${host}:${port}`);
    serverLog.info(`WebSocket endpoint: ws://${host}:${port}/ws`);
    serverLog.info(`Docker socket: ${DOCKER_SOCKET}`);
    serverLog.info(`Sandbox image: ${SANDBOX_IMAGE}`);
  });

  return server;
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

/**
 * When run directly as a script: `npx tsx runtime-ws-server.ts`
 */
if (typeof require !== 'undefined' && require.main === module) {
  const port = parseInt(process.env.RUNTIME_WS_PORT || '3001', 10);
  const host = process.env.RUNTIME_WS_HOST || '0.0.0.0';

  createRuntimeServer({ port, host });
}

// Also support ESM direct execution
const isDirectExecution =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('runtime-ws-server.ts') || process.argv[1].endsWith('runtime-ws-server.js'));

if (isDirectExecution) {
  const port = parseInt(process.env.RUNTIME_WS_PORT || '3001', 10);
  const host = process.env.RUNTIME_WS_HOST || '0.0.0.0';

  createRuntimeServer({ port, host });
}
