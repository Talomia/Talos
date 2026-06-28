import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('sampler');

/**
 * Creates a function that samples calls at regular intervals and captures trailing calls.
 * - Drops calls that occur between sampling intervals
 * - Takes one call per sampling interval if available
 * - Captures the last call if no call was made during the interval
 *
 * @param fn The function to sample
 * @param sampleInterval How often to sample calls (in ms)
 * @returns The sampled function
 */
export function createSampler<T extends (...args: any[]) => any>(
  fn: T,
  sampleInterval: number,
): T & { cancel: () => void } {
  let lastArgs: Parameters<T> | null = null;
  let lastTime = 0;
  let timeout: NodeJS.Timeout | null = null;

  // Create a function with the same type as the input function
  const sampled = function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    lastArgs = args;

    // If we're within the sample interval, just store the args
    if (now - lastTime < sampleInterval) {
      // Set up trailing call if not already set
      if (!timeout) {
        timeout = setTimeout(
          () => {
            timeout = null;
            lastTime = Date.now();

            if (lastArgs) {
              try {
                const result = fn.apply(this, lastArgs);

                // Catch errors from async functions
                if (result && typeof result.catch === 'function') {
                  result.catch((err: unknown) => {
                    logger.error('Sampler trailing call error:', err);
                  });
                }
              } catch (err) {
                logger.error('Sampler trailing call error:', err);
              }

              lastArgs = null;
            }
          },
          sampleInterval - (now - lastTime),
        );
      }

      return;
    }

    // If we're outside the interval, execute immediately
    lastTime = now;

    try {
      const result = fn.apply(this, args);

      // Catch errors from async functions
      if (result && typeof result.catch === 'function') {
        result.catch((err: unknown) => {
          logger.error('Sampler immediate call error:', err);
        });
      }
    } catch (err) {
      logger.error('Sampler immediate call error:', err);
    }

    lastArgs = null;
  } as T & { cancel: () => void };

  sampled.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }

    lastArgs = null;
  };

  return sampled;
}
