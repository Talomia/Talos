import { describe, it, expect, vi, beforeEach } from 'vitest';
import { safeSetItem, safeGetItem, safeRemoveItem, safeParseJSON, handleIDBQuotaError } from './safeStorage';

// Mock localStorage
const mockStorage: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  }),
  get length() {
    return Object.keys(mockStorage).length;
  },
  key: vi.fn((index: number) => Object.keys(mockStorage)[index] || null),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('safeStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  describe('safeSetItem', () => {
    it('writes to localStorage and returns true', () => {
      const result = safeSetItem('key1', 'value1');

      expect(result).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('key1', 'value1');
    });

    it('returns false on quota error', () => {
      const error = new DOMException('Storage full', 'QuotaExceededError');
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw error;
      });

      const result = safeSetItem('key2', 'x'.repeat(10000));

      expect(result).toBe(false);
    });

    it('returns false on any error', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('random error');
      });

      const result = safeSetItem('key3', 'value');

      expect(result).toBe(false);
    });
  });

  describe('safeGetItem', () => {
    it('reads from localStorage', () => {
      mockStorage.existing = 'hello';

      const result = safeGetItem('existing');

      expect(result).toBe('hello');
    });

    it('returns null for missing keys', () => {
      const result = safeGetItem('nonexistent');

      expect(result).toBeNull();
    });

    it('returns null on error', () => {
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error('access denied');
      });

      const result = safeGetItem('key');

      expect(result).toBeNull();
    });
  });

  describe('safeRemoveItem', () => {
    it('removes from localStorage and returns true', () => {
      mockStorage.toRemove = 'value';

      const result = safeRemoveItem('toRemove');

      expect(result).toBe(true);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('toRemove');
    });

    it('returns false on error', () => {
      localStorageMock.removeItem.mockImplementationOnce(() => {
        throw new Error('error');
      });

      const result = safeRemoveItem('key');

      expect(result).toBe(false);
    });
  });

  describe('safeParseJSON', () => {
    it('parses valid JSON', () => {
      mockStorage.json = JSON.stringify({ name: 'test', count: 42 });

      const result = safeParseJSON('json', { name: '', count: 0 });

      expect(result).toEqual({ name: 'test', count: 42 });
    });

    it('returns fallback for missing key', () => {
      const result = safeParseJSON('missing', { default: true });

      expect(result).toEqual({ default: true });
    });

    it('returns fallback for invalid JSON', () => {
      mockStorage.invalid = 'not-json';

      const result = safeParseJSON('invalid', 'fallback');

      expect(result).toBe('fallback');
    });

    it('handles arrays', () => {
      mockStorage.arr = JSON.stringify([1, 2, 3]);

      const result = safeParseJSON<number[]>('arr', []);

      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('handleIDBQuotaError', () => {
    it('returns true for QuotaExceededError', () => {
      const error = new DOMException('Quota exceeded', 'QuotaExceededError');
      const result = handleIDBQuotaError(error, 'saving chat');

      expect(result).toBe(true);
    });

    it('returns false for non-quota errors', () => {
      const error = new Error('random');
      const result = handleIDBQuotaError(error, 'operation');

      expect(result).toBe(false);
    });

    it('returns false for null error', () => {
      const result = handleIDBQuotaError(null, 'operation');

      expect(result).toBe(false);
    });
  });
});
