import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('crypto');

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for AES-GCM

/**
 * Derives an encryption key from a secret string using PBKDF2.
 * The secret should come from an environment variable.
 */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('vault-v1'),
      iterations: 600000, // OWASP 2024 recommends 600k+ for SHA-256
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string containing IV + ciphertext.
 */
export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();

  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoder.encode(plaintext));

  // Combine IV + ciphertext into a single buffer
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Chunk-based encoding to avoid stack overflow with large payloads
  let binaryString = '';

  for (let i = 0; i < combined.length; i++) {
    binaryString += String.fromCharCode(combined[i]);
  }

  return btoa(binaryString);
}

/**
 * Decrypts a base64-encoded ciphertext string using AES-256-GCM.
 * Returns the original plaintext.
 */
export async function decrypt(encoded: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);

  return new TextDecoder().decode(plaintext);
}

/**
 * Gets the vault encryption secret from environment.
 * Falls back to a default in development only.
 */
export function getVaultSecret(env?: Record<string, string>): string {
  const secret = env?.VAULT_SECRET || process.env.VAULT_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('VAULT_SECRET environment variable is required in production');
    }

    logger.warn('VAULT_SECRET not set — using development fallback. Set VAULT_SECRET env var for production.');

    return 'dev-secret-change-in-production';
  }

  return secret;
}
