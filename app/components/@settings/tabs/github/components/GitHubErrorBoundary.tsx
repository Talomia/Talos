import React from 'react';
import { ErrorBoundary } from '~/components/ui/ErrorBoundary';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('GitHubErrorBoundary');

/**
 * GitHub-specific error boundary — thin wrapper around the shared ErrorBoundary.
 */
export function GitHubErrorBoundary({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary panelName="the GitHub integration">{children}</ErrorBoundary>;
}

/**
 * Higher-order component for wrapping components with the GitHub error boundary.
 */
export function withGitHubErrorBoundary<P extends object>(wrappedComponent: React.ComponentType<P>) {
  return function WrappedComponent(props: P) {
    return <GitHubErrorBoundary>{React.createElement(wrappedComponent, props)}</GitHubErrorBoundary>;
  };
}

/**
 * Hook for handling async errors in GitHub operations.
 */
export function useGitHubErrorHandler() {
  const handleError = React.useCallback((error: unknown, context?: string) => {
    logger.error(`GitHub Error ${context ? `(${context})` : ''}:`, error);

    return error instanceof Error ? error.message : 'An unknown error occurred';
  }, []);

  return { handleError };
}
