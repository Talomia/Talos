/**
 * Fetch with timeout support. Automatically aborts if the request takes too long.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = 30000, signal: callerSignal, ...fetchInit } = init ?? {};
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    timeoutMs,
  );

  // Merge caller's signal with timeout signal if both exist
  const mergedSignal =
    callerSignal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([controller.signal, callerSignal])
      : controller.signal;

  // If we can't merge signals, at least propagate caller's abort to our controller
  if (callerSignal && typeof AbortSignal.any !== 'function') {
    callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), { once: true });
  }

  try {
    const response = await fetch(input, {
      ...fetchInit,
      signal: mergedSignal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch with automatic retry and exponential backoff.
 * Useful for flaky external APIs (LLM providers, deployment services).
 *
 * Only retries on network errors and 5xx responses.
 * Does NOT retry 4xx errors (client errors).
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number; maxRetries?: number; baseDelayMs?: number },
): Promise<Response> {
  const { maxRetries = 3, baseDelayMs = 1000, ...fetchOpts } = init ?? {};

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(input, fetchOpts);

      // Don't retry client errors (4xx), only server errors (5xx)
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // 5xx — retry with backoff
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));

        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      // AbortError from user signal — don't retry
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));

        continue;
      }
    }
  }

  throw lastError;
}
