import type { FilesStore } from '~/lib/stores/files';

/**
 * Retrieve the list of file modifications tracked by the files store.
 */
export function getFileModifications(filesStore: FilesStore) {
  return filesStore.getFileModifications();
}

/**
 * Retrieve the set of modified files from the files store.
 */
export function getModifiedFiles(filesStore: FilesStore) {
  return filesStore.getModifiedFiles();
}

/**
 * Reset all file modifications in the files store.
 */
export function resetAllFileModifications(filesStore: FilesStore) {
  filesStore.resetFileModifications();
}

/**
 * Lock a file to prevent edits
 * @param filesStore The underlying files store
 * @param filePath Path to the file to lock
 * @returns True if the file was successfully locked
 */
export function lockFile(filesStore: FilesStore, filePath: string) {
  return filesStore.lockFile(filePath);
}

/**
 * Lock a folder and all its contents to prevent edits
 * @param filesStore The underlying files store
 * @param folderPath Path to the folder to lock
 * @returns True if the folder was successfully locked
 */
export function lockFolder(filesStore: FilesStore, folderPath: string) {
  return filesStore.lockFolder(folderPath);
}

/**
 * Unlock a file to allow edits
 * @param filesStore The underlying files store
 * @param filePath Path to the file to unlock
 * @returns True if the file was successfully unlocked
 */
export function unlockFile(filesStore: FilesStore, filePath: string) {
  return filesStore.unlockFile(filePath);
}

/**
 * Unlock a folder and all its contents to allow edits
 * @param filesStore The underlying files store
 * @param folderPath Path to the folder to unlock
 * @returns True if the folder was successfully unlocked
 */
export function unlockFolder(filesStore: FilesStore, folderPath: string) {
  return filesStore.unlockFolder(folderPath);
}

/**
 * Check if a file is locked
 * @param filesStore The underlying files store
 * @param filePath Path to the file to check
 * @returns Object with locked status, lock mode, and what caused the lock
 */
export function isFileLocked(filesStore: FilesStore, filePath: string) {
  return filesStore.isFileLocked(filePath);
}

/**
 * Check if a folder is locked
 * @param filesStore The underlying files store
 * @param folderPath Path to the folder to check
 * @returns Object with locked status, lock mode, and what caused the lock
 */
export function isFolderLocked(filesStore: FilesStore, folderPath: string) {
  return filesStore.isFolderLocked(folderPath);
}
