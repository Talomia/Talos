import { memo, useMemo } from 'react';
import { diffLines, type Change } from 'diff';
import { FullscreenButton } from './FullscreenComponents';

// Componente para exibir informações sobre o arquivo
export const FileInfo = memo(
  ({
    filename,
    hasChanges,
    onToggleFullscreen,
    isFullscreen,
    beforeCode,
    afterCode,
  }: {
    filename: string;
    hasChanges: boolean;
    onToggleFullscreen: () => void;
    isFullscreen: boolean;
    beforeCode: string;
    afterCode: string;
  }) => {
    // Calculate additions and deletions from the current document
    const { additions, deletions } = useMemo(() => {
      if (!hasChanges) {
        return { additions: 0, deletions: 0 };
      }

      const changes = diffLines(beforeCode, afterCode, {
        newlineIsToken: false,
        ignoreWhitespace: true,
        ignoreCase: false,
      });

      return changes.reduce(
        (acc: { additions: number; deletions: number }, change: Change) => {
          if (change.added) {
            acc.additions += change.value.split('\n').length;
          }

          if (change.removed) {
            acc.deletions += change.value.split('\n').length;
          }

          return acc;
        },
        { additions: 0, deletions: 0 },
      );
    }, [hasChanges, beforeCode, afterCode]);

    const showStats = additions > 0 || deletions > 0;

    return (
      <div className="flex items-center bg-bolt-elements-background-depth-1 p-2 text-sm text-bolt-elements-textPrimary shrink-0">
        <div className="i-ph:file mr-2 h-4 w-4 shrink-0" />
        <span className="truncate">{filename}</span>
        <span className="ml-auto shrink-0 flex items-center gap-2">
          {hasChanges ? (
            <>
              {showStats && (
                <div className="flex items-center gap-1 text-xs">
                  {additions > 0 && <span className="text-green-700 dark:text-green-500">+{additions}</span>}
                  {deletions > 0 && <span className="text-red-700 dark:text-red-500">-{deletions}</span>}
                </div>
              )}
              <span className="text-yellow-600 dark:text-yellow-400">Modified</span>
              <span className="text-bolt-elements-textTertiary text-xs">{new Date().toLocaleTimeString()}</span>
            </>
          ) : (
            <span className="text-green-700 dark:text-green-400">No Changes</span>
          )}
          <FullscreenButton onClick={onToggleFullscreen} isFullscreen={isFullscreen} />
        </span>
      </div>
    );
  },
);
