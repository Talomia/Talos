import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import type { Highlighter } from 'shiki';
import { useStore } from '@nanostores/react';
import { themeStore } from '~/lib/stores/theme';
import type { CodeComparisonProps } from './diffProcessing';
import { processChanges } from './diffProcessing';
import { diffPanelStyles } from './diffViewStyles';
import { getSharedHighlighter } from './shikiHighlighter';
import { FullscreenOverlay } from './FullscreenComponents';
import { CodeLine } from './CodeLine';
import { NoChangesView, renderContentWarning } from './NoChangesView';
import { FileInfo } from './FileInfo';

// Otimização do processamento de diferenças com memoização
export const InlineDiffComparison = memo(({ beforeCode, afterCode, filename, language }: CodeComparisonProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Use state to hold the shared highlighter instance
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);
  const theme = useStore(themeStore);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const { unifiedBlocks, hasChanges, isBinary, error } = useMemo(
    () => processChanges(beforeCode, afterCode),
    [beforeCode, afterCode],
  );

  useEffect(() => {
    // Fetch the shared highlighter instance
    getSharedHighlighter()
      .then(setHighlighter)
      .catch(() => {});

    /*
     * No cleanup needed here for the highlighter instance itself,
     * as it's managed globally. Shiki instances don't typically
     * need disposal unless you are dynamically loading/unloading themes/languages.
     * If you were dynamically loading, you might need a more complex
     * shared instance manager with reference counting or similar.
     * For static themes/langs, a single instance is sufficient.
     */
  }, []); // Empty dependency array ensures this runs only once on mount

  if (isBinary || error) {
    return renderContentWarning(isBinary ? 'binary' : 'error');
  }

  // Render a loading state or null while highlighter is not ready
  if (!highlighter) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-ui-textTertiary">Loading diff...</div>
      </div>
    );
  }

  return (
    <FullscreenOverlay isFullscreen={isFullscreen}>
      <div className="w-full h-full flex flex-col">
        <FileInfo
          filename={filename}
          hasChanges={hasChanges}
          onToggleFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
          beforeCode={beforeCode}
          afterCode={afterCode}
        />
        <div className={diffPanelStyles}>
          {hasChanges ? (
            <div className="overflow-x-auto min-w-full">
              {unifiedBlocks.map((block, index) => (
                <CodeLine
                  key={`${block.lineNumber}-${index}`}
                  lineNumber={block.lineNumber}
                  content={block.content}
                  type={block.type}
                  highlighter={highlighter} // Pass the shared instance
                  language={language}
                  block={block}
                  theme={theme}
                />
              ))}
            </div>
          ) : (
            <NoChangesView beforeCode={beforeCode} language={language} highlighter={highlighter} theme={theme} />
          )}
        </div>
      </div>
    </FullscreenOverlay>
  );
});
