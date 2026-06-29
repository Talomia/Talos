/**
 * Shared constants for the chat module.
 *
 * Centralising "magic numbers" here avoids duplication across BaseChat, ChatBox,
 * and any future components that deal with chat input or file uploads.
 */

/** Maximum image upload size in bytes (5 MB). */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/** Human-readable label for MAX_IMAGE_SIZE_BYTES. */
export const MAX_IMAGE_SIZE_LABEL = '5MB';

/** Minimum height (px) for the chat textarea. */
export const TEXTAREA_MIN_HEIGHT = 76;

/** Accepted MIME types for image uploads. */
export const ACCEPTED_IMAGE_TYPES = 'image/*';

/** Formats a file size into a user-readable string, e.g. "3.2MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
