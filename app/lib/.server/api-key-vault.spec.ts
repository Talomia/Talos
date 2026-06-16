import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readVault, writeVault, clearLegacyCookie, type VaultData } from './api-key-vault';

// Mock the crypto module
vi.mock('./crypto', () => ({
  encrypt: vi.fn(async (data: string) => Buffer.from(`encrypted:${data}`).toString('base64')),
  decrypt: vi.fn(async (data: string) => {
    const decoded = Buffer.from(data, 'base64').toString();

    if (decoded.startsWith('encrypted:')) {
      return decoded.replace('encrypted:', '');
    }

    throw new Error('Decryption failed');
  }),
  getVaultSecret: vi.fn(() => 'test-secret'),
}));

describe('api-key-vault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('readVault', () => {
    it('should return empty vault when no cookie header is provided', async () => {
      const result = await readVault(null);

      expect(result.apiKeys).toEqual({});
      expect(result.updatedAt).toBeDefined();
    });

    it('should return empty vault when cookie header has no vault cookie', async () => {
      const result = await readVault('other_cookie=value');

      expect(result.apiKeys).toEqual({});
    });

    it('should decrypt and return vault data from rc_vault cookie', async () => {
      const vaultData: VaultData = {
        apiKeys: { openai: 'sk-test' },
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const encrypted = Buffer.from(`encrypted:${JSON.stringify(vaultData)}`).toString('base64');
      const cookieHeader = `rc_vault=${encodeURIComponent(encrypted)}`;

      const result = await readVault(cookieHeader);

      expect(result.apiKeys).toEqual({ openai: 'sk-test' });
      expect(result.updatedAt).toBe('2024-01-01T00:00:00Z');
    });

    it('should migrate legacy plaintext apiKeys cookie', async () => {
      const legacyKeys = { openai: 'sk-legacy', anthropic: 'ant-legacy' };
      const cookieHeader = `apiKeys=${encodeURIComponent(JSON.stringify(legacyKeys))}`;

      const result = await readVault(cookieHeader);

      expect(result.apiKeys).toEqual(legacyKeys);
    });

    it('should return empty vault on decryption failure', async () => {
      const cookieHeader = `rc_vault=${encodeURIComponent('invalid-data')}`;

      const result = await readVault(cookieHeader);

      expect(result.apiKeys).toEqual({});
    });

    it('should return empty vault when legacy cookie has invalid JSON', async () => {
      const cookieHeader = 'apiKeys=not-valid-json';

      const result = await readVault(cookieHeader);

      expect(result.apiKeys).toEqual({});
    });

    it('should handle cookies with = in values', async () => {
      const vaultData: VaultData = {
        apiKeys: { test: 'key' },
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const encrypted = Buffer.from(`encrypted:${JSON.stringify(vaultData)}`).toString('base64');
      const cookieHeader = `other=val; rc_vault=${encodeURIComponent(encrypted)}; session=abc`;

      const result = await readVault(cookieHeader);

      expect(result.apiKeys).toEqual({ test: 'key' });
    });
  });

  describe('writeVault', () => {
    it('should produce a valid Set-Cookie header', async () => {
      const data: VaultData = {
        apiKeys: { openai: 'sk-test' },
        updatedAt: new Date().toISOString(),
      };

      const cookie = await writeVault(data);

      expect(cookie).toContain('rc_vault=');
      expect(cookie).toContain('Max-Age=');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
    });

    it('should set Max-Age to 1 year', async () => {
      const data: VaultData = { apiKeys: {}, updatedAt: new Date().toISOString() };
      const cookie = await writeVault(data);
      const oneYear = 60 * 60 * 24 * 365;

      expect(cookie).toContain(`Max-Age=${oneYear}`);
    });

    it('should include Secure flag in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const data: VaultData = { apiKeys: {}, updatedAt: new Date().toISOString() };
      const cookie = await writeVault(data);

      expect(cookie).toContain('Secure');

      process.env.NODE_ENV = originalEnv;
    });

    it('should not include Secure flag in development', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const data: VaultData = { apiKeys: {}, updatedAt: new Date().toISOString() };
      const cookie = await writeVault(data);

      expect(cookie).not.toContain('Secure');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('clearLegacyCookie', () => {
    it('should return a cookie that deletes the legacy apiKeys cookie', () => {
      const cookie = clearLegacyCookie();

      expect(cookie).toBe('apiKeys=; Max-Age=0; Path=/');
    });
  });
});
