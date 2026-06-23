import { memo, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  detectedErrors,
  dismissError,
  clearErrors,
  autoFixInProgress,
  autoFixAttempts,
  MAX_AUTO_FIX_ATTEMPTS,
} from '~/lib/stores/errors';
import { classNames } from '~/utils/classNames';

export const ErrorOverlay = memo(() => {
  const errors = useStore(detectedErrors);
  const isFixing = useStore(autoFixInProgress);
  const attempts = useStore(autoFixAttempts);
  const [minimized, setMinimized] = useState(false);

  if (errors.length === 0) {
    return null;
  }

  if (minimized) {
    // Show a small red badge in the bottom-right corner
    return (
      <button
        onClick={() => setMinimized(false)}
        className="absolute bottom-3 right-3 z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-red-500/90 text-white text-xs font-medium shadow-lg backdrop-blur-sm hover:bg-red-600 transition-colors"
      >
        <div className="i-ph:warning-circle text-sm" />
        {errors.length} error{errors.length > 1 ? 's' : ''}
      </button>
    );
  }

  // Full overlay
  return (
    <div className="absolute inset-x-0 bottom-0 z-50 max-h-[40%] flex flex-col bg-red-950/95 backdrop-blur-sm border-t border-red-500/30 text-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-red-500/20">
        <div className="flex items-center gap-2">
          <div className="i-ph:warning-circle text-red-400" />
          <span className="text-sm font-medium">
            {errors.length} error{errors.length > 1 ? 's' : ''} detected
          </span>
          {isFixing && (
            <span className="text-xs text-amber-300 flex items-center gap-1">
              <div className="i-ph:spinner animate-spin" /> Auto-fixing... (attempt {attempts}/{MAX_AUTO_FIX_ATTEMPTS})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => clearErrors()}
            className="text-xs px-2 py-1 rounded bg-red-800/50 hover:bg-red-800 transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={() => setMinimized(true)}
            className="text-xs px-2 py-1 rounded bg-red-800/50 hover:bg-red-800 transition-colors"
          >
            Minimize
          </button>
        </div>
      </div>
      {/* Error list */}
      <div className="overflow-y-auto px-4 py-2 space-y-2">
        {errors.map((error) => (
          <div key={error.id} className="flex items-start gap-2 text-xs">
            <div
              className={classNames(
                'mt-0.5 shrink-0',
                error.severity === 'fatal' ? 'i-ph:x-circle text-red-400' : 'i-ph:warning text-amber-400',
              )}
            />
            <div className="flex-1 min-w-0">
              <div className="font-mono break-all">{error.message}</div>
              {error.file && (
                <div className="text-red-300/70 mt-0.5">
                  {error.file}
                  {error.line ? `:${error.line}` : ''}
                </div>
              )}
            </div>
            <button
              onClick={() => dismissError(error.id)}
              className="shrink-0 i-ph:x text-red-400/50 hover:text-red-300"
            />
          </div>
        ))}
      </div>
    </div>
  );
});
