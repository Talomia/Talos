import { logger } from '~/utils/logger';

const QUOTA_ERROR_NAMES = ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'];

function isQuotaError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return QUOTA_ERROR_NAMES.includes(error.name) || error.code === 22;
  }
  return false;
}

/**
 * Safely write to localStorage with quota error detection.
 * Returns true if write succeeded, false if quota was exceeded.
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (isQuotaError(error)) {
      logger.warn(`Storage quota exceeded writing key '${key}' (${(value.length / 1024).toFixed(1)}KB). Data was NOT saved.`);
      return false;
    }
    logger.error('localStorage.setItem failed:', error);
    return false;
  }
}

/**
 * Check if an IDB error is a quota error and log appropriately.
 */
export function handleIDBQuotaError(error: unknown, context: string): boolean {
  if (error instanceof DOMException && isQuotaError(error)) {
    logger.warn(`IndexedDB quota exceeded during ${context}. Data was NOT saved.`);
    return true;
  }
  return false;
}
