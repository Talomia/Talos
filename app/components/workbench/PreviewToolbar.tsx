import { memo, useRef } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { PortDropdown } from '~/components/workbench/PortDropdown';
import { ExpoQrModal } from '~/components/workbench/ExpoQrModal';
import { createScopedLogger } from '~/utils/logger';
import { WINDOW_SIZES, openDeviceFramePopup, type WindowSize } from '~/components/workbench/previewUtils';
import { getFrameColor } from '~/components/workbench/previewUtils';
import type { PreviewInfo } from '~/lib/stores/previews';

const logger = createScopedLogger('Preview');

interface PreviewToolbarProps {
  // Port / address bar
  activePreviewIndex: number;
  setActivePreviewIndex: (index: number) => void;
  isPortDropdownOpen: boolean;
  setIsPortDropdownOpen: (value: boolean) => void;
  setHasSelectedPreview: (value: boolean) => void;
  previews: PreviewInfo[];
  displayPath: string;
  setDisplayPath: (path: string) => void;
  activePreview: PreviewInfo | undefined;
  setIframeUrl: (url: string) => void;

  // Toolbar actions
  reloadPreview: () => void;
  isSelectionMode: boolean;
  setIsSelectionMode: (value: boolean) => void;
  isDeviceModeOn: boolean;
  toggleDeviceMode: () => void;
  expoUrl: string | null;
  isExpoQrModalOpen: boolean;
  setIsExpoQrModalOpen: (value: boolean) => void;
  isLandscape: boolean;
  setIsLandscape: (value: boolean) => void;
  showDeviceFrameInPreview: boolean;
  setShowDeviceFrameInPreview: (value: boolean) => void;
  isInspectorMode: boolean;
  toggleInspectorMode: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;

  // Window size dropdown
  isWindowSizeDropdownOpen: boolean;
  setIsWindowSizeDropdownOpen: (value: boolean) => void;
  selectedWindowSize: WindowSize;
  setSelectedWindowSize: (size: WindowSize) => void;
  showDeviceFrame: boolean;
  setShowDeviceFrame: (value: boolean) => void;
}

export const PreviewToolbar = memo(
  ({
    activePreviewIndex,
    setActivePreviewIndex,
    isPortDropdownOpen,
    setIsPortDropdownOpen,
    setHasSelectedPreview,
    previews,
    displayPath,
    setDisplayPath,
    activePreview,
    setIframeUrl,
    reloadPreview,
    isSelectionMode,
    setIsSelectionMode,
    isDeviceModeOn,
    toggleDeviceMode,
    expoUrl,
    isExpoQrModalOpen,
    setIsExpoQrModalOpen,
    isLandscape,
    setIsLandscape,
    showDeviceFrameInPreview,
    setShowDeviceFrameInPreview,
    isInspectorMode,
    toggleInspectorMode,
    isFullscreen,
    toggleFullscreen,
    isWindowSizeDropdownOpen,
    setIsWindowSizeDropdownOpen,
    selectedWindowSize,
    setSelectedWindowSize,
    showDeviceFrame,
    setShowDeviceFrame,
  }: PreviewToolbarProps) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const openInNewWindow = (size: WindowSize) => {
      if (activePreview?.baseUrl) {
        openDeviceFramePopup({
          baseUrl: activePreview.baseUrl,
          size,
          isLandscape,
          showDeviceFrame,
          getFrameColor,
        });
      }
    };

    const openInNewTab = () => {
      if (activePreview?.baseUrl) {
        window.open(activePreview?.baseUrl, '_blank');
      }
    };

    return (
      <div className="bg-ui-background-depth-2 p-2 flex items-center gap-2">
        <div className="flex items-center gap-2">
          <IconButton icon="i-ph:arrow-clockwise" onClick={reloadPreview} />
          <IconButton
            icon="i-ph:selection"
            onClick={() => setIsSelectionMode(!isSelectionMode)}
            className={isSelectionMode ? 'bg-ui-background-depth-3' : ''}
          />
        </div>

        <div className="flex-grow flex items-center gap-1 bg-ui-preview-addressBar-background border border-ui-borderColor text-ui-preview-addressBar-text rounded-full px-1 py-1 text-sm hover:bg-ui-preview-addressBar-backgroundHover hover:focus-within:bg-ui-preview-addressBar-backgroundActive focus-within:bg-ui-preview-addressBar-backgroundActive focus-within-border-ui-borderColorActive focus-within:text-ui-preview-addressBar-textActive">
          <PortDropdown
            activePreviewIndex={activePreviewIndex}
            setActivePreviewIndex={setActivePreviewIndex}
            isDropdownOpen={isPortDropdownOpen}
            setHasSelectedPreview={setHasSelectedPreview}
            setIsDropdownOpen={setIsPortDropdownOpen}
            previews={previews}
          />
          <input
            title="URL Path"
            ref={inputRef}
            className="w-full bg-transparent outline-none"
            type="text"
            value={displayPath}
            onChange={(event) => {
              setDisplayPath(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && activePreview) {
                let targetPath = displayPath.trim();

                if (!targetPath.startsWith('/')) {
                  targetPath = '/' + targetPath;
                }

                const fullUrl = activePreview.baseUrl + targetPath;
                setIframeUrl(fullUrl);
                setDisplayPath(targetPath);

                if (inputRef.current) {
                  inputRef.current.blur();
                }
              }
            }}
            disabled={!activePreview}
          />
        </div>

        <div className="flex items-center gap-2">
          <IconButton
            icon="i-ph:devices"
            onClick={toggleDeviceMode}
            title={isDeviceModeOn ? 'Switch to Responsive Mode' : 'Switch to Device Mode'}
          />

          {expoUrl && <IconButton icon="i-ph:qr-code" onClick={() => setIsExpoQrModalOpen(true)} title="Show QR" />}

          <ExpoQrModal open={isExpoQrModalOpen} onClose={() => setIsExpoQrModalOpen(false)} />

          {isDeviceModeOn && (
            <>
              <IconButton
                icon="i-ph:device-rotate"
                onClick={() => setIsLandscape(!isLandscape)}
                title={isLandscape ? 'Switch to Portrait' : 'Switch to Landscape'}
              />
              <IconButton
                icon={showDeviceFrameInPreview ? 'i-ph:device-mobile' : 'i-ph:device-mobile-slash'}
                onClick={() => setShowDeviceFrameInPreview(!showDeviceFrameInPreview)}
                title={showDeviceFrameInPreview ? 'Hide Device Frame' : 'Show Device Frame'}
              />
            </>
          )}
          <IconButton
            icon="i-ph:cursor-click"
            onClick={toggleInspectorMode}
            className={isInspectorMode ? 'bg-ui-background-depth-3 !text-ui-item-contentAccent' : ''}
            title={isInspectorMode ? 'Disable Element Inspector' : 'Enable Element Inspector'}
          />
          <IconButton
            icon={isFullscreen ? 'i-ph:arrows-in' : 'i-ph:arrows-out'}
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
          />

          <div className="flex items-center relative">
            <IconButton
              icon="i-ph:list"
              onClick={() => setIsWindowSizeDropdownOpen(!isWindowSizeDropdownOpen)}
              title="New Window Options"
            />

            {isWindowSizeDropdownOpen && (
              <>
                <div className="fixed inset-0 z-50" onClick={() => setIsWindowSizeDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 min-w-[240px] max-h-[400px] overflow-y-auto bg-white dark:bg-black rounded-xl shadow-2xl border border-[#E5E7EB] dark:border-[rgba(255,255,255,0.1)] overflow-hidden">
                  <div className="p-3 border-b border-[#E5E7EB] dark:border-[rgba(255,255,255,0.1)]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-[#111827] dark:text-gray-300">Window Options</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        className={`flex w-full justify-between items-center text-start bg-transparent text-xs text-ui-textTertiary hover:text-ui-textPrimary`}
                        onClick={() => {
                          openInNewTab();
                        }}
                      >
                        <span>Open in new tab</span>
                        <div className="i-ph:arrow-square-out h-5 w-4" />
                      </button>
                      <button
                        className={`flex w-full justify-between items-center text-start bg-transparent text-xs text-ui-textTertiary hover:text-ui-textPrimary`}
                        onClick={() => {
                          if (!activePreview?.baseUrl) {
                            logger.warn('No active preview available');
                            return;
                          }

                          const match = activePreview.baseUrl.match(
                            /^https?:\/\/([^.]+)\.local-credentialless\.webcontainer-api\.io/,
                          );

                          if (!match) {
                            logger.warn('Invalid WebContainer URL:', activePreview.baseUrl);
                            return;
                          }

                          const previewId = match[1];
                          const previewUrl = `/webcontainer/preview/${previewId}`;

                          // Open in a new window with simple parameters
                          window.open(
                            previewUrl,
                            `preview-${previewId}`,
                            'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes',
                          );
                        }}
                      >
                        <span>Open in new window</span>
                        <div className="i-ph:browser h-5 w-4" />
                      </button>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ui-textTertiary">Show Device Frame</span>
                        <button
                          className={`w-10 h-5 rounded-full transition-colors duration-200 ${
                            showDeviceFrame ? 'bg-[#6D28D9]' : 'bg-gray-300 dark:bg-gray-700'
                          } relative`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeviceFrame(!showDeviceFrame);
                          }}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                              showDeviceFrame ? 'transform translate-x-5' : ''
                            }`}
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ui-textTertiary">Landscape Mode</span>
                        <button
                          className={`w-10 h-5 rounded-full transition-colors duration-200 ${
                            isLandscape ? 'bg-[#6D28D9]' : 'bg-gray-300 dark:bg-gray-700'
                          } relative`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsLandscape(!isLandscape);
                          }}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                              isLandscape ? 'transform translate-x-5' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                  {WINDOW_SIZES.map((size) => (
                    <button
                      key={size.name}
                      className="w-full px-4 py-3.5 text-left text-[#111827] dark:text-gray-300 text-sm whitespace-nowrap flex items-center gap-3 group hover:bg-[#F5EEFF] dark:hover:bg-gray-900 bg-white dark:bg-black"
                      onClick={() => {
                        setSelectedWindowSize(size);
                        setIsWindowSizeDropdownOpen(false);
                        openInNewWindow(size);
                      }}
                    >
                      <div
                        className={`${size.icon} w-5 h-5 text-[#6B7280] dark:text-gray-400 group-hover:text-[#6D28D9] dark:group-hover:text-[#6D28D9] transition-colors duration-200`}
                      />
                      <div className="flex-grow flex flex-col">
                        <span className="font-medium group-hover:text-[#6D28D9] dark:group-hover:text-[#6D28D9] transition-colors duration-200">
                          {size.name}
                        </span>
                        <span className="text-xs text-[#6B7280] dark:text-gray-400 group-hover:text-[#6D28D9] dark:group-hover:text-[#6D28D9] transition-colors duration-200">
                          {isLandscape && (size.frameType === 'mobile' || size.frameType === 'tablet')
                            ? `${size.height} × ${size.width}`
                            : `${size.width} × ${size.height}`}
                          {size.hasFrame && showDeviceFrame ? ' (with frame)' : ''}
                        </span>
                      </div>
                      {selectedWindowSize.name === size.name && (
                        <div className="text-[#6D28D9] dark:text-[#6D28D9]">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  },
);
