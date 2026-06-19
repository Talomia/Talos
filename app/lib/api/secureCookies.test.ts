import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock js-cookie before importing the module under test
vi.mock('js-cookie', () => {
  const mockSet = vi.fn();
  const mockGet = vi.fn();
  const mockRemove = vi.fn();

  return {
    default: {
      set: mockSet,
      get: mockGet,
      remove: mockRemove,
    },
  };
});

import Cookies from 'js-cookie';
import { setSecureCookie, getCookie, removeCookie } from '~/lib/api/secureCookies';

describe('secureCookies', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Simulate an HTTPS environment so getSecureDefaults() returns secure: true
    vi.stubGlobal('window', { location: { protocol: 'https:' } });
  });

  describe('setSecureCookie', () => {
    it('should call Cookies.set with SameSite=strict and secure flags', () => {
      setSecureCookie('token', 'abc123');

      expect(Cookies.set).toHaveBeenCalledWith('token', 'abc123', {
        sameSite: 'strict',
        secure: true,
      });
    });

    it('should merge caller-provided options with secure defaults', () => {
      setSecureCookie('session', 'xyz', { expires: 7 });

      expect(Cookies.set).toHaveBeenCalledWith('session', 'xyz', {
        sameSite: 'strict',
        secure: true,
        expires: 7,
      });
    });

    it('should allow callers to override the secure defaults', () => {
      setSecureCookie('debug', 'val', { sameSite: 'lax', secure: false });

      // Caller options spread after defaults → they take precedence
      expect(Cookies.set).toHaveBeenCalledWith('debug', 'val', {
        sameSite: 'lax',
        secure: false,
      });
    });

    it('should set secure to false when protocol is not HTTPS', () => {
      vi.stubGlobal('window', { location: { protocol: 'http:' } });

      setSecureCookie('tok', 'v');

      expect(Cookies.set).toHaveBeenCalledWith('tok', 'v', {
        sameSite: 'strict',
        secure: false,
      });
    });
  });

  describe('getCookie', () => {
    it('should delegate to Cookies.get and return the value', () => {
      vi.mocked(Cookies.get).mockReturnValue('hello' as unknown as ReturnType<typeof Cookies.get>);

      const result = getCookie('greeting');

      expect(Cookies.get).toHaveBeenCalledWith('greeting');
      expect(result).toBe('hello');
    });

    it('should return undefined for a non-existent cookie', () => {
      vi.mocked(Cookies.get).mockReturnValue(undefined as unknown as ReturnType<typeof Cookies.get>);

      expect(getCookie('missing')).toBeUndefined();
    });
  });

  describe('removeCookie', () => {
    it('should delegate to Cookies.remove', () => {
      removeCookie('token');

      expect(Cookies.remove).toHaveBeenCalledWith('token', undefined);
    });

    it('should forward options to Cookies.remove', () => {
      removeCookie('token', { path: '/' });

      expect(Cookies.remove).toHaveBeenCalledWith('token', { path: '/' });
    });
  });
});
