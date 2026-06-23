import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { parseConsoleError } from '~/lib/runtime/error-detector';
import { addError } from '~/lib/stores/errors';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { ScreenshotSelector } from '~/components/workbench/ScreenshotSelector';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';
import type { ElementInfo } from '~/components/workbench/Inspector';
import {
  WINDOW_SIZES,
  findMinPortIndex,
  getFramePadding,
  getFrameColor,
  type WindowSize,
} from '~/components/workbench/previewUtils';
import { usePreviewResize } from '~/components/workbench/usePreviewResize';
import { PreviewToolbar } from '~/components/workbench/PreviewToolbar';
import { DeviceFramePreview } from '~/components/workbench/DeviceFramePreview';
import { ResizeHandle } from '~/components/workbench/ResizeHandle';
import { ErrorOverlay } from '~/components/workbench/ErrorOverlay';

interface PreviewProps {
  setSelectedElement?: (element: ElementInfo | null) => void;
}

export const Preview = memo(({ setSelectedElement }: PreviewProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [isPortDropdownOpen, setIsPortDropdownOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hasSelectedPreview = useRef(false);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];
  const [displayPath, setDisplayPath] = useState('/');
  const [iframeUrl, setIframeUrl] = useState<string | undefined>();
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isInspectorMode, setIsInspectorMode] = useState(false);
  const [isDeviceModeOn, setIsDeviceModeOn] = useState(false);

  // Fix 6: Track iframe loading and error states
  const [iframeLoading, setIframeLoading] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);

  // Fix 5: Track URL validation warnings
  const [urlWarning, setUrlWarning] = useState<string | null>(null);

  const { widthPercent, currentWidth, startResizing, resizingState } = usePreviewResize({
    isDeviceModeOn,
    containerRef,
  });

  const [isWindowSizeDropdownOpen, setIsWindowSizeDropdownOpen] = useState(false);
  const [selectedWindowSize, setSelectedWindowSize] = useState<WindowSize>(WINDOW_SIZES[0]);
  const [isLandscape, setIsLandscape] = useState(false);
  const [showDeviceFrame, setShowDeviceFrame] = useState(true);
  const [showDeviceFrameInPreview, setShowDeviceFrameInPreview] = useState(false);
  const expoUrl = useStore(expoUrlAtom);
  const [isExpoQrModalOpen, setIsExpoQrModalOpen] = useState(false);

  /*
   * Fix 5: Validate preview URLs before loading them in the iframe.
   * Only localhost and WebContainer URLs are allowed. This prevents
   * the preview iframe from navigating to arbitrary external sites.
   */
  const isValidPreviewUrl = useCallback((url: string | undefined): boolean => {
    if (!url) {
      return false;
    }

    try {
      const parsed = new URL(url);

      // Allow localhost URLs (any port)
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return true;
      }

      // Allow WebContainer URLs (*.webcontainer-api.io, *.local-credentialless.webcontainer-api.io, etc.)
      if (parsed.hostname.endsWith('.webcontainer-api.io') || parsed.hostname.endsWith('.webcontainer.io')) {
        return true;
      }

      // Allow StackBlitz preview URLs
      if (parsed.hostname.endsWith('.local.webcontainer.io') || parsed.hostname.endsWith('.stackblitz.io')) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!activePreview) {
      setIframeUrl(undefined);
      setDisplayPath('/');
      setUrlWarning(null);
      setIframeError(null);

      return;
    }

    const { baseUrl } = activePreview;

    // Fix 5: Validate the URL before setting it
    if (isValidPreviewUrl(baseUrl)) {
      setIframeUrl(baseUrl);
      setUrlWarning(null);
      setIframeLoading(true);
      setIframeError(null);
    } else {
      setIframeUrl(undefined);
      setUrlWarning(`Blocked URL: "${baseUrl}" is not a recognized localhost or WebContainer URL.`);
    }

    setDisplayPath('/');
  }, [activePreview, isValidPreviewUrl]);

  useEffect(() => {
    if (previews.length > 1 && !hasSelectedPreview.current) {
      const minPortIndex = previews.reduce(findMinPortIndex, 0);
      setActivePreviewIndex(minPortIndex);
    }
  }, [previews]);

  const reloadPreview = () => {
    if (iframeRef.current) {
      setIframeLoading(true);
      setIframeError(null);
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  // Fix 6: Iframe load/error handlers
  const handleIframeLoad = useCallback(() => {
    setIframeLoading(false);
    setIframeError(null);
  }, []);

  const handleIframeError = useCallback(() => {
    setIframeLoading(false);
    setIframeError('Preview failed to load. The dev server may still be starting — try reloading.');
  }, []);

  const toggleFullscreen = async () => {
    if (!isFullscreen && containerRef.current) {
      await containerRef.current.requestFullscreen();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleDeviceMode = () => {
    setIsDeviceModeOn((prev) => !prev);
  };

  // Effect to handle color scheme changes
  useEffect(() => {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleColorSchemeChange = () => {
      // Force a re-render when color scheme changes
      if (showDeviceFrameInPreview) {
        setShowDeviceFrameInPreview(true);
      }
    };

    darkModeMediaQuery.addEventListener('change', handleColorSchemeChange);

    return () => {
      darkModeMediaQuery.removeEventListener('change', handleColorSchemeChange);
    };
  }, [showDeviceFrameInPreview]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const allowedOrigins = [window.location.origin];

      // Allow WebContainer origins (used by StackBlitz/WebContainer runtime)
      if (activePreview?.baseUrl) {
        try {
          allowedOrigins.push(new URL(activePreview.baseUrl).origin);
        } catch {
          // ignore invalid URL
        }
      }

      if (!allowedOrigins.includes(event.origin) && event.origin !== '') {
        return;
      }

      if (event.data.type === 'INSPECTOR_READY') {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            {
              type: 'INSPECTOR_ACTIVATE',
              active: isInspectorMode,
            },
            '*',
          );
        }
      } else if (event.data.type === 'INSPECTOR_CLICK') {
        const element = event.data.elementInfo;

        navigator.clipboard
          .writeText(element.displayText)
          .then(() => {
            setSelectedElement?.(element);
          })
          .catch(() => {
            // Clipboard write may fail without permissions — still update selection
            setSelectedElement?.(element);
          });
      } else if (
        event.data.type === 'preview-error' ||
        event.data.type === 'preview-console-error' ||
        event.data.type === 'PREVIEW_UNCAUGHT_EXCEPTION' ||
        event.data.type === 'PREVIEW_UNHANDLED_REJECTION'
      ) {
        const errorData = event.data;
        const detected = parseConsoleError({
          message: errorData.message || 'Unknown preview error',
          filename: errorData.filename,
          lineno: errorData.lineno,
          colno: errorData.colno,
          stack: errorData.stack,
        });
        addError(detected);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, [isInspectorMode]);

  const toggleInspectorMode = () => {
    const newInspectorMode = !isInspectorMode;
    setIsInspectorMode(newInspectorMode);

    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'INSPECTOR_ACTIVATE',
          active: newInspectorMode,
        },
        '*',
      );
    }
  };

  const framePadding = getFramePadding(selectedWindowSize, isLandscape);
  const frameColor = getFrameColor();

  return (
    <div ref={containerRef} className={`w-full h-full flex flex-col relative`}>
      {isPortDropdownOpen && (
        <div className="z-iframe-overlay w-full h-full absolute" onClick={() => setIsPortDropdownOpen(false)} />
      )}
      <PreviewToolbar
        activePreviewIndex={activePreviewIndex}
        setActivePreviewIndex={setActivePreviewIndex}
        isPortDropdownOpen={isPortDropdownOpen}
        setIsPortDropdownOpen={setIsPortDropdownOpen}
        setHasSelectedPreview={(value) => (hasSelectedPreview.current = value)}
        previews={previews}
        displayPath={displayPath}
        setDisplayPath={setDisplayPath}
        activePreview={activePreview}
        setIframeUrl={setIframeUrl}
        reloadPreview={reloadPreview}
        isSelectionMode={isSelectionMode}
        setIsSelectionMode={setIsSelectionMode}
        isDeviceModeOn={isDeviceModeOn}
        toggleDeviceMode={toggleDeviceMode}
        expoUrl={expoUrl}
        isExpoQrModalOpen={isExpoQrModalOpen}
        setIsExpoQrModalOpen={setIsExpoQrModalOpen}
        isLandscape={isLandscape}
        setIsLandscape={setIsLandscape}
        showDeviceFrameInPreview={showDeviceFrameInPreview}
        setShowDeviceFrameInPreview={setShowDeviceFrameInPreview}
        isInspectorMode={isInspectorMode}
        toggleInspectorMode={toggleInspectorMode}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
        isWindowSizeDropdownOpen={isWindowSizeDropdownOpen}
        setIsWindowSizeDropdownOpen={setIsWindowSizeDropdownOpen}
        selectedWindowSize={selectedWindowSize}
        setSelectedWindowSize={setSelectedWindowSize}
        showDeviceFrame={showDeviceFrame}
        setShowDeviceFrame={setShowDeviceFrame}
      />

      <div className="flex-1 border-t border-ui-borderColor flex justify-center items-center overflow-auto">
        <div
          style={{
            width: isDeviceModeOn ? (showDeviceFrameInPreview ? '100%' : `${widthPercent}%`) : '100%',
            height: '100%',
            overflow: 'auto',
            background: 'var(--ui-background-depth-1)',
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {/* Fix 5: Show URL validation warning */}
          {urlWarning ? (
            <div className="flex w-full h-full justify-center items-center bg-ui-background-depth-1 text-ui-textPrimary">
              <div className="flex flex-col items-center gap-2 p-4 max-w-md text-center">
                <div className="i-ph:warning-circle text-3xl text-yellow-500" />
                <p className="text-sm text-ui-textSecondary">{urlWarning}</p>
              </div>
            </div>
          ) : activePreview ? (
            <>
              {/* Fix 6: Loading spinner overlay */}
              {iframeLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-ui-background-depth-1/80">
                  <div className="flex flex-col items-center gap-3">
                    <div className="i-svg-spinners:90-ring-with-bg text-4xl text-ui-accentColor" />
                    <p className="text-sm text-ui-textSecondary">Loading preview…</p>
                  </div>
                </div>
              )}
              {/* Fix 6: Error state display */}
              {iframeError && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-ui-background-depth-1/90">
                  <div className="flex flex-col items-center gap-3 p-4 max-w-md text-center">
                    <div className="i-ph:x-circle text-4xl text-red-500" />
                    <p className="text-sm text-ui-textSecondary">{iframeError}</p>
                    <button
                      onClick={reloadPreview}
                      className="px-4 py-1.5 text-sm rounded-md bg-ui-accentColor text-white hover:opacity-90 transition-opacity"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}
              {isDeviceModeOn && showDeviceFrameInPreview ? (
                <DeviceFramePreview
                  iframeRef={iframeRef}
                  iframeUrl={iframeUrl}
                  selectedWindowSize={selectedWindowSize}
                  isLandscape={isLandscape}
                  frameColor={frameColor}
                  framePadding={framePadding}
                />
              ) : (
                <iframe
                  ref={iframeRef}
                  title="preview"
                  className="border-none w-full h-full bg-ui-background-depth-1"
                  src={iframeUrl}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                />
              )}
              <ScreenshotSelector
                isSelectionMode={isSelectionMode}
                setIsSelectionMode={setIsSelectionMode}
                containerRef={iframeRef}
              />
              <ErrorOverlay />
            </>
          ) : (
            <div className="flex w-full h-full justify-center items-center bg-ui-background-depth-1 text-ui-textPrimary">
              No preview available
            </div>
          )}

          {isDeviceModeOn && !showDeviceFrameInPreview && (
            <>
              {/* Width indicator */}
              <div
                style={{
                  position: 'absolute',
                  top: '-25px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'var(--ui-background-depth-3, rgba(0,0,0,0.7))',
                  color: 'var(--ui-textPrimary, white)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  pointerEvents: 'none',
                  opacity: resizingState.current.isResizing ? 1 : 0,
                  transition: 'opacity 0.3s',
                }}
              >
                {currentWidth}px
              </div>

              <ResizeHandle side="left" onPointerDown={startResizing} />
              <ResizeHandle side="right" onPointerDown={startResizing} />
            </>
          )}
        </div>
      </div>
    </div>
  );
});
