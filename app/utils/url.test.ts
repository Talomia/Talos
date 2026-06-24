import { describe, it, expect } from 'vitest';
import { isValidUrl, isAllowedUrl } from './url';

describe('isValidUrl', () => {
  it('accepts http URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('accepts https URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
  });

  it('rejects non-URL strings', () => {
    expect(isValidUrl('not a url')).toBe(false);
  });

  it('rejects file: protocol', () => {
    expect(isValidUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects javascript: protocol', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });
});

describe('isAllowedUrl (SSRF protection)', () => {
  it('allows public URLs', () => {
    expect(isAllowedUrl('https://example.com')).toBe(true);
    expect(isAllowedUrl('https://github.com')).toBe(true);
  });

  it('blocks localhost', () => {
    expect(isAllowedUrl('http://localhost:3000')).toBe(false);
  });

  it('blocks 127.0.0.1 (loopback)', () => {
    expect(isAllowedUrl('http://127.0.0.1')).toBe(false);
    expect(isAllowedUrl('http://127.0.0.1:8080')).toBe(false);
  });

  it('blocks 10.x.x.x (class A private)', () => {
    expect(isAllowedUrl('http://10.0.0.1')).toBe(false);
    expect(isAllowedUrl('http://10.255.255.255')).toBe(false);
  });

  it('blocks 172.16-31.x.x (class B private)', () => {
    expect(isAllowedUrl('http://172.16.0.1')).toBe(false);
    expect(isAllowedUrl('http://172.31.255.255')).toBe(false);
  });

  it('allows 172.32.x.x (outside private range)', () => {
    expect(isAllowedUrl('http://172.32.0.1')).toBe(true);
  });

  it('blocks 192.168.x.x (class C private)', () => {
    expect(isAllowedUrl('http://192.168.0.1')).toBe(false);
    expect(isAllowedUrl('http://192.168.1.100')).toBe(false);
  });

  it('blocks 169.254.x.x (link-local/metadata)', () => {
    expect(isAllowedUrl('http://169.254.169.254')).toBe(false);
  });

  it('blocks 0.0.0.0', () => {
    expect(isAllowedUrl('http://0.0.0.0')).toBe(false);
  });

  it('blocks [::1] (IPv6 loopback)', () => {
    expect(isAllowedUrl('http://[::1]')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isAllowedUrl('not a url')).toBe(false);
  });
});
