import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockWebContainerEngine = {
  boot: vi.fn().mockResolvedValue(undefined),
  teardown: vi.fn().mockResolvedValue(undefined),
  workdir: '/home/project',
  fs: {},
};

const mockDockerEngine = {
  boot: vi.fn().mockResolvedValue(undefined),
  teardown: vi.fn().mockResolvedValue(undefined),
  workdir: '/home/user/project',
  fs: {},
};

vi.mock('./engines/webcontainer-engine', () => ({
  WebContainerEngine: vi.fn().mockImplementation(() => mockWebContainerEngine),
}));

vi.mock('./engines/docker-engine', () => ({
  DockerEngine: vi.fn().mockImplementation(() => mockDockerEngine),
}));

vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createEngine', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Snapshot env vars that the factory reads
    originalEnv = {
      VITE_RUNTIME_ENGINE: import.meta.env.VITE_RUNTIME_ENGINE,
      VITE_RUNTIME_WS_URL: import.meta.env.VITE_RUNTIME_WS_URL,
    };
  });

  afterEach(() => {
    // Restore env vars
    import.meta.env.VITE_RUNTIME_ENGINE = originalEnv.VITE_RUNTIME_ENGINE;
    import.meta.env.VITE_RUNTIME_WS_URL = originalEnv.VITE_RUNTIME_WS_URL;
  });

  // Helper: dynamically import the factory so env-var overrides take effect
  async function loadCreateEngine() {
    const mod = await import('./engine-factory');
    return mod.createEngine;
  }

  // ── Default engine type ──────────────────────────────────────────────────

  describe('default engine type', () => {
    it('should create a WebContainerEngine when no type is specified and env var is unset', async () => {
      delete import.meta.env.VITE_RUNTIME_ENGINE;

      const createEngine = await loadCreateEngine();
      const engine = await createEngine();

      expect(engine).toBe(mockWebContainerEngine);
      expect(mockWebContainerEngine.boot).toHaveBeenCalledOnce();
    });

    it('should boot the engine before returning it', async () => {
      delete import.meta.env.VITE_RUNTIME_ENGINE;

      const createEngine = await loadCreateEngine();
      await createEngine();

      expect(mockWebContainerEngine.boot).toHaveBeenCalledTimes(1);
    });
  });

  // ── Explicit type parameter ──────────────────────────────────────────────

  describe('explicit type parameter', () => {
    it('should create a WebContainerEngine when type is "webcontainer"', async () => {
      const createEngine = await loadCreateEngine();
      const engine = await createEngine('webcontainer');

      expect(engine).toBe(mockWebContainerEngine);
      expect(mockWebContainerEngine.boot).toHaveBeenCalledOnce();
    });

    it('should create a DockerEngine when type is "docker"', async () => {
      const createEngine = await loadCreateEngine();
      const engine = await createEngine('docker');

      expect(engine).toBe(mockDockerEngine);
      expect(mockDockerEngine.boot).toHaveBeenCalledOnce();
    });

    it('should prefer explicit type over env var', async () => {
      import.meta.env.VITE_RUNTIME_ENGINE = 'docker';

      const createEngine = await loadCreateEngine();
      const engine = await createEngine('webcontainer');

      expect(engine).toBe(mockWebContainerEngine);
    });
  });

  // ── Env var resolution ───────────────────────────────────────────────────

  describe('env var resolution', () => {
    it('should use VITE_RUNTIME_ENGINE when no explicit type is provided', async () => {
      import.meta.env.VITE_RUNTIME_ENGINE = 'docker';

      const createEngine = await loadCreateEngine();
      const engine = await createEngine();

      expect(engine).toBe(mockDockerEngine);
      expect(mockDockerEngine.boot).toHaveBeenCalledOnce();
    });

    it('should use VITE_RUNTIME_WS_URL for docker engine WS address', async () => {
      import.meta.env.VITE_RUNTIME_WS_URL = 'ws://custom-host:9999';

      const createEngine = await loadCreateEngine();
      await createEngine('docker');

      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { DockerEngine } = await import('./engines/docker-engine');

      expect(DockerEngine).toHaveBeenCalledWith('ws://custom-host:9999');
    });

    it('should fall back to ws://localhost:3001 when VITE_RUNTIME_WS_URL is unset', async () => {
      delete import.meta.env.VITE_RUNTIME_WS_URL;

      const createEngine = await loadCreateEngine();
      await createEngine('docker');

      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { DockerEngine } = await import('./engines/docker-engine');

      expect(DockerEngine).toHaveBeenCalledWith('ws://localhost:3001');
    });
  });

  // ── Invalid / unknown engine type ────────────────────────────────────────

  describe('invalid engine type', () => {
    it('should fall back to webcontainer for an unknown engine type', async () => {
      const createEngine = await loadCreateEngine();

      // Cast to bypass TS — simulates a misconfigured env var
      const engine = await createEngine('unknown_engine' as any);

      expect(engine).toBe(mockWebContainerEngine);
      expect(mockWebContainerEngine.boot).toHaveBeenCalledOnce();
    });
  });

  // ── Boot failure propagation ─────────────────────────────────────────────

  describe('boot failure', () => {
    it('should propagate errors when boot() rejects', async () => {
      mockWebContainerEngine.boot.mockRejectedValueOnce(new Error('Boot failed'));

      const createEngine = await loadCreateEngine();

      await expect(createEngine('webcontainer')).rejects.toThrow('Boot failed');
    });

    it('should propagate errors when docker boot() rejects', async () => {
      mockDockerEngine.boot.mockRejectedValueOnce(new Error('Docker boot failed'));

      const createEngine = await loadCreateEngine();

      await expect(createEngine('docker')).rejects.toThrow('Docker boot failed');
    });
  });
});
