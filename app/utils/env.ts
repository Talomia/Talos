import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('env');

/** Get a required environment variable, logging a warning if missing. */
export function getEnvVar(key: string, fallback?: string): string {
  const value = import.meta.env[key] as string | undefined;

  if (value !== undefined && value !== '') {
    return value;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  logger.warn(`Environment variable ${key} is not set`);

  return '';
}

/** Check if an environment variable is truthy (exists and not empty). */
export function hasEnvVar(key: string): boolean {
  const value = import.meta.env[key] as string | undefined;
  return value !== undefined && value !== '';
}
