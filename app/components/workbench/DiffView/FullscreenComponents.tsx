import { memo } from 'react';

interface FullscreenButtonProps {
  onClick: () => void;
  isFullscreen: boolean;
}

export const FullscreenButton = memo(({ onClick, isFullscreen }: FullscreenButtonProps) => (
  <button
    onClick={onClick}
    className="ml-4 p-1 rounded hover:bg-ui-background-depth-3 text-ui-textTertiary hover:text-ui-textPrimary transition-colors"
    title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
  >
    <div className={isFullscreen ? 'i-ph:corners-in' : 'i-ph:corners-out'} />
  </button>
));

export const FullscreenOverlay = memo(
  ({ isFullscreen, children }: { isFullscreen: boolean; children: React.ReactNode }) => {
    if (!isFullscreen) {
      return <>{children}</>;
    }

    return (
      <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-6">
        <div className="w-full h-full max-w-[90vw] max-h-[90vh] bg-ui-background-depth-2 rounded-lg border border-ui-borderColor shadow-xl overflow-hidden">
          {children}
        </div>
      </div>
    );
  },
);
