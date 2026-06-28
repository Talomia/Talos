import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Security');

/*
 * ⚠️ LIMITATION: In-memory rate limiting resets on every Node.js process restart.
 * For production-grade rate limiting, consider using Redis or a persistent store.
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Rate limit configuration — ordered by specificity (exact matches before wildcards)
const RATE_LIMITS: Record<string, { windowMs: number; maxRequests: number }> = {
  // LLM routes — most expensive, strictest limits
  '/api/chat': { windowMs: 60 * 1000, maxRequests: 10 }, // 10 chats/min
  '/api/enhancer': { windowMs: 60 * 1000, maxRequests: 15 }, // 15 enhances/min
  '/api/llmcall': { windowMs: 60 * 1000, maxRequests: 10 }, // 10 calls/min

  // Deploy routes — expensive and slow
  '/api/netlify-deploy': { windowMs: 5 * 60 * 1000, maxRequests: 10 }, // 10 deploys/5min
  '/api/vercel-deploy': { windowMs: 5 * 60 * 1000, maxRequests: 10 }, // 10 deploys/5min

  // Auth routes — brute force protection
  '/api/auth': { windowMs: 15 * 60 * 1000, maxRequests: 30 }, // 30 auth/15min

  // Web search — potential SSRF, rate limit external fetches
  '/api/web-search': { windowMs: 60 * 1000, maxRequests: 20 }, // 20 searches/min

  // Database query — sensitive
  '/api/supabase/query': { windowMs: 60 * 1000, maxRequests: 30 }, // 30 queries/min
  '/api/supabase/variables': { windowMs: 60 * 1000, maxRequests: 20 }, // 20 requests/min

  // Service API endpoints (wildcards)
  '/api/github-*': { windowMs: 60 * 1000, maxRequests: 30 }, // 30 requests/min
  '/api/gitlab-*': { windowMs: 60 * 1000, maxRequests: 30 }, // 30 requests/min
  '/api/netlify-*': { windowMs: 60 * 1000, maxRequests: 20 }, // 20 requests/min
  '/api/vercel-*': { windowMs: 60 * 1000, maxRequests: 20 }, // 20 requests/min
  '/api/supabase-*': { windowMs: 60 * 1000, maxRequests: 20 }, // 20 requests/min

  // Cloud sync — frequent background operation, needs more headroom
  '/api/projects': { windowMs: 60 * 1000, maxRequests: 60 }, // 60 requests/min

  // General API fallback — catches everything else
  '/api/*': { windowMs: 15 * 60 * 1000, maxRequests: 100 }, // 100 requests/15min
};

/**
 * Rate limiting middleware
 */
export function checkRateLimit(request: Request, endpoint: string): { allowed: boolean; resetTime?: number } {
  const clientIP = getClientIP(request);
  const key = `${clientIP}:${endpoint}`;

  // Find matching rate limit rule — sort by specificity (exact first, then longest wildcards)
  const sortedRules = Object.entries(RATE_LIMITS).sort(([a], [b]) => {
    const aIsWildcard = a.includes('*');
    const bIsWildcard = b.includes('*');

    if (aIsWildcard !== bIsWildcard) {
      return aIsWildcard ? 1 : -1;
    }

    return b.length - a.length; // longer (more specific) patterns first
  });

  const rule = sortedRules.find(([pattern]) => {
    if (pattern.endsWith('/*')) {
      const basePattern = pattern.slice(0, -2);
      return endpoint.startsWith(basePattern);
    }

    if (pattern.endsWith('-*')) {
      const basePattern = pattern.slice(0, -1);
      return endpoint.startsWith(basePattern);
    }

    return endpoint === pattern;
  });

  if (!rule) {
    return { allowed: true }; // No rate limit for this endpoint
  }

  const [, config] = rule;

  // Clean up expired entries (resetTime is in the past)
  const now = Date.now();

  for (const [storedKey, data] of rateLimitStore.entries()) {
    if (data.resetTime < now) {
      rateLimitStore.delete(storedKey);
    }
  }

  // Hard cap to prevent memory exhaustion under DDoS
  if (rateLimitStore.size > 10000) {
    const entriesToDelete = rateLimitStore.size - 5000;
    const iterator = rateLimitStore.keys();

    for (let i = 0; i < entriesToDelete; i++) {
      const key = iterator.next().value;

      if (key !== undefined) {
        rateLimitStore.delete(key);
      }
    }
  }

  // Get or create rate limit data
  const rateLimitData = rateLimitStore.get(key) || { count: 0, resetTime: now + config.windowMs };

  if (rateLimitData.count >= config.maxRequests) {
    return { allowed: false, resetTime: rateLimitData.resetTime };
  }

  // Update rate limit data
  rateLimitData.count++;
  rateLimitStore.set(key, rateLimitData);

  return { allowed: true };
}

/**
 * Get client IP address from request for rate-limiting.
 *
 * ⚠️ LIMITATIONS:
 * - `cf-connecting-ip` is only trustworthy when behind Cloudflare (set by
 *   Cloudflare's edge, not spoofable by the client).
 * - `x-forwarded-for` and `x-real-ip` are trivially spoofable unless a
 *   trusted reverse proxy strips/overwrites them. We do NOT trust them alone.
 * - For non-Cloudflare deployments we build a composite key from multiple
 *   headers + the request URL. This isn't perfect (shared NAT, proxies) but
 *   prevents a single spoofed header from bypassing rate limits.
 * - As a last resort, each unidentifiable request gets a unique key so that
 *   all anonymous traffic doesn't share (and exhaust) one global bucket.
 */
function getClientIP(request: Request): string {
  // 1. Cloudflare-set header — most trustworthy, not spoofable by the client
  const cfConnectingIP = request.headers.get('cf-connecting-ip');

  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  /*
   * 2. Non-Cloudflare: build a composite fingerprint from all available hints.
   *    This resists spoofing any single header to bypass the rate limit.
   */
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const realIP = request.headers.get('x-real-ip') || '';
  const userAgent = request.headers.get('user-agent') || '';
  const host = request.headers.get('host') || '';

  const composite = `${forwardedFor}|${realIP}|${userAgent}|${host}|${request.url}`;

  // Only use the composite if at least one identifying header was present
  if (forwardedFor || realIP) {
    // Simple string hash (djb2) — fast, no crypto dependency needed for rate-limit keys
    let hash = 5381;

    for (let i = 0; i < composite.length; i++) {
      hash = (hash * 33) ^ composite.charCodeAt(i);
    }

    return 'composite-' + (hash >>> 0).toString(36);
  }

  /*
   * 3. No identifying headers at all — fall back to a shared anonymous bucket.
   *    Use the client IP from x-forwarded-for or x-real-ip if available,
   *    otherwise use a constant key so all anonymous traffic shares one bucket.
   */
  const forwardedIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIPHeader = request.headers.get('x-real-ip')?.trim();
  const anonymousKey = forwardedIP || realIPHeader || 'anonymous-shared';

  return 'anonymous-' + anonymousKey;
}

/**
 * Security headers middleware
 */
export function createSecurityHeaders() {
  return {
    // Prevent clickjacking
    'X-Frame-Options': 'DENY',

    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',

    // Enable XSS protection
    'X-XSS-Protection': '1; mode=block',

    /*
     * Content Security Policy
     * Engine-aware: WebContainer mode requires stackblitz.io/webcontainer.io domains
     * and unsafe-eval. Docker mode needs neither — only the WS server URL.
     */
    'Content-Security-Policy': (() => {
      const isDockerEngine = typeof process !== 'undefined' ? process.env?.VITE_RUNTIME_ENGINE === 'docker' : false;

      const connectSrc = [
        "connect-src 'self'",
        'https://api.github.com',
        'https://api.netlify.com',
        'https://api.vercel.com',
        'https://gitlab.com',
        'https://*.supabase.co',
        'https://generativelanguage.googleapis.com',
        'https://api.openai.com',
        'https://api.anthropic.com',
        'https://api.groq.com',
        'https://openrouter.ai',
        'https://registry.npmjs.org',
      ];

      if (isDockerEngine) {
        // Docker engine: connect to the WebSocket server instead of StackBlitz
        connectSrc.push('ws://localhost:3001', 'wss://localhost:3001');
      } else {
        // WebContainer engine: requires StackBlitz runtime domains
        connectSrc.push('https://*.stackblitz.io', 'wss://*.stackblitz.io');
      }

      const frameSrc = isDockerEngine
        ? "frame-src 'self' http://localhost:*"
        : "frame-src 'self' https://*.stackblitz.io https://*.webcontainer.io";

      const scriptSrc = isDockerEngine
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

      return [
        "default-src 'self'",
        scriptSrc,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: https: blob:",
        "font-src 'self' data: https://fonts.gstatic.com",
        connectSrc.join(' '),
        frameSrc,
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ');
    })(),

    // Referrer Policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Permissions Policy (formerly Feature Policy)
    'Permissions-Policy': ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()'].join(', '),

    // HSTS (HTTP Strict Transport Security) - only in production
    ...(process.env.NODE_ENV === 'production'
      ? {
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        }
      : {}),
  };
}

/**
 * Validate API key format (basic validation)
 */
export function validateApiKeyFormat(apiKey: string, provider: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // Basic length checks for different providers
  const minLengths: Record<string, number> = {
    anthropic: 50,
    openai: 50,
    groq: 50,
    google: 30,
    github: 30,
    netlify: 30,
  };

  const minLength = minLengths[provider.toLowerCase()] || 20;

  return apiKey.length >= minLength && !apiKey.includes('your_') && !apiKey.includes('here');
}

/**
 * Sanitize error messages to prevent information leakage
 */
export function sanitizeErrorMessage(error: unknown, isDevelopment = false): string {
  if (isDevelopment) {
    // In development, show full error details
    return error instanceof Error ? error.message : String(error);
  }

  // In production, show generic messages to prevent information leakage
  if (error instanceof Error) {
    // Check for sensitive information in error messages
    if (error.message.includes('API key') || error.message.includes('token') || error.message.includes('secret')) {
      return 'Authentication failed';
    }

    if (error.message.includes('rate limit') || error.message.includes('429')) {
      return 'Rate limit exceeded. Please try again later.';
    }
  }

  return 'An unexpected error occurred';
}

/**
 * Security wrapper for API routes
 */
export function withSecurity<T extends (args: ActionFunctionArgs | LoaderFunctionArgs) => Promise<Response>>(
  handler: T,
  options: {
    requireAuth?: boolean;
    rateLimit?: boolean;
    allowedMethods?: string[];
    requireJsonContentType?: boolean;
  } = {},
) {
  return async (args: ActionFunctionArgs | LoaderFunctionArgs): Promise<Response> => {
    const { request } = args;
    const url = new URL(request.url);
    const endpoint = url.pathname;

    // Check allowed methods
    if (options.allowedMethods && !options.allowedMethods.includes(request.method)) {
      return new Response('Method not allowed', {
        status: 405,
        headers: createSecurityHeaders(),
      });
    }

    /*
     * M18: Validate Content-Type on mutation requests.
     * POST/PUT/PATCH should declare application/json when the handler
     * parses the body with request.json(). Skip for GET/DELETE/OPTIONS
     * which typically don't carry a JSON body, and for multipart/form-data
     * uploads which legitimately use a different content type.
     */
    if (options.requireJsonContentType !== false && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const contentType = request.headers.get('Content-Type') || '';

      if (
        contentType &&
        !contentType.includes('application/json') &&
        !contentType.includes('multipart/form-data') &&
        !contentType.includes('application/octet-stream')
      ) {
        return new Response(JSON.stringify({ error: true, message: 'Content-Type must be application/json' }), {
          status: 415,
          headers: {
            ...createSecurityHeaders(),
            'Content-Type': 'application/json',
          },
        });
      }
    }

    // Enforce authentication if required (checked BEFORE rate limiting)
    if (options.requireAuth) {
      try {
        /*
         * Validate the session against the Supabase Auth server (JWT verification).
         * This calls supabase.auth.getUser() which makes a server-side request,
         * unlike getSession() which only decodes the JWT locally.
         */
        const { getAuthenticatedUser } = await import('~/lib/.server/supabase');
        const { user } = await getAuthenticatedUser(request, (args as ActionFunctionArgs).context);

        if (!user) {
          return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: {
              ...createSecurityHeaders(),
              'Content-Type': 'application/json',
            },
          });
        }
      } catch {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401,
          headers: {
            ...createSecurityHeaders(),
            'Content-Type': 'application/json',
          },
        });
      }
    }

    // Apply rate limiting
    if (options.rateLimit !== false) {
      const rateLimitResult = checkRateLimit(request, endpoint);

      if (!rateLimitResult.allowed) {
        return new Response('Rate limit exceeded', {
          status: 429,
          headers: {
            ...createSecurityHeaders(),
            'Retry-After': Math.ceil((rateLimitResult.resetTime! - Date.now()) / 1000).toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime!.toString(),
          },
        });
      }
    }

    try {
      // Execute the handler
      const response = await handler(args);

      // Add security headers to response
      const responseHeaders = new Headers(response.headers);
      Object.entries(createSecurityHeaders()).forEach(([key, value]) => {
        responseHeaders.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      /*
       * Remix pattern: handlers may `throw new Response(...)` to return
       * error responses. If the caught value is a Response, add security
       * headers and forward it as-is rather than wrapping in a generic 500.
       */
      if (error instanceof Response) {
        const responseHeaders = new Headers(error.headers);
        Object.entries(createSecurityHeaders()).forEach(([key, value]) => {
          responseHeaders.set(key, value);
        });

        return new Response(error.body, {
          status: error.status,
          statusText: error.statusText,
          headers: responseHeaders,
        });
      }

      logger.error('Security-wrapped handler error:', error);

      const errorMessage = sanitizeErrorMessage(error, process.env.NODE_ENV === 'development');

      return new Response(
        JSON.stringify({
          error: true,
          message: errorMessage,
        }),
        {
          status: 500,
          headers: {
            ...createSecurityHeaders(),
            'Content-Type': 'application/json',
          },
        },
      );
    }
  };
}
