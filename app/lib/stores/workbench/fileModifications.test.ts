import { describe, expect, it, vi } from 'vitest';
import {
  getFileModifications,
  getModifiedFiles,
  resetAllFileModifications,
  lockFile,
  unlockFile,
  lockFolder,
  unlockFolder,
  isFileLocked,
  isFolderLocked,
} from '~/lib/stores/workbench/fileModifications';
import type { FilesStore } from '~/lib/stores/files';

/**
 * Factory for a mock FilesStore with the methods used by the fileModifications module.
 */
function createMockFilesStore(overrides: Partial<FilesStore> = {}): FilesStore {
  return {
    getFileModifications: vi.fn().mockReturnValue({ '/src/a.ts': { type: 'diff', content: '-old\n+new' } }),
    getModifiedFiles: vi.fn().mockReturnValue({ '/src/a.ts': { type: 'file', content: 'new', isBinary: false } }),
    resetFileModifications: vi.fn(),
    lockFile: vi.fn().mockReturnValue(true),
    unlockFile: vi.fn().mockReturnValue(true),
    lockFolder: vi.fn().mockReturnValue(true),
    unlockFolder: vi.fn().mockReturnValue(true),
    isFileLocked: vi.fn().mockReturnValue({ locked: false }),
    isFolderLocked: vi.fn().mockReturnValue({ isLocked: false }),
    ...overrides,
  } as unknown as FilesStore;
}

describe('fileModifications', () => {
  describe('getFileModifications', () => {
    it('should delegate to filesStore.getFileModifications', () => {
      const store = createMockFilesStore();
      const result = getFileModifications(store);

      expect(store.getFileModifications).toHaveBeenCalledOnce();
      expect(result).toEqual({ '/src/a.ts': { type: 'diff', content: '-old\n+new' } });
    });

    it('should return undefined when there are no modifications', () => {
      const store = createMockFilesStore({
        getFileModifications: vi.fn().mockReturnValue(undefined),
      });

      expect(getFileModifications(store)).toBeUndefined();
    });
  });

  describe('getModifiedFiles', () => {
    it('should delegate to filesStore.getModifiedFiles', () => {
      const store = createMockFilesStore();
      const result = getModifiedFiles(store);

      expect(store.getModifiedFiles).toHaveBeenCalledOnce();
      expect(result).toBeDefined();
    });
  });

  describe('resetAllFileModifications', () => {
    it('should call filesStore.resetFileModifications', () => {
      const store = createMockFilesStore();
      resetAllFileModifications(store);

      expect(store.resetFileModifications).toHaveBeenCalledOnce();
    });
  });

  describe('lockFile / unlockFile', () => {
    it('should delegate lockFile to the store and return the result', () => {
      const store = createMockFilesStore();
      const result = lockFile(store, '/src/index.ts');

      expect(store.lockFile).toHaveBeenCalledWith('/src/index.ts');
      expect(result).toBe(true);
    });

    it('should delegate unlockFile to the store and return the result', () => {
      const store = createMockFilesStore();
      const result = unlockFile(store, '/src/index.ts');

      expect(store.unlockFile).toHaveBeenCalledWith('/src/index.ts');
      expect(result).toBe(true);
    });

    it('should return false when lockFile fails', () => {
      const store = createMockFilesStore({ lockFile: vi.fn().mockReturnValue(false) });
      expect(lockFile(store, '/missing.ts')).toBe(false);
    });
  });

  describe('lockFolder / unlockFolder', () => {
    it('should delegate lockFolder to the store', () => {
      const store = createMockFilesStore();
      const result = lockFolder(store, '/src');

      expect(store.lockFolder).toHaveBeenCalledWith('/src');
      expect(result).toBe(true);
    });

    it('should delegate unlockFolder to the store', () => {
      const store = createMockFilesStore();
      const result = unlockFolder(store, '/src');

      expect(store.unlockFolder).toHaveBeenCalledWith('/src');
      expect(result).toBe(true);
    });
  });

  describe('isFileLocked', () => {
    it('should return locked: false for an unlocked file', () => {
      const store = createMockFilesStore();
      const result = isFileLocked(store, '/src/index.ts');

      expect(store.isFileLocked).toHaveBeenCalledWith('/src/index.ts');
      expect(result).toEqual({ locked: false });
    });

    it('should return locked: true when the file is locked', () => {
      const store = createMockFilesStore({
        isFileLocked: vi.fn().mockReturnValue({ locked: true, lockedBy: '/src/index.ts' }),
      });

      expect(isFileLocked(store, '/src/index.ts')).toEqual({ locked: true, lockedBy: '/src/index.ts' });
    });
  });

  describe('isFolderLocked', () => {
    it('should return isLocked: false for an unlocked folder', () => {
      const store = createMockFilesStore();
      const result = isFolderLocked(store, '/src');

      expect(store.isFolderLocked).toHaveBeenCalledWith('/src');
      expect(result).toEqual({ isLocked: false });
    });

    it('should return isLocked: true when the folder is locked', () => {
      const store = createMockFilesStore({
        isFolderLocked: vi.fn().mockReturnValue({ isLocked: true, lockedBy: '/src' }),
      });

      expect(isFolderLocked(store, '/src')).toEqual({ isLocked: true, lockedBy: '/src' });
    });
  });
});
