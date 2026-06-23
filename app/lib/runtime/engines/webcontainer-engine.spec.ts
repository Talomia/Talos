import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock dependencies ──────────────────────────────────────────────────────

vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('~/utils/constants', () => ({
  WORK_DIR_NAME: 'project',
}));

// ─── Mock WebContainer ──────────────────────────────────────────────────────

function createMockWebContainer() {
  const mockFs = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    readdir: vi.fn(),
    rm: vi.fn(),
  };

  const mockInternal = {
    textSearch: vi.fn().mockResolvedValue(undefined),
    watchPaths: vi.fn().mockReturnValue(vi.fn()),
  };

  const mockInstance = {
    workdir: '/home/project',
    fs: mockFs,
    internal: mockInternal,
    spawn: vi.fn(),
    on: vi.fn(),
    setPreviewScript: vi.fn().mockResolvedValue(undefined),
    teardown: vi.fn(),
  };

  return { mockInstance, mockFs, mockInternal };
}

let currentMockInstance: ReturnType<typeof createMockWebContainer>['mockInstance'];

vi.mock('@webcontainer/api', () => ({
  WebContainer: {
    boot: vi.fn().mockImplementation(async () => currentMockInstance),
  },
}));

// ─── Import AFTER mocks ─────────────────────────────────────────────────────

import { WebContainerEngine } from './webcontainer-engine';
import { WebContainer } from '@webcontainer/api';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WebContainerEngine', () => {
  let engine: WebContainerEngine;
  let mockFs: ReturnType<typeof createMockWebContainer>['mockFs'];
  let mockInternal: ReturnType<typeof createMockWebContainer>['mockInternal'];
  let mockInstance: ReturnType<typeof createMockWebContainer>['mockInstance'];

  beforeEach(async () => {
    const mocks = createMockWebContainer();
    mockInstance = mocks.mockInstance;
    mockFs = mocks.mockFs;
    mockInternal = mocks.mockInternal;
    currentMockInstance = mockInstance;

    engine = new WebContainerEngine();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Boot ───────────────────────────────────────────────────────────────

  describe('boot()', () => {
    it('should call WebContainer.boot() with correct options', async () => {
      await engine.boot();

      expect(WebContainer.boot).toHaveBeenCalledWith({
        coep: 'credentialless',
        workdirName: 'project',
        forwardPreviewErrors: true,
      });
    });

    it('should expose workdir after booting', async () => {
      await engine.boot();

      expect(engine.workdir).toBe('/home/project');
    });

    it('should expose fs after booting', async () => {
      await engine.boot();

      expect(engine.fs).toBeDefined();
    });

    it('should expose rawInstance after booting', async () => {
      await engine.boot();

      expect(engine.rawInstance).toBe(mockInstance);
    });
  });

  // ── Pre-boot guards ───────────────────────────────────────────────────

  describe('pre-boot guards', () => {
    it('should throw when accessing workdir before boot', () => {
      expect(() => engine.workdir).toThrow('WebContainerEngine not booted');
    });

    it('should throw when accessing fs before boot', () => {
      expect(() => engine.fs).toThrow('WebContainerEngine not booted');
    });

    it('should throw when calling spawn before boot', async () => {
      await expect(engine.spawn('ls', [])).rejects.toThrow('WebContainerEngine not booted');
    });

    it('should throw when calling on() before boot', () => {
      expect(() => engine.on('server-ready', vi.fn())).toThrow('WebContainerEngine not booted');
    });

    it('should throw when calling setPreviewScript before boot', async () => {
      await expect(engine.setPreviewScript('code')).rejects.toThrow('WebContainerEngine not booted');
    });

    it('should throw when calling textSearch before boot', async () => {
      await expect(engine.textSearch('q', {}, vi.fn())).rejects.toThrow('WebContainerEngine not booted');
    });

    it('should throw when calling watchPaths before boot', async () => {
      await expect(engine.watchPaths({ include: [], exclude: [] }, vi.fn())).rejects.toThrow(
        'WebContainerEngine not booted',
      );
    });
  });

  // ── Teardown ──────────────────────────────────────────────────────────

  describe('teardown()', () => {
    it('should call teardown on the underlying WebContainer', async () => {
      await engine.boot();
      await engine.teardown();

      expect(mockInstance.teardown).toHaveBeenCalledOnce();
    });

    it('should nullify instance and fs after teardown', async () => {
      await engine.boot();
      await engine.teardown();

      expect(engine.rawInstance).toBeNull();
      expect(() => engine.fs).toThrow('WebContainerEngine not booted');
      expect(() => engine.workdir).toThrow('WebContainerEngine not booted');
    });

    it('should be safe to call teardown without booting', async () => {
      await expect(engine.teardown()).resolves.not.toThrow();
    });
  });

  // ── Filesystem: readFile ──────────────────────────────────────────────

  describe('fs.readFile()', () => {
    beforeEach(async () => {
      await engine.boot();
    });

    it('should delegate readFile with encoding to WebContainer.fs', async () => {
      mockFs.readFile.mockResolvedValue('file contents');

      const result = await engine.fs.readFile('/app/index.ts', 'utf-8');

      expect(result).toBe('file contents');
      expect(mockFs.readFile).toHaveBeenCalledWith('/app/index.ts', 'utf-8');
    });

    it('should delegate readFile without encoding to WebContainer.fs', async () => {
      const bytes = new Uint8Array([1, 2, 3]);
      mockFs.readFile.mockResolvedValue(bytes);

      const result = await engine.fs.readFile('/image.png');

      expect(result).toBe(bytes);
      expect(mockFs.readFile).toHaveBeenCalledWith('/image.png');
    });
  });

  // ── Filesystem: writeFile ─────────────────────────────────────────────

  describe('fs.writeFile()', () => {
    beforeEach(async () => {
      await engine.boot();
    });

    it('should delegate writeFile with encoding', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      await engine.fs.writeFile('/test.txt', 'hello', 'utf-8');

      expect(mockFs.writeFile).toHaveBeenCalledWith('/test.txt', 'hello', 'utf-8');
    });

    it('should delegate writeFile without encoding', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      await engine.fs.writeFile('/test.txt', 'hello');

      expect(mockFs.writeFile).toHaveBeenCalledWith('/test.txt', 'hello');
    });

    it('should delegate writeFile with Uint8Array', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      const bytes = new Uint8Array([65, 66]);

      await engine.fs.writeFile('/bin.dat', bytes);

      expect(mockFs.writeFile).toHaveBeenCalledWith('/bin.dat', bytes);
    });
  });

  // ── Filesystem: mkdir ─────────────────────────────────────────────────

  describe('fs.mkdir()', () => {
    beforeEach(async () => {
      await engine.boot();
    });

    it('should delegate mkdir with recursive option', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);

      await engine.fs.mkdir('/src/components', { recursive: true });

      expect(mockFs.mkdir).toHaveBeenCalledWith('/src/components', { recursive: true });
    });

    it('should delegate mkdir without options', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);

      await engine.fs.mkdir('/src');

      expect(mockFs.mkdir).toHaveBeenCalledWith('/src');
    });
  });

  // ── Filesystem: readdir ───────────────────────────────────────────────

  describe('fs.readdir()', () => {
    beforeEach(async () => {
      await engine.boot();
    });

    it('should return string[] without options', async () => {
      mockFs.readdir.mockResolvedValue(['a.ts', 'b.ts']);

      const result = await engine.fs.readdir('/src');

      expect(result).toEqual(['a.ts', 'b.ts']);
      expect(mockFs.readdir).toHaveBeenCalledWith('/src');
    });

    it('should return DirEntry[] with withFileTypes option', async () => {
      const mockEntries = [
        { name: 'index.ts', isFile: () => true, isDirectory: () => false },
        { name: 'lib', isFile: () => false, isDirectory: () => true },
      ];
      mockFs.readdir.mockResolvedValue(mockEntries);

      const result = await engine.fs.readdir('/src', { withFileTypes: true });

      expect(result).toEqual(mockEntries);
      expect(mockFs.readdir).toHaveBeenCalledWith('/src', { withFileTypes: true });
    });
  });

  // ── Filesystem: rm ────────────────────────────────────────────────────

  describe('fs.rm()', () => {
    beforeEach(async () => {
      await engine.boot();
    });

    it('should delegate rm with recursive option', async () => {
      mockFs.rm.mockResolvedValue(undefined);

      await engine.fs.rm('/tmp/old', { recursive: true });

      expect(mockFs.rm).toHaveBeenCalledWith('/tmp/old', { recursive: true });
    });

    it('should delegate rm without options', async () => {
      mockFs.rm.mockResolvedValue(undefined);

      await engine.fs.rm('/file.txt');

      expect(mockFs.rm).toHaveBeenCalledWith('/file.txt', undefined);
    });
  });

  // ── Spawn ─────────────────────────────────────────────────────────────

  describe('spawn()', () => {
    beforeEach(async () => {
      await engine.boot();
    });

    it('should delegate to WebContainer.spawn and wrap in adapter', async () => {
      const mockProcess = {
        input: new WritableStream(),
        output: new ReadableStream(),
        exit: Promise.resolve(0),
        resize: vi.fn(),
        kill: vi.fn(),
      };
      mockInstance.spawn.mockResolvedValue(mockProcess);

      const proc = await engine.spawn('npm', ['install']);

      expect(mockInstance.spawn).toHaveBeenCalledWith('npm', ['install'], {});
      expect(proc.input).toBe(mockProcess.input);
      expect(proc.output).toBe(mockProcess.output);
    });

    it('should pass terminal option through', async () => {
      const mockProcess = {
        input: new WritableStream(),
        output: new ReadableStream(),
        exit: Promise.resolve(0),
        resize: vi.fn(),
        kill: vi.fn(),
      };
      mockInstance.spawn.mockResolvedValue(mockProcess);

      await engine.spawn('bash', [], { terminal: { cols: 80, rows: 24 } });

      expect(mockInstance.spawn).toHaveBeenCalledWith('bash', [], {
        terminal: { cols: 80, rows: 24 },
      });
    });

    it('should pass env and cwd options through', async () => {
      const mockProcess = {
        input: new WritableStream(),
        output: new ReadableStream(),
        exit: Promise.resolve(0),
        resize: vi.fn(),
        kill: vi.fn(),
      };
      mockInstance.spawn.mockResolvedValue(mockProcess);

      await engine.spawn('node', ['app.js'], {
        env: { NODE_ENV: 'production' },
        cwd: '/app',
      });

      expect(mockInstance.spawn).toHaveBeenCalledWith('node', ['app.js'], {
        env: { NODE_ENV: 'production' },
        cwd: '/app',
      });
    });

    it('should delegate resize() to the underlying process', async () => {
      const mockProcess = {
        input: new WritableStream(),
        output: new ReadableStream(),
        exit: Promise.resolve(0),
        resize: vi.fn(),
        kill: vi.fn(),
      };
      mockInstance.spawn.mockResolvedValue(mockProcess);

      const proc = await engine.spawn('bash', []);

      proc.resize({ cols: 120, rows: 40 });

      expect(mockProcess.resize).toHaveBeenCalledWith({ cols: 120, rows: 40 });
    });

    it('should delegate kill() to the underlying process', async () => {
      const mockProcess = {
        input: new WritableStream(),
        output: new ReadableStream(),
        exit: Promise.resolve(0),
        resize: vi.fn(),
        kill: vi.fn(),
      };
      mockInstance.spawn.mockResolvedValue(mockProcess);

      const proc = await engine.spawn('node', ['server.js']);

      proc.kill();

      expect(mockProcess.kill).toHaveBeenCalledOnce();
    });

    it('should delegate exit promise to the underlying process', async () => {
      const mockProcess = {
        input: new WritableStream(),
        output: new ReadableStream(),
        exit: Promise.resolve(42),
        resize: vi.fn(),
        kill: vi.fn(),
      };
      mockInstance.spawn.mockResolvedValue(mockProcess);

      const proc = await engine.spawn('node', ['app.js']);
      const code = await proc.exit;

      expect(code).toBe(42);
    });
  });

  // ── Events ────────────────────────────────────────────────────────────

  describe('on()', () => {
    beforeEach(async () => {
      await engine.boot();
    });

    it('should forward server-ready events to WebContainer.on', () => {
      const callback = vi.fn();

      engine.on('server-ready', callback);

      expect(mockInstance.on).toHaveBeenCalledWith('server-ready', expect.any(Function));
    });

    it('should forward port events to WebContainer.on', () => {
      const callback = vi.fn();

      engine.on('port', callback);

      expect(mockInstance.on).toHaveBeenCalledWith('port', expect.any(Function));
    });

    it('should forward preview-message events to WebContainer.on', () => {
      const callback = vi.fn();

      engine.on('preview-message', callback);

      expect(mockInstance.on).toHaveBeenCalledWith('preview-message', expect.any(Function));
    });
  });

  // ── Preview ───────────────────────────────────────────────────────────

  describe('setPreviewScript()', () => {
    beforeEach(async () => {
      await engine.boot();
    });

    it('should delegate to WebContainer.setPreviewScript', async () => {
      await engine.setPreviewScript('console.log("injected")');

      expect(mockInstance.setPreviewScript).toHaveBeenCalledWith('console.log("injected")');
    });
  });

  describe('getPreviewUrl()', () => {
    it('should return WebContainer preview URL format', () => {
      const engine = new WebContainerEngine();

      expect(engine.getPreviewUrl(3000)).toBe('https://3000.local-credentialless.webcontainer-api.io');
      expect(engine.getPreviewUrl(8080)).toBe('https://8080.local-credentialless.webcontainer-api.io');
    });
  });

  // ── Text Search ───────────────────────────────────────────────────────

  describe('textSearch()', () => {
    beforeEach(async () => {
      await engine.boot();
    });

    it('should delegate to WebContainer.internal.textSearch', async () => {
      const onProgress = vi.fn();

      await engine.textSearch('query', {}, onProgress);

      expect(mockInternal.textSearch).toHaveBeenCalledWith('query', {}, onProgress);
    });

    it('should pass include and exclude options', async () => {
      const onProgress = vi.fn();

      await engine.textSearch('TODO', { include: '*.ts', exclude: 'node_modules', followSymlinks: false }, onProgress);

      expect(mockInternal.textSearch).toHaveBeenCalledWith(
        'TODO',
        { include: '*.ts', exclude: 'node_modules', followSymlinks: false },
        onProgress,
      );
    });

    it('should not pass undefined include/exclude', async () => {
      const onProgress = vi.fn();

      await engine.textSearch('test', {}, onProgress);

      const calledOptions = mockInternal.textSearch.mock.calls[0][1];

      // The engine filters out undefined fields
      expect(calledOptions).not.toHaveProperty('include');
      expect(calledOptions).not.toHaveProperty('exclude');
    });
  });

  // ── Watch ─────────────────────────────────────────────────────────────

  describe('watchPaths()', () => {
    beforeEach(async () => {
      await engine.boot();
    });

    it('should delegate to WebContainer.internal.watchPaths', async () => {
      const callback = vi.fn();

      await engine.watchPaths({ include: ['**/*.ts'], exclude: ['node_modules/**'] }, callback);

      expect(mockInternal.watchPaths).toHaveBeenCalledWith(
        { include: ['**/*.ts'], exclude: ['node_modules/**'], includeContent: undefined },
        callback,
      );
    });

    it('should return the unsubscribe function from the internal watcher', async () => {
      const unsub = vi.fn();
      mockInternal.watchPaths.mockReturnValue(unsub);

      const callback = vi.fn();
      const result = await engine.watchPaths({ include: ['**/*'], exclude: [] }, callback);

      expect(result).toBe(unsub);
    });

    it('should pass includeContent option through', async () => {
      const callback = vi.fn();

      await engine.watchPaths({ include: ['**/*'], exclude: [], includeContent: true }, callback);

      expect(mockInternal.watchPaths).toHaveBeenCalledWith(expect.objectContaining({ includeContent: true }), callback);
    });
  });

  // ── rawInstance ────────────────────────────────────────────────────────

  describe('rawInstance', () => {
    it('should be null before boot', () => {
      expect(engine.rawInstance).toBeNull();
    });

    it('should reference the WebContainer after boot', async () => {
      await engine.boot();

      expect(engine.rawInstance).toBe(mockInstance);
    });

    it('should be null after teardown', async () => {
      await engine.boot();
      await engine.teardown();

      expect(engine.rawInstance).toBeNull();
    });
  });
});
