import { describe, expect, it, vi, beforeEach } from 'vitest';
import { encrypt, decrypt, getVaultSecret } from './crypto';

describe('crypto', { timeout: 30_000 }, () => {
  const TEST_SECRET = 'test-secret-key-for-unit-tests-32chars';

  describe('encrypt / decrypt round-trip', () => {
    it('should encrypt and decrypt a simple string', async () => {
      const plaintext = 'Hello, World!';
      const encrypted = await encrypt(plaintext, TEST_SECRET);
      const decrypted = await decrypt(encrypted, TEST_SECRET);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt JSON data', async () => {
      const data = JSON.stringify({
        apiKeys: { openai: 'sk-test-key-123', anthropic: 'ant-test-key-456' },
        updatedAt: new Date().toISOString(),
      });

      const encrypted = await encrypt(data, TEST_SECRET);
      const decrypted = await decrypt(encrypted, TEST_SECRET);

      expect(JSON.parse(decrypted)).toEqual(JSON.parse(data));
    });

    it('should encrypt and decrypt empty string', async () => {
      const encrypted = await encrypt('', TEST_SECRET);
      const decrypted = await decrypt(encrypted, TEST_SECRET);

      expect(decrypted).toBe('');
    });

    it('should encrypt and decrypt unicode content', async () => {
      const plaintext = '🔐 日本語テスト εγκρυπτ 中文加密';
      const encrypted = await encrypt(plaintext, TEST_SECRET);
      const decrypted = await decrypt(encrypted, TEST_SECRET);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt large payload', async () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = await encrypt(plaintext, TEST_SECRET);
      const decrypted = await decrypt(encrypted, TEST_SECRET);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('encryption uniqueness', () => {
    it('should produce different ciphertexts for the same plaintext (random IV)', async () => {
      const plaintext = 'same-input';
      const encrypted1 = await encrypt(plaintext, TEST_SECRET);
      const encrypted2 = await encrypt(plaintext, TEST_SECRET);

      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      expect(await decrypt(encrypted1, TEST_SECRET)).toBe(plaintext);
      expect(await decrypt(encrypted2, TEST_SECRET)).toBe(plaintext);
    });
  });

  describe('decryption with wrong key', () => {
    it('should fail to decrypt with a different secret', async () => {
      const encrypted = await encrypt('secret data', TEST_SECRET);

      await expect(decrypt(encrypted, 'wrong-secret-key')).rejects.toThrow();
    });
  });

  describe('encrypted output format', () => {
    it('should produce base64-encoded output', async () => {
      const encrypted = await encrypt('test', TEST_SECRET);

      // Should be valid base64
      expect(() => atob(encrypted)).not.toThrow();
    });

    it('should include IV prefix (12 bytes = 16+ base64 chars)', async () => {
      const encrypted = await encrypt('test', TEST_SECRET);
      const decoded = atob(encrypted);

      // IV (12 bytes) + ciphertext (>= 4 bytes for "test" + 16 bytes GCM tag)
      expect(decoded.length).toBeGreaterThan(12 + 4);
    });
  });

  describe('getVaultSecret', () => {
    beforeEach(() => {
      vi.stubEnv('VAULT_SECRET', '');
      vi.stubEnv('NODE_ENV', 'development');
    });

    it('should return VAULT_SECRET from env record when provided', () => {
      const secret = getVaultSecret({ VAULT_SECRET: 'my-custom-secret' });
      expect(secret).toBe('my-custom-secret');
    });

    it('should fall back to process.env.VAULT_SECRET', () => {
      vi.stubEnv('VAULT_SECRET', 'env-secret');

      const secret = getVaultSecret();

      expect(secret).toBe('env-secret');
    });

    it('should return dev fallback when no secret is set', () => {
      vi.stubEnv('VAULT_SECRET', '');

      const secret = getVaultSecret({});

      expect(secret).toBe('dev-secret-change-in-production');
    });

    it('should prefer env record over process.env', () => {
      vi.stubEnv('VAULT_SECRET', 'process-env-secret');

      const secret = getVaultSecret({ VAULT_SECRET: 'explicit-secret' });

      expect(secret).toBe('explicit-secret');
    });
  });
});
