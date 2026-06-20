import type { EngineType, RuntimeEngine } from './runtime-engine';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('EngineFactory');

/**
 * Create a RuntimeEngine instance based on the configured type.
 *
 * Resolution order:
 *   1. Explicit `type` parameter
 *   2. `VITE_RUNTIME_ENGINE` env variable
 *   3. Default: 'webcontainer'
 */
export async function createEngine(type?: EngineType): Promise<RuntimeEngine> {
  const engineType: EngineType =
    type ?? (import.meta.env.VITE_RUNTIME_ENGINE as EngineType | undefined) ?? 'webcontainer';

  logger.info(`Creating runtime engine: ${engineType}`);

  switch (engineType) {
    case 'docker': {
      const wsUrl = import.meta.env.VITE_RUNTIME_WS_URL || 'ws://localhost:3001';
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { DockerEngine } = await import('./engines/docker-engine');
      const engine = new DockerEngine(wsUrl);
      await engine.boot();

      return engine;
    }

    case 'webcontainer':
    default: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { WebContainerEngine } = await import('./engines/webcontainer-engine');
      const engine = new WebContainerEngine();
      await engine.boot();

      return engine;
    }
  }
}
