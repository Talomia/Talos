import React, { Component } from 'react';
import type { ReactNode } from 'react';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ErrorBoundary');

interface ErrorBoundaryProps {
  children: ReactNode;

  /** Custom fallback to render on error */
  fallback?: ReactNode;

  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;

  /** Human-readable panel name for error messages */
  panelName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Reusable error boundary that prevents crashes from propagating.
 * Wrap high-risk panels (Chat, Workbench, etc.) with this component
 * so a failure in one panel doesn't take down the entire app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const panelName = this.props.panelName || 'Component';
    logger.error(`[${panelName}] Uncaught error:`, error);
    logger.debug(`[${panelName}] Component stack:`, errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  private _handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const panelName = this.props.panelName || 'this section';

      return (
        <div className={classNames('flex flex-col items-center justify-center p-8 h-full', 'text-center')}>
          <div className="w-16 h-16 mb-4 text-red-400">
            <div className="i-ph:warning-circle text-5xl" />
          </div>
          <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-2">Something went wrong</h3>
          <p className="text-sm text-bolt-elements-textSecondary mb-6 max-w-md">
            An unexpected error occurred in {panelName}. You can try again or refresh the page.
          </p>
          <div className="flex gap-3">
            <button
              onClick={this._handleRetry}
              className={classNames(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-accent-500 text-white',
                'hover:bg-accent-600',
                'transition-colors duration-200',
              )}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className={classNames(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary',
                'hover:bg-bolt-elements-background-depth-3',
                'transition-colors duration-200',
              )}
            >
              Refresh Page
            </button>
          </div>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mt-6 text-left w-full max-w-lg">
              <summary className="cursor-pointer text-sm text-red-400 hover:text-red-300">
                Error Details (dev only)
              </summary>
              <pre className="mt-2 p-3 bg-red-500/10 rounded-lg text-xs text-red-300 overflow-auto max-h-40">
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
