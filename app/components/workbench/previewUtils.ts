import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Preview');

// --- Types ---

export type ResizeSide = 'left' | 'right' | null;

export interface WindowSize {
  name: string;
  width: number;
  height: number;
  icon: string;
  hasFrame?: boolean;
  frameType?: 'mobile' | 'tablet' | 'laptop' | 'desktop';
}

// --- Constants ---

export const WINDOW_SIZES: WindowSize[] = [
  { name: 'iPhone SE', width: 375, height: 667, icon: 'i-ph:device-mobile', hasFrame: true, frameType: 'mobile' },
  { name: 'iPhone 12/13', width: 390, height: 844, icon: 'i-ph:device-mobile', hasFrame: true, frameType: 'mobile' },
  {
    name: 'iPhone 12/13 Pro Max',
    width: 428,
    height: 926,
    icon: 'i-ph:device-mobile',
    hasFrame: true,
    frameType: 'mobile',
  },
  { name: 'iPad Mini', width: 768, height: 1024, icon: 'i-ph:device-tablet', hasFrame: true, frameType: 'tablet' },
  { name: 'iPad Air', width: 820, height: 1180, icon: 'i-ph:device-tablet', hasFrame: true, frameType: 'tablet' },
  { name: 'iPad Pro 11"', width: 834, height: 1194, icon: 'i-ph:device-tablet', hasFrame: true, frameType: 'tablet' },
  {
    name: 'iPad Pro 12.9"',
    width: 1024,
    height: 1366,
    icon: 'i-ph:device-tablet',
    hasFrame: true,
    frameType: 'tablet',
  },
  { name: 'Small Laptop', width: 1280, height: 800, icon: 'i-ph:laptop', hasFrame: true, frameType: 'laptop' },
  { name: 'Laptop', width: 1366, height: 768, icon: 'i-ph:laptop', hasFrame: true, frameType: 'laptop' },
  { name: 'Large Laptop', width: 1440, height: 900, icon: 'i-ph:laptop', hasFrame: true, frameType: 'laptop' },
  { name: 'Desktop', width: 1920, height: 1080, icon: 'i-ph:monitor', hasFrame: true, frameType: 'desktop' },
  { name: '4K Display', width: 3840, height: 2160, icon: 'i-ph:monitor', hasFrame: true, frameType: 'desktop' },
];

// --- Device Frame Popup Generator ---

export interface DeviceFrameOptions {
  baseUrl: string;
  size: WindowSize;
  isLandscape: boolean;
  showDeviceFrame: boolean;
  getFrameColor: () => string;
}

/**
 * Opens a new browser window with the preview, optionally wrapped in a device frame.
 * Extracts the WebContainer preview ID from the base URL and generates a styled popup.
 */
export function openDeviceFramePopup(options: DeviceFrameOptions): void {
  const { baseUrl, size, isLandscape, showDeviceFrame, getFrameColor } = options;

  // Extract preview ID from either WebContainer or Docker URLs
  const wcMatch = baseUrl.match(/^https?:\/\/([^.]+)\.local-credentialless\.webcontainer-api\.io/);
  const dockerMatch = baseUrl.match(/^https?:\/\/localhost:(\d+)/);
  const previewId = wcMatch?.[1] || dockerMatch?.[1];

  if (!previewId) {
    logger.warn('Cannot extract preview ID from URL:', baseUrl);
    return;
  }

  // For WebContainer, use the internal preview route; for Docker, use the direct URL
  const previewUrl = wcMatch ? `/webcontainer/preview/${previewId}` : baseUrl;

  // Adjust dimensions for landscape mode if applicable
  let width = size.width;
  let height = size.height;

  if (isLandscape && (size.frameType === 'mobile' || size.frameType === 'tablet')) {
    width = size.height;
    height = size.width;
  }

  // Create a window with device frame if enabled
  if (showDeviceFrame && size.hasFrame) {
    const frameWidth = size.frameType === 'mobile' ? (isLandscape ? 120 : 40) : 60;
    const frameHeight = size.frameType === 'mobile' ? (isLandscape ? 80 : 80) : isLandscape ? 60 : 100;

    const newWindow = window.open(
      '',
      '_blank',
      `width=${width + frameWidth},height=${height + frameHeight + 40},menubar=no,toolbar=no,location=no,status=no`,
    );

    if (!newWindow) {
      logger.error('Failed to open new window');
      return;
    }

    const htmlContent = buildDeviceFrameHtml({
      previewUrl,
      size,
      width,
      height,
      isLandscape,
      frameColor: getFrameColor(),
    });

    newWindow.document.open();
    newWindow.document.write(htmlContent);
    newWindow.document.close();
  } else {
    // Standard window without frame
    const newWindow = window.open(
      previewUrl,
      '_blank',
      `noopener,noreferrer,width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no`,
    );

    if (newWindow) {
      newWindow.focus();
    }
  }
}

// --- HTML Template Builder ---

interface DeviceFrameHtmlOptions {
  previewUrl: string;
  size: WindowSize;
  width: number;
  height: number;
  isLandscape: boolean;
  frameColor: string;
}

function buildDeviceFrameHtml(options: DeviceFrameHtmlOptions): string {
  const { previewUrl, size, width, height, isLandscape, frameColor } = options;

  const frameRadius = size.frameType === 'mobile' ? '36px' : '20px';
  const framePadding =
    size.frameType === 'mobile' ? (isLandscape ? '40px 60px' : '40px 20px') : isLandscape ? '30px 50px' : '50px 30px';

  // Position notch and home button based on orientation
  const notchTop = isLandscape ? '50%' : '20px';
  const notchLeft = isLandscape ? '30px' : '50%';
  const notchTransform = isLandscape ? 'translateY(-50%)' : 'translateX(-50%)';
  const notchWidth = isLandscape ? '8px' : size.frameType === 'mobile' ? '60px' : '80px';
  const notchHeight = isLandscape ? (size.frameType === 'mobile' ? '60px' : '80px') : '8px';

  const homeBottom = isLandscape ? '50%' : '15px';
  const homeRight = isLandscape ? '30px' : '50%';
  const homeTransform = isLandscape ? 'translateY(50%)' : 'translateX(50%)';
  const homeWidth = isLandscape ? '4px' : '40px';
  const homeHeight = isLandscape ? '40px' : '4px';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${size.name} Preview</title>
  <style>
    body {
      margin: 0; padding: 0;
      display: flex; justify-content: center; align-items: center;
      height: 100vh; background: #f0f0f0; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .device-container { position: relative; }
    .device-name {
      position: absolute; top: -30px; left: 0; right: 0;
      text-align: center; font-size: 14px; color: #333;
    }
    .device-frame {
      position: relative; border-radius: ${frameRadius};
      background: ${frameColor}; padding: ${framePadding};
      box-shadow: 0 10px 30px rgba(0,0,0,0.2); overflow: hidden;
    }
    .device-frame:before {
      content: ''; position: absolute;
      top: ${notchTop}; left: ${notchLeft}; transform: ${notchTransform};
      width: ${notchWidth}; height: ${notchHeight};
      background: #333; border-radius: 4px; z-index: 2;
    }
    .device-frame:after {
      content: ''; position: absolute;
      bottom: ${homeBottom}; right: ${homeRight}; transform: ${homeTransform};
      width: ${homeWidth}; height: ${homeHeight};
      background: #333; border-radius: 50%; z-index: 2;
    }
    iframe {
      border: none; width: ${width}px; height: ${height}px;
      background: white; display: block;
    }
  </style>
</head>
<body>
  <div class="device-container">
    <div class="device-name">${size.name} ${isLandscape ? '(Landscape)' : '(Portrait)'}</div>
    <div class="device-frame">
      <iframe src="${previewUrl}" sandbox="allow-scripts allow-forms allow-popups allow-modals allow-storage-access-by-user-activation allow-same-origin" allow="cross-origin-isolated"></iframe>
    </div>
  </div>
</body>
</html>`;
}

// --- Pure utility functions extracted from Preview ---

/**
 * Reducer callback that returns the index of the preview with the smallest port number.
 */
export function findMinPortIndex(
  minIndex: number,
  preview: { port: number },
  index: number,
  array: { port: number }[],
): number {
  return preview.port < array[minIndex].port ? index : minIndex;
}

/**
 * Returns the correct CSS padding string for the device frame based on
 * the selected window size and landscape orientation.
 */
export function getFramePadding(selectedWindowSize: WindowSize | null, isLandscape: boolean): string {
  if (!selectedWindowSize) {
    return '40px 20px';
  }

  const isMobile = selectedWindowSize.frameType === 'mobile';

  if (isLandscape) {
    // Increase horizontal padding in landscape mode to ensure full device frame is visible
    return isMobile ? '40px 60px' : '30px 50px';
  }

  return isMobile ? '40px 20px' : '50px 30px';
}

/**
 * Returns the device frame border color based on whether the app is in dark mode.
 * Checks the document for dark class, data-theme, or prefers-color-scheme media query.
 */
export function getFrameColor(): string {
  // Check if the document has a dark class or data-theme="dark"
  const isDarkMode =
    document.documentElement.classList.contains('dark') ||
    document.documentElement.getAttribute('data-theme') === 'dark' ||
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  // Return a darker color for light mode, lighter color for dark mode
  return isDarkMode ? '#555' : '#111';
}
