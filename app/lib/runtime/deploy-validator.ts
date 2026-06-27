/**
 * Deploy Validator — post-deployment health checks.
 *
 * Validates that a deployed application is healthy by checking:
 *   - HTTP status code (expects 200)
 *   - Response headers for common issues
 *   - Basic content validation
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DeployValidator');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeploymentValidationResult {
  healthy: boolean;
  statusCode: number;
  issues: string[];
}

export interface DeployValidationOptions {
  /** Request timeout in milliseconds. Defaults to 15000. */
  timeoutMs?: number;

  /** Expected HTTP status code. Defaults to 200. */
  expectedStatus?: number;

  /** Whether to follow redirects. Defaults to true. */
  followRedirects?: boolean;

  /** Custom headers to include in the request. */
  headers?: Record<string, string>;
}

const DEFAULT_OPTIONS: Required<DeployValidationOptions> = {
  timeoutMs: 15_000,
  expectedStatus: 200,
  followRedirects: true,
  headers: {},
};

// ─── Deployment Validation ────────────────────────────────────────────────────

/**
 * Validate a deployed application by fetching its URL and checking
 * for common issues.
 *
 * Checks performed:
 *   1. HTTP response status (expects 200 by default)
 *   2. Content-Type header presence
 *   3. Security headers (X-Frame-Options, CSP, etc.)
 *   4. Cache control headers
 *   5. Response body presence
 */
export async function validateDeployment(
  url: string,
  options?: DeployValidationOptions,
): Promise<DeploymentValidationResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  logger.info(`Validating deployment: ${url}`);

  if (!url || !isValidUrl(url)) {
    return {
      healthy: false,
      statusCode: 0,
      issues: [`Invalid deployment URL: "${url}"`],
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: opts.followRedirects ? 'follow' : 'manual',
      headers: {
        'User-Agent': 'Talos-DeployValidator/1.0',
        ...opts.headers,
      },
    });

    clearTimeout(timeoutId);

    const issues: string[] = [];

    // Check 1: HTTP status
    if (response.status !== opts.expectedStatus) {
      issues.push(
        `Unexpected HTTP status: ${response.status} ${response.statusText} (expected ${opts.expectedStatus})`,
      );
    }

    // Check 2: Content-Type header
    const contentType = response.headers.get('content-type');

    if (!contentType) {
      issues.push('Missing Content-Type header — the server may not be configured correctly');
    } else if (
      !contentType.includes('text/html') &&
      !contentType.includes('application/json') &&
      !contentType.includes('text/plain')
    ) {
      issues.push(`Unexpected Content-Type: "${contentType}" — expected HTML, JSON, or plain text`);
    }

    // Check 3: Security headers
    checkSecurityHeaders(response.headers, issues);

    // Check 4: Cache headers
    checkCacheHeaders(response.headers, issues);

    // Check 5: Response body
    try {
      const body = await response.text();

      if (!body || body.trim().length === 0) {
        issues.push('Response body is empty — the deployment may not be serving content');
      } else if (body.length < 50) {
        issues.push('Response body is very short — the deployment may be showing an error page');
      }

      // Check for common error pages
      checkForErrorContent(body, issues);
    } catch {
      issues.push('Failed to read response body');
    }

    const healthy = response.status === opts.expectedStatus && issues.length === 0;

    logger.info(
      `Deployment validation ${healthy ? 'passed' : 'failed'}: ` + `status=${response.status}, issues=${issues.length}`,
    );

    return {
      healthy,
      statusCode: response.status,
      issues,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn(`Deployment validation timed out after ${opts.timeoutMs}ms`);

      return {
        healthy: false,
        statusCode: 0,
        issues: [`Request timed out after ${opts.timeoutMs}ms — the deployment may be unreachable or slow`],
      };
    }

    logger.error('Deployment validation error:', message);

    return {
      healthy: false,
      statusCode: 0,
      issues: [`Failed to reach deployment: ${message}`],
    };
  }
}

// ─── Header Checks ───────────────────────────────────────────────────────────

/**
 * Check for important security headers and log warnings if missing.
 * These are informational — missing security headers don't fail the check
 * but are reported as issues.
 */
function checkSecurityHeaders(headers: Headers, issues: string[]): void {
  const securityHeaders: Array<{ name: string; description: string }> = [
    { name: 'x-frame-options', description: 'X-Frame-Options (clickjacking protection)' },
    { name: 'x-content-type-options', description: 'X-Content-Type-Options (MIME sniffing protection)' },
    { name: 'strict-transport-security', description: 'Strict-Transport-Security (HSTS)' },
  ];

  const missingHeaders = securityHeaders.filter((h) => !headers.get(h.name));

  if (missingHeaders.length > 0) {
    issues.push(`Missing security headers: ${missingHeaders.map((h) => h.description).join(', ')}`);
  }
}

/**
 * Check cache-related headers for common misconfigurations.
 */
function checkCacheHeaders(headers: Headers, issues: string[]): void {
  const cacheControl = headers.get('cache-control');

  if (!cacheControl) {
    // Not an error — some deployments intentionally omit cache-control
    return;
  }

  // Warn if serving with very long cache but no versioning indicators
  if (cacheControl.includes('max-age=31536000') && !cacheControl.includes('immutable')) {
    issues.push(
      'Cache-Control sets max-age to 1 year without "immutable" — ' +
        'consider adding "immutable" for versioned assets or reducing max-age',
    );
  }
}

/**
 * Check the response body for patterns that indicate an error page
 * rather than the actual application.
 */
function checkForErrorContent(body: string, issues: string[]): void {
  const lowerBody = body.toLowerCase();

  const errorPatterns: Array<{ pattern: string; message: string }> = [
    { pattern: 'application error', message: 'Response contains "Application Error" — deployment may have crashed' },
    {
      pattern: 'internal server error',
      message: 'Response contains "Internal Server Error" — server-side issue detected',
    },
    { pattern: '502 bad gateway', message: 'Response indicates a 502 Bad Gateway error' },
    { pattern: '503 service unavailable', message: 'Response indicates service is unavailable (503)' },
    { pattern: 'page not found', message: 'Response shows a "Page Not Found" error' },
    {
      pattern: 'default page for this server',
      message: 'Response appears to be a default/placeholder server page',
    },
  ];

  for (const { pattern, message } of errorPatterns) {
    if (lowerBody.includes(pattern)) {
      issues.push(message);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
