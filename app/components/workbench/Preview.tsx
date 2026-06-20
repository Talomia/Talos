import { memo, useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    if (!activePreview) {
      setIframeUrl(undefined);
      setDisplayPath('/');

      return;
    }

    const { baseUrl } = activePreview;
    setIframeUrl(baseUrl);
    setDisplayPath('/');
  }, [activePreview]);

  useEffect(() => {
    if (previews.length > 1 && !hasSelectedPreview.current) {
      const minPortIndex = previews.reduce(findMinPortIndex, 0);
      setActivePreviewIndex(minPortIndex);
    }
  }, [previews]);

  const reloadPreview = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

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

        navigator.clipboard.writeText(element.displayText).then(() => {
          setSelectedElement?.(element);
        });
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
          {activePreview ? (
            <>
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
                  sandbox="allow-scripts allow-forms allow-popups allow-modals allow-storage-access-by-user-activation allow-same-origin"
                  allow="geolocation; ch-ua-full-version-list; cross-origin-isolated; screen-wake-lock; publickey-credentials-get; shared-storage-select-url; ch-ua-arch; bluetooth; compute-pressure; ch-prefers-reduced-transparency; deferred-fetch; usb; ch-save-data; publickey-credentials-create; shared-storage; deferred-fetch-minimal; run-ad-auction; ch-ua-form-factors; ch-downlink; otp-credentials; payment; ch-ua; ch-ua-model; ch-ect; autoplay; camera; private-state-token-issuance; accelerometer; ch-ua-platform-version; idle-detection; private-aggregation; interest-cohort; ch-viewport-height; local-fonts; ch-ua-platform; midi; ch-ua-full-version; xr-spatial-tracking; clipboard-read; gamepad; display-capture; keyboard-map; join-ad-interest-group; ch-width; ch-prefers-reduced-motion; browsing-topics; encrypted-media; gyroscope; serial; ch-rtt; ch-ua-mobile; window-management; unload; ch-dpr; ch-prefers-color-scheme; ch-ua-wow64; attribution-reporting; fullscreen; identity-credentials-get; private-state-token-redemption; hid; ch-ua-bitness; storage-access; sync-xhr; ch-device-memory; ch-viewport-width; picture-in-picture; magnetometer; clipboard-write; microphone"
                />
              )}
              <ScreenshotSelector
                isSelectionMode={isSelectionMode}
                setIsSelectionMode={setIsSelectionMode}
                containerRef={iframeRef}
              />
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
