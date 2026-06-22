/**
 * Fetch with timeout support. Automatically aborts if the request takes too long.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = 30000, ...fetchInit } = init ?? {};
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...fetchInit,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
