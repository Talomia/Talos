import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock logger ──────────────────────────────────────────────────────────────

vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─── Mock WebSocket ──────────────────────────────────────────────────────────

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  binaryType = 'blob';
  readyState = MockWebSocket.OPEN;
  url: string;

  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;

  sentMessages: Array<string | ArrayBuffer> = [];

  constructor(url: string) {
    this.url = url;

    // Simulate async open
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({ type: 'open' });
    });
  }

  send(data: string | ArrayBuffer): void {
    this.sentMessages.push(data);
  }

  close(_code?: number, _reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  // ── Test helpers ────────────────────────────────────────────────────────

  /** Simulate receiving a JSON text message */
  receiveJSON(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as any);
  }

  /** Simulate receiving a binary frame */
  receiveBinary(buffer: ArrayBuffer): void {
    this.onmessage?.({ data: buffer } as any);
  }

  /** Simulate the socket closing */
  simulateClose(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason } as any);
  }

  /** Simulate an error */
  simulateError(): void {
    this.onerror?.({ type: 'error' } as any);
  }
}

// ─── Install the mock WebSocket globally ──────────────────────────────────────

let capturedWs: MockWebSocket;

vi.stubGlobal(
  'WebSocket',
  class extends MockWebSocket {
    constructor(url: string) {
      super(url);

      // expose the mock so tests can feed it replies
      capturedWs = this as unknown as MockWebSocket;
    }

    // Vitest reads WebSocket.OPEN etc. as static fields
    static override CONNECTING = 0;
    static override OPEN = 1;
    static override CLOSING = 2;
    static override CLOSED = 3;
  },
);

// ─── Import the engine AFTER mocks are installed ─────────────────────────────

import { DockerEngine } from './docker-engine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Encode a binary frame matching the server protocol: [36-byte UUID][payload] */
function encodeBinaryFrame(_opcode: number, processId: string, payload: string): ArrayBuffer {
  const payloadBytes = textEncoder.encode(payload);
  const idBytes = textEncoder.encode(processId.padEnd(36, '\0'));
  const buffer = new ArrayBuffer(36 + payloadBytes.byteLength);
  const uint8 = new Uint8Array(buffer);

  uint8.set(idBytes.slice(0, 36), 0);
  uint8.set(payloadBytes, 36);

  return buffer;
}

/** Decode a binary frame sent by the engine: [36-byte UUID][payload] */
function decodeBinaryFrame(data: ArrayBuffer): { processId: string; payload: string } {
  const uint8 = new Uint8Array(data);

  const processId = textDecoder.decode(uint8.slice(0, 36)).replace(/\0+$/, '');
  const payload = textDecoder.decode(uint8.slice(36));

  return { processId, payload };
}

/**
 * Auto-respond to the very next JSON-RPC request from the engine.
 * Must be called AFTER the request is sent (i.e. after the engine's async
 * method sends its message via the mock WS).
 */
function autoRespondRPC(result: unknown): void {
  // The last sent text message should be the pending RPC request
  const sent = capturedWs.sentMessages;
  const lastText = [...sent].reverse().find((m) => typeof m === 'string') as string | undefined;

  if (!lastText) {
    throw new Error('No pending RPC request found on the mock WebSocket');
  }

  const req = JSON.parse(lastText);

  capturedWs.receiveJSON({ id: req.id, result });
}

/** Boot a DockerEngine and wire up automatic responses for the boot RPC */
async function bootEngine(): Promise<DockerEngine> {
  const engine = new DockerEngine('ws://test:9999');

  const bootPromise = engine.boot();

  // Wait for the mock WS connection to open
  await flushMicrotasks();

  // Respond to the 'boot' RPC
  autoRespondRPC({ workdir: '/home/user/project' });

  await bootPromise;

  return engine;
}

/** Flush pending microtasks (needed for queueMicrotask in MockWebSocket) */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DockerEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ── Boot / Teardown ────────────────────────────────────────────────────

  describe('boot()', () => {
    it('should connect via WebSocket and send a boot RPC', async () => {
      const engine = await bootEngine();

      // The WS was created with the correct URL
      expect(capturedWs.url).toBe('ws://test:9999');

      // The engine should be booted and expose the workdir
      expect(engine.workdir).toBe('/home/user/project');
    });

    it('should use the workdir from the boot RPC response', async () => {
      const engine = new DockerEngine('ws://test:9999');
      const bootPromise = engine.boot();

      await flushMicrotasks();

      autoRespondRPC({ workdir: '/custom/dir' });
      await bootPromise;

      expect(engine.workdir).toBe('/custom/dir');
    });

    it('should use DEFAULT_WORKDIR when boot response has no workdir', async () => {
      const engine = new DockerEngine('ws://test:9999');
      const bootPromise = engine.boot();

      await flushMicrotasks();

      autoRespondRPC({});
      await bootPromise;

      expect(engine.workdir).toBe('/home/user/project');
    });
  });

  describe('teardown()', () => {
    it('should send teardown RPC and close the WebSocket', async () => {
      const engine = await bootEngine();

      const teardownPromise = engine.teardown();

      // Respond to the teardown RPC
      await flushMicrotasks();
      autoRespondRPC({});
      await teardownPromise;

      expect(capturedWs.readyState).toBe(MockWebSocket.CLOSED);
    });

    it('should reject pending requests on teardown', async () => {
      const engine = await bootEngine();

      // Start a request that will never be answered
      const pendingPromise = engine.fs.readFile('/test.txt', 'utf-8');

      await flushMicrotasks();

      /*
       * Start teardown — it will try to send a 'teardown' RPC then call #disconnect.
       * The #disconnect call rejects all pending requests.
       * We DON'T await teardownPromise because the teardown RPC itself won't get a response.
       */
      const teardownPromise = engine.teardown();

      // Advance timers to trigger the RPC timeout for the teardown RPC itself
      vi.advanceTimersByTime(31_000);

      // The teardown RPC will time out — that's fine, we catch it
      try {
        await teardownPromise;
      } catch {
        // expected — teardown RPC timed out
      }

      // The original readFile should have been rejected by disconnect()
      await expect(pendingPromise).rejects.toThrow();
    });
  });

  // ── Accessing properties before boot ───────────────────────────────────

  describe('pre-boot guards', () => {
    it('should throw when accessing workdir before boot', () => {
      const engine = new DockerEngine('ws://test:9999');

      expect(() => engine.workdir).toThrow('DockerEngine not booted');
    });

    it('should throw when accessing fs before boot', () => {
      const engine = new DockerEngine('ws://test:9999');

      expect(() => engine.fs).toThrow('DockerEngine not booted');
    });

    it('should throw when calling spawn before boot', async () => {
      const engine = new DockerEngine('ws://test:9999');

      await expect(engine.spawn('ls', [])).rejects.toThrow('DockerEngine not booted');
    });

    it('should throw when calling setPreviewScript before boot', async () => {
      const engine = new DockerEngine('ws://test:9999');

      await expect(engine.setPreviewScript('console.log(1)')).rejects.toThrow('DockerEngine not booted');
    });

    it('should throw when calling textSearch before boot', async () => {
      const engine = new DockerEngine('ws://test:9999');

      await expect(engine.textSearch('query', {}, vi.fn())).rejects.toThrow('DockerEngine not booted');
    });

    it('should throw when calling watchPaths before boot', async () => {
      const engine = new DockerEngine('ws://test:9999');

      await expect(engine.watchPaths({ include: [], exclude: [] }, vi.fn())).rejects.toThrow('DockerEngine not booted');
    });
  });

  // ── Preview URL ────────────────────────────────────────────────────────

  describe('getPreviewUrl()', () => {
    it('should return http://localhost:<port>', () => {
      const engine = new DockerEngine('ws://test:9999');

      expect(engine.getPreviewUrl(3000)).toBe('http://localhost:3000');
      expect(engine.getPreviewUrl(8080)).toBe('http://localhost:8080');
    });
  });

  // ── Filesystem ─────────────────────────────────────────────────────────

  describe('fs operations', () => {
    let engine: DockerEngine;

    beforeEach(async () => {
      engine = await bootEngine();
    });

    it('readFile with encoding should send fs.readFile RPC and return string', async () => {
      const readPromise = engine.fs.readFile('/app/index.ts', 'utf-8');

      await flushMicrotasks();
      autoRespondRPC('const x = 1;');

      const result = await readPromise;

      expect(result).toBe('const x = 1;');

      // Verify the RPC message shape
      const rpcMsg = JSON.parse(capturedWs.sentMessages.filter((m) => typeof m === 'string').pop() as string);
      expect(rpcMsg.method).toBe('fs.readFile');
      expect(rpcMsg.params).toEqual({ path: '/app/index.ts', encoding: 'utf-8' });
    });

    it('readFile without encoding should decode base64 binary response', async () => {
      const readPromise = engine.fs.readFile('/image.png');

      await flushMicrotasks();

      // Server returns base64 of [0x89, 0x50]
      autoRespondRPC(btoa(String.fromCharCode(0x89, 0x50)));

      const result = await readPromise;

      expect(result).toBeInstanceOf(Uint8Array);
      expect((result as Uint8Array)[0]).toBe(0x89);
      expect((result as Uint8Array)[1]).toBe(0x50);
    });

    it('writeFile with string content should send fs.writeFile RPC', async () => {
      const writePromise = engine.fs.writeFile('/test.txt', 'hello world', 'utf-8');

      await flushMicrotasks();
      autoRespondRPC(undefined);

      await writePromise;

      const rpcMsg = JSON.parse(capturedWs.sentMessages.filter((m) => typeof m === 'string').pop() as string);
      expect(rpcMsg.method).toBe('fs.writeFile');
      expect(rpcMsg.params.content).toBe('hello world');
      expect(rpcMsg.params.isBinary).toBe(false);
    });

    it('writeFile with Uint8Array content should base64-encode and mark isBinary', async () => {
      const bytes = new Uint8Array([65, 66, 67]); // "ABC"
      const writePromise = engine.fs.writeFile('/binary.bin', bytes);

      await flushMicrotasks();
      autoRespondRPC(undefined);

      await writePromise;

      const rpcMsg = JSON.parse(capturedWs.sentMessages.filter((m) => typeof m === 'string').pop() as string);
      expect(rpcMsg.method).toBe('fs.writeFile');
      expect(rpcMsg.params.content).toBe(btoa('ABC'));
      expect(rpcMsg.params.isBinary).toBe(true);
    });

    it('mkdir should send fs.mkdir RPC with options', async () => {
      const mkdirPromise = engine.fs.mkdir('/src/components', { recursive: true });

      await flushMicrotasks();
      autoRespondRPC(undefined);

      await mkdirPromise;

      const rpcMsg = JSON.parse(capturedWs.sentMessages.filter((m) => typeof m === 'string').pop() as string);
      expect(rpcMsg.method).toBe('fs.mkdir');
      expect(rpcMsg.params).toEqual({ path: '/src/components', options: { recursive: true } });
    });

    it('readdir should return string[] without options', async () => {
      const readdirPromise = engine.fs.readdir('/src');

      await flushMicrotasks();
      autoRespondRPC(['index.ts', 'app.ts']);

      const result = await readdirPromise;

      expect(result).toEqual(['index.ts', 'app.ts']);
    });

    it('readdir with withFileTypes should return DirEntry[]', async () => {
      const readdirPromise = engine.fs.readdir('/src', { withFileTypes: true });

      await flushMicrotasks();
      autoRespondRPC([
        { name: 'index.ts', type: 'file' },
        { name: 'components', type: 'directory' },
      ]);

      const result = await readdirPromise;

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('index.ts');
      expect(result[0].isFile()).toBe(true);
      expect(result[0].isDirectory()).toBe(false);
      expect(result[1].name).toBe('components');
      expect(result[1].isFile()).toBe(false);
      expect(result[1].isDirectory()).toBe(true);
    });

    it('rm should send fs.rm RPC', async () => {
      const rmPromise = engine.fs.rm('/tmp/old', { recursive: true });

      await flushMicrotasks();
      autoRespondRPC(undefined);

      await rmPromise;

      const rpcMsg = JSON.parse(capturedWs.sentMessages.filter((m) => typeof m === 'string').pop() as string);
      expect(rpcMsg.method).toBe('fs.rm');
      expect(rpcMsg.params).toEqual({ path: '/tmp/old', options: { recursive: true } });
    });

    it('should propagate RPC errors from the server', async () => {
      const readPromise = engine.fs.readFile('/missing.txt', 'utf-8');

      await flushMicrotasks();

      // Send an error response
      const sent = capturedWs.sentMessages;
      const lastText = [...sent].reverse().find((m) => typeof m === 'string') as string;
      const req = JSON.parse(lastText);

      capturedWs.receiveJSON({
        id: req.id,
        error: { code: -32000, message: 'ENOENT: file not found' },
      });

      await expect(readPromise).rejects.toThrow('ENOENT: file not found');
    });
  });

  // ── Spawn / Process ────────────────────────────────────────────────────

  describe('spawn()', () => {
    let engine: DockerEngine;

    beforeEach(async () => {
      engine = await bootEngine();
    });

    it('should send a spawn RPC and return a process with the correct processId', async () => {
      const spawnPromise = engine.spawn('npm', ['install'], {
        cwd: '/app',
        env: { NODE_ENV: 'development' },
        terminal: { cols: 80, rows: 24 },
      });

      await flushMicrotasks();
      autoRespondRPC({ processId: 'proc-42' });

      const proc = await spawnPromise;

      expect(proc).toBeDefined();
      expect(proc.input).toBeInstanceOf(WritableStream);
      expect(proc.output).toBeInstanceOf(ReadableStream);
      expect(proc.exit).toBeInstanceOf(Promise);

      // Verify the RPC request
      const rpcMsg = JSON.parse(capturedWs.sentMessages.filter((m) => typeof m === 'string').pop() as string);
      expect(rpcMsg.method).toBe('spawn');
      expect(rpcMsg.params.command).toBe('npm');
      expect(rpcMsg.params.args).toEqual(['install']);
    });

    it('should relay stdin writes as binary frames', async () => {
      const spawnPromise = engine.spawn('bash', []);

      await flushMicrotasks();
      autoRespondRPC({ processId: 'proc-stdin' });

      const proc = await spawnPromise;

      const writer = proc.input.getWriter();
      await writer.write('echo hello\n');
      writer.releaseLock();

      // Find the binary frame that was sent
      const binaryFrames = capturedWs.sentMessages.filter((m) => m instanceof ArrayBuffer);
      expect(binaryFrames.length).toBeGreaterThanOrEqual(1);

      const decoded = decodeBinaryFrame(binaryFrames[binaryFrames.length - 1] as ArrayBuffer);
      expect(decoded.processId).toBe('proc-stdin');
      expect(decoded.payload).toBe('echo hello\n');
    });

    it('should relay stdout binary frames to the output ReadableStream', async () => {
      const spawnPromise = engine.spawn('ls', ['-la']);

      await flushMicrotasks();
      autoRespondRPC({ processId: 'proc-stdout' });

      const proc = await spawnPromise;

      // Simulate server sending a stdout frame
      const stdoutFrame = encodeBinaryFrame(0x01, 'proc-stdout', 'file1.txt\nfile2.txt\n');
      capturedWs.receiveBinary(stdoutFrame);

      const reader = proc.output.getReader();
      const { value, done } = await reader.read();
      reader.releaseLock();

      expect(done).toBe(false);
      expect(value).toBe('file1.txt\nfile2.txt\n');
    });

    it('should resolve exit promise when process-exit event arrives', async () => {
      const spawnPromise = engine.spawn('node', ['app.js']);

      await flushMicrotasks();
      autoRespondRPC({ processId: 'proc-exit' });

      const proc = await spawnPromise;

      // Simulate process exit event
      capturedWs.receiveJSON({
        event: 'process-exit',
        data: { processId: 'proc-exit', code: 0 },
      });

      const exitCode = await proc.exit;
      expect(exitCode).toBe(0);
    });

    it('should resolve exit with non-zero code on failure', async () => {
      const spawnPromise = engine.spawn('node', ['crash.js']);

      await flushMicrotasks();
      autoRespondRPC({ processId: 'proc-fail' });

      const proc = await spawnPromise;

      capturedWs.receiveJSON({
        event: 'process-exit',
        data: { processId: 'proc-fail', code: 1 },
      });

      const exitCode = await proc.exit;
      expect(exitCode).toBe(1);
    });

    it('resize() should send process.resize RPC', async () => {
      const spawnPromise = engine.spawn('vim', []);

      await flushMicrotasks();
      autoRespondRPC({ processId: 'proc-resize' });

      const proc = await spawnPromise;

      proc.resize({ cols: 120, rows: 40 });

      await flushMicrotasks();

      const rpcMsg = JSON.parse(capturedWs.sentMessages.filter((m) => typeof m === 'string').pop() as string);
      expect(rpcMsg.method).toBe('process.resize');
      expect(rpcMsg.params).toEqual({ processId: 'proc-resize', cols: 120, rows: 40 });
    });

    it('kill() should send process.kill RPC', async () => {
      const spawnPromise = engine.spawn('node', ['server.js']);

      await flushMicrotasks();
      autoRespondRPC({ processId: 'proc-kill' });

      const proc = await spawnPromise;

      proc.kill();

      await flushMicrotasks();

      const rpcMsg = JSON.parse(capturedWs.sentMessages.filter((m) => typeof m === 'string').pop() as string);
      expect(rpcMsg.method).toBe('process.kill');
      expect(rpcMsg.params).toEqual({ processId: 'proc-kill' });
    });
  });

  // ── Events ─────────────────────────────────────────────────────────────

  describe('event dispatch', () => {
    let engine: DockerEngine;

    beforeEach(async () => {
      engine = await bootEngine();
    });

    it('should dispatch server-ready events to registered listeners', () => {
      const listener = vi.fn();
      engine.on('server-ready', listener);

      capturedWs.receiveJSON({
        event: 'server-ready',
        data: { port: 3000, url: 'http://localhost:3000' },
      });

      expect(listener).toHaveBeenCalledWith(3000, 'http://localhost:3000');
    });

    it('should dispatch port events to registered listeners', () => {
      const listener = vi.fn();
      engine.on('port', listener);

      capturedWs.receiveJSON({
        event: 'port',
        data: { port: 8080, type: 'open', url: 'http://localhost:8080' },
      });

      expect(listener).toHaveBeenCalledWith(8080, 'open', 'http://localhost:8080');
    });

    it('should dispatch port close events', () => {
      const listener = vi.fn();
      engine.on('port', listener);

      capturedWs.receiveJSON({
        event: 'port',
        data: { port: 8080, type: 'close', url: 'http://localhost:8080' },
      });

      expect(listener).toHaveBeenCalledWith(8080, 'close', 'http://localhost:8080');
    });

    it('should dispatch preview-message events to registered listeners', () => {
      const listener = vi.fn();
      engine.on('preview-message', listener);

      const message = {
        type: 'PREVIEW_UNCAUGHT_EXCEPTION' as const,
        message: 'ReferenceError: x is not defined',
        pathname: '/',
        search: '',
        hash: '',
        port: 3000,
        stack: 'at foo.js:5',
      };

      capturedWs.receiveJSON({
        event: 'preview-message',
        data: message,
      });

      expect(listener).toHaveBeenCalledWith(message);
    });

    it('should support multiple listeners for the same event', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      engine.on('server-ready', listener1);
      engine.on('server-ready', listener2);

      capturedWs.receiveJSON({
        event: 'server-ready',
        data: { port: 5000, url: 'http://localhost:5000' },
      });

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();
    });

    it('should handle errors in event listeners without crashing', () => {
      const badListener = vi.fn(() => {
        throw new Error('Listener blew up');
      });
      const goodListener = vi.fn();

      engine.on('server-ready', badListener);
      engine.on('server-ready', goodListener);

      // This should NOT throw even though the first listener throws
      expect(() => {
        capturedWs.receiveJSON({
          event: 'server-ready',
          data: { port: 3000, url: 'http://localhost:3000' },
        });
      }).not.toThrow();

      expect(badListener).toHaveBeenCalledOnce();
      expect(goodListener).toHaveBeenCalledOnce();
    });
  });

  // ── Watch / Unwatch ────────────────────────────────────────────────────

  describe('watchPaths()', () => {
    let engine: DockerEngine;

    beforeEach(async () => {
      engine = await bootEngine();
    });

    it('should send watch RPC and return an unsubscribe function', async () => {
      const callback = vi.fn();
      const watchPromise = engine.watchPaths({ include: ['**/*.ts'], exclude: ['node_modules/**'] }, callback);

      await flushMicrotasks();
      autoRespondRPC({ watchId: 'watch-1' });

      const unsubscribe = await watchPromise;

      expect(typeof unsubscribe).toBe('function');
    });

    it('should deliver file-change events to the watch callback', async () => {
      const callback = vi.fn();
      const watchPromise = engine.watchPaths({ include: ['**/*'], exclude: [] }, callback);

      await flushMicrotasks();
      autoRespondRPC({ watchId: 'watch-2' });

      await watchPromise;

      const events = [
        { type: 'change' as const, path: '/src/index.ts' },
        { type: 'add_file' as const, path: '/src/new.ts' },
      ];

      capturedWs.receiveJSON({
        event: 'file-change',
        data: { watchId: 'watch-2', events },
      });

      expect(callback).toHaveBeenCalledWith(events);
    });

    it('should send unwatch RPC when unsubscribe is called', async () => {
      const callback = vi.fn();
      const watchPromise = engine.watchPaths({ include: ['**/*'], exclude: [] }, callback);

      await flushMicrotasks();
      autoRespondRPC({ watchId: 'watch-3' });

      const unsubscribe = await watchPromise;

      unsubscribe();

      await flushMicrotasks();

      const rpcMsg = JSON.parse(capturedWs.sentMessages.filter((m) => typeof m === 'string').pop() as string);
      expect(rpcMsg.method).toBe('unwatch');
      expect(rpcMsg.params).toEqual({ watchId: 'watch-3' });
    });

    it('should stop delivering events after unsubscribe', async () => {
      const callback = vi.fn();
      const watchPromise = engine.watchPaths({ include: ['**/*'], exclude: [] }, callback);

      await flushMicrotasks();
      autoRespondRPC({ watchId: 'watch-4' });

      const unsubscribe = await watchPromise;

      unsubscribe();

      // Send an event for the old watch ID
      capturedWs.receiveJSON({
        event: 'file-change',
        data: { watchId: 'watch-4', events: [{ type: 'change', path: '/x.ts' }] },
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  // ── Text Search ────────────────────────────────────────────────────────

  describe('textSearch()', () => {
    let engine: DockerEngine;

    beforeEach(async () => {
      engine = await bootEngine();
    });

    it('should send textSearch RPC with query and options', async () => {
      const onProgress = vi.fn();

      const searchPromise = engine.textSearch('TODO', { include: '*.ts', exclude: 'node_modules' }, onProgress);

      await flushMicrotasks();
      autoRespondRPC({ searchId: 'search-1' });

      // Simulate search progress
      await flushMicrotasks();
      capturedWs.receiveJSON({
        event: 'search-progress',
        data: {
          searchId: 'search-1',
          results: [{ file: '/src/index.ts', line: 5, column: 3, length: 4, preview: '// TODO fix this' }],
        },
      });

      expect(onProgress).toHaveBeenCalledWith([
        { file: '/src/index.ts', line: 5, column: 3, length: 4, preview: '// TODO fix this' },
      ]);

      // Simulate search completion
      capturedWs.receiveJSON({
        event: 'search-complete',
        data: { searchId: 'search-1' },
      });

      await searchPromise;
    });

    it('should deliver multiple progress updates', async () => {
      const onProgress = vi.fn();

      const searchPromise = engine.textSearch('import', {}, onProgress);

      await flushMicrotasks();
      autoRespondRPC({ searchId: 'search-2' });

      await flushMicrotasks();

      // First batch
      capturedWs.receiveJSON({
        event: 'search-progress',
        data: {
          searchId: 'search-2',
          results: [{ file: '/a.ts', line: 1, column: 0, length: 6, preview: 'import ...' }],
        },
      });

      // Second batch
      capturedWs.receiveJSON({
        event: 'search-progress',
        data: {
          searchId: 'search-2',
          results: [{ file: '/b.ts', line: 3, column: 0, length: 6, preview: 'import ...' }],
        },
      });

      // Complete
      capturedWs.receiveJSON({
        event: 'search-complete',
        data: { searchId: 'search-2' },
      });

      await searchPromise;

      expect(onProgress).toHaveBeenCalledTimes(2);
    });
  });

  // ── setPreviewScript ───────────────────────────────────────────────────

  describe('setPreviewScript()', () => {
    it('should send setPreviewScript RPC', async () => {
      const engine = await bootEngine();

      const scriptPromise = engine.setPreviewScript('console.log("injected")');

      await flushMicrotasks();
      autoRespondRPC(undefined);

      await scriptPromise;

      const rpcMsg = JSON.parse(capturedWs.sentMessages.filter((m) => typeof m === 'string').pop() as string);
      expect(rpcMsg.method).toBe('setPreviewScript');
      expect(rpcMsg.params).toEqual({ script: 'console.log("injected")' });
    });
  });

  // ── Binary frame encoding / decoding ───────────────────────────────────

  describe('binary frame protocol', () => {
    it('should round-trip encode/decode correctly', () => {
      const original = { processId: 'proc-abc', payload: 'hello world' };

      const buffer = encodeBinaryFrame(0x01, original.processId, original.payload);
      const decoded = decodeBinaryFrame(buffer);

      expect(decoded).toEqual(original);
    });

    it('should handle empty payload', () => {
      const buffer = encodeBinaryFrame(0x02, 'proc-1', '');
      const decoded = decodeBinaryFrame(buffer);

      expect(decoded.processId).toBe('proc-1');
      expect(decoded.payload).toBe('');
    });

    it('should handle unicode in payload', () => {
      const unicodePayload = '日本語テスト 🚀';
      const buffer = encodeBinaryFrame(0x01, 'proc-u', unicodePayload);
      const decoded = decodeBinaryFrame(buffer);

      expect(decoded.payload).toBe(unicodePayload);
    });

    it('should handle 36-char UUID process IDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const buffer = encodeBinaryFrame(0x01, uuid, 'data');
      const decoded = decodeBinaryFrame(buffer);

      expect(decoded.processId).toBe(uuid);
      expect(decoded.payload).toBe('data');
    });
  });

  // ── RPC timeout ────────────────────────────────────────────────────────

  describe('RPC timeout', () => {
    it('should reject with timeout error if server never responds', async () => {
      const engine = await bootEngine();

      const readPromise = engine.fs.readFile('/slow.txt', 'utf-8');

      // Advance past the RPC_TIMEOUT_MS (30_000)
      vi.advanceTimersByTime(31_000);

      await expect(readPromise).rejects.toThrow(/RPC timeout/);
    });
  });

  // ── Connection failure ─────────────────────────────────────────────────

  describe('connection failure', () => {
    let originalMock: typeof globalThis.WebSocket;

    beforeEach(() => {
      originalMock = globalThis.WebSocket;
    });

    afterEach(() => {
      // Always restore to prevent cascading failures
      globalThis.WebSocket = originalMock;
    });

    it('should reject boot() if the WebSocket fails to connect', async () => {
      vi.stubGlobal(
        'WebSocket',
        class FailingWebSocket {
          static CONNECTING = 0;
          static OPEN = 1;
          static CLOSING = 2;
          static CLOSED = 3;

          binaryType = 'blob';
          readyState = 0; // CONNECTING
          url: string;

          onopen: ((event: any) => void) | null = null;
          onmessage: ((event: any) => void) | null = null;
          onclose: ((event: any) => void) | null = null;
          onerror: ((event: any) => void) | null = null;

          sentMessages: any[] = [];

          constructor(url: string) {
            this.url = url;

            // Fire error on next microtask (no auto-open)
            queueMicrotask(() => {
              this.readyState = 3; // CLOSED
              this.onerror?.({ type: 'error' } as any);
            });
          }

          // eslint-disable-next-line @typescript-eslint/no-empty-function
          send() {}
          close() {
            this.readyState = 3;
          }
        } as any,
      );

      const engine = new DockerEngine('ws://unreachable:1234');

      await expect(engine.boot()).rejects.toThrow(/Failed to connect/);
    });
  });

  // ── Message handling edge cases ────────────────────────────────────────

  describe('message handling edge cases', () => {
    beforeEach(async () => {
      await bootEngine();
    });

    it('should silently ignore malformed JSON messages', () => {
      expect(() => {
        capturedWs.onmessage?.({ data: 'not valid json{{{' } as any);
      }).not.toThrow();
    });

    it('should silently ignore responses for unknown request IDs', () => {
      expect(() => {
        capturedWs.receiveJSON({ id: 99999, result: 'orphaned' });
      }).not.toThrow();
    });

    it('should silently ignore unknown server events', () => {
      expect(() => {
        capturedWs.receiveJSON({ event: 'totally-unknown-event', data: {} });
      }).not.toThrow();
    });
  });
});
