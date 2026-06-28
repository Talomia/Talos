/**
 * URL validation utilities with SSRF protection.
 */

const PRIVATE_IP_PATTERNS = [
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // Loopback
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // Class A private
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // Class B private
  /^192\.168\.\d{1,3}\.\d{1,3}$/, // Class C private
  /^169\.254\.\d{1,3}\.\d{1,3}$/, // Link-local
  /^0\.0\.0\.0$/, // Unspecified
];

/**
 * IPv4-mapped IPv6 addresses that could bypass IPv4 checks.
 * Format: ::ffff:x.x.x.x or [::ffff:x.x.x.x]
 */
const IPV6_MAPPED_PRIVATE = [
  /^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i, // Loopback mapped
  /^::ffff:10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i, // Class A mapped
  /^::ffff:172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/i, // Class B mapped
  /^::ffff:192\.168\.\d{1,3}\.\d{1,3}$/i, // Class C mapped
  /^::ffff:169\.254\.\d{1,3}\.\d{1,3}$/i, // Link-local mapped
  /^::ffff:0\.0\.0\.0$/i, // Unspecified mapped
];

const BLOCKED_HOSTNAMES = new Set(['localhost', '[::1]', '::1', '0.0.0.0', '[::ffff:127.0.0.1]', '[::ffff:0.0.0.0]']);

export function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isAllowedUrl(input: string): boolean {
  if (!isValidUrl(input)) {
    return false;
  }

  const url = new URL(input);
  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return false;
  }

  // Strip brackets from IPv6 addresses for pattern matching
  const bareHostname = hostname.replace(/^\[|\]$/g, '');

  if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(bareHostname))) {
    return false;
  }

  if (IPV6_MAPPED_PRIVATE.some((pattern) => pattern.test(bareHostname))) {
    return false;
  }

  return true;
}
