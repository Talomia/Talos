import Cookies from 'js-cookie';

/**
 * Secure cookie defaults. All cookies should use these options unless
 * explicitly overridden with a documented security rationale.
 *
 * - SameSite=Strict: Prevents cross-site request forgery (CSRF)
 * - Secure: Only transmit over HTTPS in production
 */
function getSecureDefaults(): Cookies.CookieAttributes {
  return {
    sameSite: 'strict',
    secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
  };
}

/**
 * Set a cookie with secure defaults (SameSite=Strict, Secure on HTTPS).
 * Merges the provided options with secure defaults — explicit options take precedence.
 */
export function setSecureCookie(name: string, value: string, options?: Cookies.CookieAttributes): void {
  Cookies.set(name, value, { ...getSecureDefaults(), ...options });
}

/**
 * Get a cookie value.
 */
export function getCookie(name: string): string | undefined {
  return Cookies.get(name);
}

/**
 * Remove a cookie.
 */
export function removeCookie(name: string, options?: Cookies.CookieAttributes): void {
  Cookies.remove(name, options);
}
