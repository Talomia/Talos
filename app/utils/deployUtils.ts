/**
 * Shared utility functions for deploy providers.
 */

/**
 * Set of file extensions that should be read as binary (base64) rather than UTF-8
 * to prevent data corruption during deployment.
 */
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.svg',
  '.webp',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.wasm',
  '.mp3',
  '.mp4',
  '.webm',
  '.ogg',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
]);

/**
 * Determines whether a file should be treated as binary based on its extension.
 * Binary files must be read with base64 encoding to avoid corruption.
 */
export function isBinaryFile(filename: string): boolean {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export interface FileContent {
  content: string;
  isBinary: boolean;
}
