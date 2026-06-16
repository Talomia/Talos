import { encrypt, decrypt, getVaultSecret } from './crypto';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api-key-vault');

const COOKIE_NAME = 'rc_vault';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export interface VaultData {
  apiKeys: Record<string, string>;
  updatedAt: string;
}

/**
 * Reads and decrypts API keys from the vault cookie.
 */
export async function readVault(cookieHeader: string | null, env?: Record<string, string>): Promise<VaultData> {
  const empty: VaultData = { apiKeys: {}, updatedAt: new Date().toISOString() };

  if (!cookieHeader) {
    return empty;
  }

  const cookies = parseCookieHeader(cookieHeader);
  const vaultCookie = cookies[COOKIE_NAME];

  if (!vaultCookie) {
    // Fallback: try reading legacy plaintext 'apiKeys' cookie for migration
    const legacyKeys = cookies.apiKeys;

    if (legacyKeys) {
      try {
        const parsed = JSON.parse(decodeURIComponent(legacyKeys));
        logger.info('Migrating legacy apiKeys cookie to encrypted vault');

        return { apiKeys: parsed, updatedAt: new Date().toISOString() };
      } catch {
        return empty;
      }
    }

    return empty;
  }

  try {
    const secret = getVaultSecret(env);
    const decrypted = await decrypt(decodeURIComponent(vaultCookie), secret);

    return JSON.parse(decrypted) as VaultData;
  } catch (error) {
    logger.error('Failed to decrypt vault:', error);

    return empty;
  }
}

/**
 * Encrypts and serializes API keys into a Set-Cookie header value.
 */
export async function writeVault(data: VaultData, env?: Record<string, string>): Promise<string> {
  const secret = getVaultSecret(env);
  const encrypted = await encrypt(JSON.stringify(data), secret);

  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(encrypted)}`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ];

  // Add Secure flag in production
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Creates a Set-Cookie header that deletes the legacy plaintext apiKeys cookie.
 */
export function clearLegacyCookie(): string {
  return 'apiKeys=; Max-Age=0; Path=/';
}

function parseCookieHeader(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const pair of header.split(';')) {
    const [key, ...rest] = pair.trim().split('=');

    if (key) {
      cookies[key.trim()] = rest.join('=').trim();
    }
  }

  return cookies;
}
