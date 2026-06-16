import { describe, expect, it } from 'vitest';
import { compareNodes, isHiddenFile, type FileNode, type FolderNode } from './fileTreeUtils';

describe('fileTreeUtils', () => {
  describe('isHiddenFile', () => {
    it('should match string patterns by filename', () => {
      expect(isHiddenFile('/src/.env', '.env', ['.env'])).toBe(true);
      expect(isHiddenFile('/src/index.ts', 'index.ts', ['.env'])).toBe(false);
    });

    it('should match regex patterns by full path', () => {
      expect(isHiddenFile('/project/node_modules/lodash/index.js', 'index.js', [/\/node_modules\//])).toBe(true);
      expect(isHiddenFile('/project/src/index.js', 'index.js', [/\/node_modules\//])).toBe(false);
    });

    it('should support multiple patterns', () => {
      const patterns = ['.env', /\/node_modules\//, /\/\.next/];

      expect(isHiddenFile('/project/.env', '.env', patterns)).toBe(true);
      expect(isHiddenFile('/project/node_modules/x', 'x', patterns)).toBe(true);
      expect(isHiddenFile('/project/.next/cache', 'cache', patterns)).toBe(true);
      expect(isHiddenFile('/project/src/app.ts', 'app.ts', patterns)).toBe(false);
    });

    it('should return false for empty pattern list', () => {
      expect(isHiddenFile('/src/index.ts', 'index.ts', [])).toBe(false);
    });
  });

  describe('compareNodes', () => {
    const mkFile = (name: string): FileNode => ({
      kind: 'file',
      id: 0,
      depth: 0,
      name,
      fullPath: `/${name}`,
    });

    const mkFolder = (name: string): FolderNode => ({
      kind: 'folder',
      id: 0,
      depth: 0,
      name,
      fullPath: `/${name}`,
    });

    it('should sort folders before files', () => {
      expect(compareNodes(mkFolder('src'), mkFile('index.ts'))).toBeLessThan(0);
      expect(compareNodes(mkFile('index.ts'), mkFolder('src'))).toBeGreaterThan(0);
    });

    it('should sort same-kind nodes alphabetically', () => {
      expect(compareNodes(mkFile('a.ts'), mkFile('b.ts'))).toBeLessThan(0);
      expect(compareNodes(mkFile('b.ts'), mkFile('a.ts'))).toBeGreaterThan(0);
      expect(compareNodes(mkFolder('alpha'), mkFolder('beta'))).toBeLessThan(0);
    });

    it('should sort numerically within names', () => {
      expect(compareNodes(mkFile('file2.ts'), mkFile('file10.ts'))).toBeLessThan(0);
    });

    it('should be case-insensitive', () => {
      expect(compareNodes(mkFile('Apple.ts'), mkFile('banana.ts'))).toBeLessThan(0);
    });

    it('should return 0 for identical nodes', () => {
      expect(compareNodes(mkFile('same.ts'), mkFile('same.ts'))).toBe(0);
    });
  });
});
