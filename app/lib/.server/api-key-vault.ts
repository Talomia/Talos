import { encrypt, decrypt, getVaultSecret } from './crypto';
import { createScopedLogger } from '~/utils/logger';
import { getApiKeysFromCookie, parseCookies } from '~/lib/api/cookies';

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

  const cookies = parseCookies(cookieHeader);
  const vaultCookie = cookies[COOKIE_NAME];

  if (!vaultCookie) {
    return empty;
  }

  try {
    const secret = getVaultSecret(env);
    const decrypted = await decrypt(decodeURIComponent(vaultCookie), secret);

    const parsed = JSON.parse(decrypted);

    // Structural validation: ensure apiKeys is a valid object
    if (!parsed || typeof parsed !== 'object' || typeof parsed.apiKeys !== 'object' || parsed.apiKeys === null) {
      logger.warn('Vault data has invalid structure, returning empty vault');
      return empty;
    }

    return parsed as VaultData;
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
 * Reads API keys from the encrypted vault cookie, with fallback to legacy plaintext cookie.
 * Falls back ONLY when no vault cookie exists (not on decryption failure — that would
 * allow a downgrade attack via a corrupted vault cookie + injected plaintext apiKeys cookie).
 */
export async function getApiKeysFromVault(
  cookieHeader: string | null,
  env?: Record<string, string>,
): Promise<Record<string, string>> {
  // Check if vault cookie exists before attempting decryption
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);

    if (cookies[COOKIE_NAME]) {
      // Vault cookie exists — use it exclusively (no plaintext fallback)
      const vault = await readVault(cookieHeader, env);
      return vault.apiKeys;
    }
  }

  // No vault cookie — fall back to legacy plaintext cookie for migration
  return getApiKeysFromCookie(cookieHeader);
}
