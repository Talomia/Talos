import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createSecurityHeaders,
  checkRateLimit,
  withSecurity,
  validateApiKeyFormat,
  sanitizeErrorMessage,
} from '~/lib/security';

// Suppress logger output during tests
vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

/**
 * Helper to build a minimal Request with an IP header.
 */
function makeRequest(url: string, ip = '127.0.0.1', method = 'GET'): Request {
  return new Request(url, {
    method,
    headers: { 'x-forwarded-for': ip },
  });
}

describe('security', () => {
  describe('createSecurityHeaders', () => {
    it('should include X-Frame-Options DENY', () => {
      const headers = createSecurityHeaders();
      expect(headers['X-Frame-Options']).toBe('DENY');
    });

    it('should include X-Content-Type-Options nosniff', () => {
      const headers = createSecurityHeaders();
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
    });

    it('should include X-XSS-Protection', () => {
      const headers = createSecurityHeaders();
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
    });

    it('should include a Content-Security-Policy header', () => {
      const headers = createSecurityHeaders();
      const csp = headers['Content-Security-Policy'];

      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
    });

    it('should include Referrer-Policy strict-origin-when-cross-origin', () => {
      const headers = createSecurityHeaders();
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    });

    it('should include a Permissions-Policy header', () => {
      const headers = createSecurityHeaders();
      expect(headers['Permissions-Policy']).toContain('camera=()');
      expect(headers['Permissions-Policy']).toContain('microphone=()');
    });
  });

  describe('checkRateLimit', () => {
    beforeEach(() => {
      // Reset the in-memory rate limit store between tests by advancing time
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should allow requests below the threshold', () => {
      const req = makeRequest('http://localhost/api/chat', '10.0.0.1');
      const result = checkRateLimit(req, '/api/chat');

      expect(result.allowed).toBe(true);
    });

    it('should block after exceeding the threshold', () => {
      const ip = '10.0.0.2';

      // /api/chat allows 10 requests per 60s
      for (let i = 0; i < 10; i++) {
        const req = makeRequest('http://localhost/api/chat', ip);
        const result = checkRateLimit(req, '/api/chat');
        expect(result.allowed).toBe(true);
      }

      // The 11th request should be blocked
      const req = makeRequest('http://localhost/api/chat', ip);
      const result = checkRateLimit(req, '/api/chat');

      expect(result.allowed).toBe(false);
      expect(result.resetTime).toBeDefined();
    });

    it('should allow requests from different IPs independently', () => {
      // Exhaust limit for IP-A
      for (let i = 0; i < 10; i++) {
        checkRateLimit(makeRequest('http://localhost/api/chat', '10.0.0.10'), '/api/chat');
      }

      // IP-B should still be allowed
      const result = checkRateLimit(makeRequest('http://localhost/api/chat', '10.0.0.11'), '/api/chat');
      expect(result.allowed).toBe(true);
    });

    it('should reset after the window expires', () => {
      const ip = '10.0.0.3';

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        checkRateLimit(makeRequest('http://localhost/api/chat', ip), '/api/chat');
      }

      // Blocked
      expect(checkRateLimit(makeRequest('http://localhost/api/chat', ip), '/api/chat').allowed).toBe(false);

      /*
       * The cleanup condition is `resetTime < now - windowMs`.
       * Since resetTime = creationTime + 60s, we need now > resetTime + 60s → advance > 120s.
       */
      vi.advanceTimersByTime(121_000);

      // Should be allowed again
      const result = checkRateLimit(makeRequest('http://localhost/api/chat', ip), '/api/chat');
      expect(result.allowed).toBe(true);
    });

    it('should allow endpoints with no matching rule', () => {
      const result = checkRateLimit(makeRequest('http://localhost/health'), '/health');
      expect(result.allowed).toBe(true);
    });
  });

  describe('validateApiKeyFormat', () => {
    it('should reject empty strings', () => {
      expect(validateApiKeyFormat('', 'openai')).toBe(false);
    });

    it('should reject placeholder keys', () => {
      expect(validateApiKeyFormat('your_api_key_here', 'openai')).toBe(false);
    });

    it('should reject keys shorter than provider minimum', () => {
      expect(validateApiKeyFormat('short', 'anthropic')).toBe(false);
    });

    it('should accept valid-length keys', () => {
      const longKey = 'sk-' + 'a'.repeat(60);
      expect(validateApiKeyFormat(longKey, 'openai')).toBe(true);
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should return full error in development mode', () => {
      const error = new Error('Detailed error with API key info');
      expect(sanitizeErrorMessage(error, true)).toBe('Detailed error with API key info');
    });

    it('should hide API key errors in production', () => {
      const error = new Error('Invalid API key provided');
      expect(sanitizeErrorMessage(error, false)).toBe('Authentication failed');
    });

    it('should return generic message for unknown errors in production', () => {
      const error = new Error('Some internal failure');
      expect(sanitizeErrorMessage(error, false)).toBe('An unexpected error occurred');
    });

    it('should handle rate limit errors', () => {
      const error = new Error('rate limit exceeded');
      expect(sanitizeErrorMessage(error, false)).toBe('Rate limit exceeded. Please try again later.');
    });
  });

  describe('withSecurity', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should block disallowed methods', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('ok'));
      const secured = withSecurity(handler, { allowedMethods: ['POST'] });

      const request = makeRequest('http://localhost/api/chat', '10.0.0.50', 'GET');
      const response = await secured({ request, params: {}, context: {} } as Parameters<typeof secured>[0]);

      expect(response.status).toBe(405);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should add security headers to the response', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('ok'));
      const secured = withSecurity(handler, { rateLimit: false });

      const request = makeRequest('http://localhost/api/test', '10.0.0.60');
      const response = await secured({ request, params: {}, context: {} } as Parameters<typeof secured>[0]);

      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('should return 429 when rate limit is exceeded', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('ok'));
      const secured = withSecurity(handler, { rateLimit: true });
      const ip = '10.0.0.70';

      // Exhaust the /api/chat limit (10 requests)
      for (let i = 0; i < 10; i++) {
        const request = makeRequest('http://localhost/api/chat', ip);
        await secured({ request, params: {}, context: {} } as Parameters<typeof secured>[0]);
      }

      // The next request should be rate-limited
      const request = makeRequest('http://localhost/api/chat', ip);
      const response = await secured({ request, params: {}, context: {} } as Parameters<typeof secured>[0]);

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBeDefined();
    });

    it('should return 500 with sanitized error when handler throws', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Internal DB failure'));
      const secured = withSecurity(handler, { rateLimit: false });

      const request = makeRequest('http://localhost/api/test', '10.0.0.80');
      const response = await secured({ request, params: {}, context: {} } as Parameters<typeof secured>[0]);

      expect(response.status).toBe(500);

      const body = (await response.json()) as { error: boolean };
      expect(body.error).toBe(true);
    });
  });
});
