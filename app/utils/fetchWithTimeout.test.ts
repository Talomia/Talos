import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout, fetchWithRetry } from './fetchWithTimeout';

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns response on successful fetch', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const response = await fetchWithTimeout('https://example.com');

    expect(response.status).toBe(200);
  });

  it('passes through fetch options', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(mockResponse);
    vi.stubGlobal('fetch', fetchMock);

    await fetchWithTimeout('https://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
  });

  it('aborts on timeout', async () => {
    // Use a very short timeout so the test completes quickly
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: any) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWithTimeout('https://example.com', { timeoutMs: 50 })).rejects.toThrow();
  }, 10000);
});

describe('fetchWithRetry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns on first success', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const response = await fetchWithRetry('https://example.com', {
      maxRetries: 3,
      baseDelayMs: 10,
    });

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry 4xx errors', async () => {
    const mockResponse = new Response('not found', { status: 404 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const response = await fetchWithRetry('https://example.com', {
      maxRetries: 3,
      baseDelayMs: 10,
    });

    expect(response.status).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('error', { status: 500 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchWithRetry('https://example.com', {
      maxRetries: 3,
      baseDelayMs: 10,
    });

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after max retries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 503 })));

    const response = await fetchWithRetry('https://example.com', {
      maxRetries: 2,
      baseDelayMs: 10,
    });

    expect(response.status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('rethrows AbortError without retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));

    await expect(fetchWithRetry('https://example.com', { maxRetries: 3, baseDelayMs: 10 })).rejects.toThrow('Aborted');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on network errors', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchWithRetry('https://example.com', {
      maxRetries: 3,
      baseDelayMs: 10,
    });

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
