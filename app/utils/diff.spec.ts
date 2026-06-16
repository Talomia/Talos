import { describe, expect, it } from 'vitest';
import { extractRelativePath, diffFiles, fileModificationsToHTML } from './diff';
import { WORK_DIR } from './constants';

describe('diff utilities', () => {
  describe('extractRelativePath', () => {
    it('should strip out WORK_DIR', () => {
      const filePath = `${WORK_DIR}/index.js`;
      const result = extractRelativePath(filePath);

      expect(result).toBe('index.js');
    });

    it('should handle nested paths', () => {
      const result = extractRelativePath(`${WORK_DIR}/src/components/App.tsx`);

      expect(result).toBe('src/components/App.tsx');
    });

    it('should return path as-is if it does not start with WORK_DIR', () => {
      const result = extractRelativePath('/other/path/file.ts');

      expect(result).toBe('/other/path/file.ts');
    });

    it('should handle WORK_DIR exactly (edge case)', () => {
      const result = extractRelativePath(`${WORK_DIR}/`);

      expect(result).toBe('');
    });
  });

  describe('diffFiles', () => {
    it('should return undefined for identical files', () => {
      const content = 'line1\nline2\nline3\n';
      const result = diffFiles('test.ts', content, content);

      expect(result).toBeUndefined();
    });

    it('should return a diff for changed files', () => {
      const oldContent = 'line1\nline2\nline3\n';
      const newContent = 'line1\nmodified\nline3\n';
      const result = diffFiles('test.ts', oldContent, newContent);

      expect(result).toBeDefined();
      expect(result).toContain('-line2');
      expect(result).toContain('+modified');
    });

    it('should strip the patch header', () => {
      const result = diffFiles('test.ts', 'old', 'new');

      // Should not contain the header lines
      expect(result).not.toContain('--- test.ts');
      expect(result).not.toContain('+++ test.ts');
    });

    it('should handle added lines', () => {
      const result = diffFiles('test.ts', 'line1\n', 'line1\nline2\n');

      expect(result).toBeDefined();
      expect(result).toContain('+line2');
    });

    it('should handle removed lines', () => {
      const result = diffFiles('test.ts', 'line1\nline2\n', 'line1\n');

      expect(result).toBeDefined();
      expect(result).toContain('-line2');
    });
  });

  describe('fileModificationsToHTML', () => {
    it('should return undefined for empty modifications', () => {
      const result = fileModificationsToHTML({});

      expect(result).toBeUndefined();
    });

    it('should wrap diff modifications in tags', () => {
      const result = fileModificationsToHTML({
        '/src/index.ts': { type: 'diff', content: '-old\n+new' },
      });

      expect(result).toBeDefined();
      expect(result).toContain('<diff path="/src/index.ts">');
      expect(result).toContain('-old\n+new');
      expect(result).toContain('</diff>');
    });

    it('should wrap file modifications in tags', () => {
      const result = fileModificationsToHTML({
        '/src/app.ts': { type: 'file', content: 'full content' },
      });

      expect(result).toBeDefined();
      expect(result).toContain('<file path="/src/app.ts">');
      expect(result).toContain('full content');
      expect(result).toContain('</file>');
    });

    it('should handle multiple modifications', () => {
      const result = fileModificationsToHTML({
        '/src/a.ts': { type: 'diff', content: 'diff-a' },
        '/src/b.ts': { type: 'file', content: 'file-b' },
      });

      expect(result).toBeDefined();
      expect(result).toContain('diff-a');
      expect(result).toContain('file-b');
    });
  });
});
