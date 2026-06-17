const MAX_BUILD_OUTPUT_CHARS = 4000;

export function formatBuildFailureOutput(output?: string) {
  const trimmed = output?.trim();

  if (!trimmed) {
    return 'Build failed with no output captured.';
  }

  if (trimmed.length <= MAX_BUILD_OUTPUT_CHARS) {
    return trimmed;
  }

  return `Build output (truncated):\n${trimmed.slice(-MAX_BUILD_OUTPUT_CHARS)}`;
}

/**
 * Sanitizes a repository name to be valid for GitHub/GitLab.
 * - Lowercases the name
 * - Replaces spaces/underscores with hyphens
 * - Removes special characters
 * - Collapses multiple hyphens
 * - Strips leading/trailing hyphens
 * - Limits to 100 characters
 * - Falls back to 'my-project' if empty
 */
export const sanitizeRepoName = (name: string): string => {
  return (
    name
      .toLowerCase()
      // Replace spaces and underscores with hyphens
      .replace(/[\s_]+/g, '-')
      // Remove special characters except hyphens and alphanumeric
      .replace(/[^a-z0-9-]/g, '')
      // Remove multiple consecutive hyphens
      .replace(/-+/g, '-')
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, '')
      // Ensure it's not empty and has reasonable length
      .substring(0, 100) || 'my-project'
  );
};

/**
 * Classifies a deployment error into a user-friendly category.
 */
export interface DeploymentError {
  type: 'auth' | 'rate_limit' | 'conflict' | 'not_found' | 'validation' | 'network' | 'unknown';
  message: string;
  isRetryable: boolean;
}

export const classifyDeploymentError = (error: unknown): DeploymentError => {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('401') || message.includes('unauthorized') || message.includes('authentication')) {
      return { type: 'auth', message: 'Authentication failed. Please reconnect your account.', isRetryable: false };
    }

    if (message.includes('403') || message.includes('rate limit') || message.includes('forbidden')) {
      return { type: 'rate_limit', message: 'Rate limit exceeded. Please wait and try again.', isRetryable: true };
    }

    if (message.includes('409') || message.includes('conflict') || message.includes('already exists')) {
      return {
        type: 'conflict',
        message: 'A resource conflict occurred. The repository may already exist.',
        isRetryable: false,
      };
    }

    if (message.includes('404') || message.includes('not found')) {
      return { type: 'not_found', message: 'Resource not found.', isRetryable: false };
    }

    if (message.includes('422') || message.includes('validation')) {
      return { type: 'validation', message: error.message, isRetryable: false };
    }

    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return { type: 'network', message: 'Network error. Check your connection and try again.', isRetryable: true };
    }

    return { type: 'unknown', message: error.message, isRetryable: true };
  }

  return { type: 'unknown', message: 'An unexpected error occurred.', isRetryable: true };
};

/**
 * Formats a file size in bytes to a human-readable string.
 * e.g. 1024 → "1.0 KB", 1048576 → "1.0 MB"
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes >= 1048576) {
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
};
