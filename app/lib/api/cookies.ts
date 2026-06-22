

export function parseCookies(cookieHeader: string | null) {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) {
    return cookies;
  }

  // Split the cookie string by semicolons and spaces
  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (name && rest.length > 0) {
      // Decode the name and value, and join value parts in case it contains '='
      const decodedName = decodeURIComponent(name.trim());
      const decodedValue = decodeURIComponent(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });

  return cookies;
}

/**
 * @deprecated Use getApiKeysFromVault() instead. This reads plaintext cookies.
 * Kept for backward compatibility during migration.
 */
export function getApiKeysFromCookie(cookieHeader: string | null): Record<string, string> {
  try {
    const cookies = parseCookies(cookieHeader);
    return cookies.apiKeys ? JSON.parse(cookies.apiKeys) : {};
  } catch {
    return {};
  }
}

export function getProviderSettingsFromCookie(cookieHeader: string | null): Record<string, any> {
  try {
    const cookies = parseCookies(cookieHeader);
    return cookies.providers ? JSON.parse(cookies.providers) : {};
  } catch {
    return {};
  }
}
