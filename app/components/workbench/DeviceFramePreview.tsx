import { memo } from 'react';
import type { WindowSize } from '~/components/workbench/previewUtils';

interface DeviceFramePreviewProps {
  iframeRef: React.Ref<HTMLIFrameElement>;
  iframeUrl: string | undefined;
  selectedWindowSize: WindowSize;
  isLandscape: boolean;
  frameColor: string;
  framePadding: string;
}

export const DeviceFramePreview = memo(
  ({ iframeRef, iframeUrl, selectedWindowSize, isLandscape, frameColor, framePadding }: DeviceFramePreviewProps) => {
    return (
      <div
        className="device-wrapper"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          padding: '0',
          overflow: 'auto',
          transition: 'all 0.3s ease',
          position: 'relative',
        }}
      >
        <div
          className="device-frame-container"
          style={{
            position: 'relative',
            borderRadius: selectedWindowSize.frameType === 'mobile' ? '36px' : '20px',
            background: frameColor,
            padding: framePadding,
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            transform: 'scale(1)',
            transformOrigin: 'center center',
            transition: 'all 0.3s ease',
            margin: '40px',
            width: isLandscape
              ? `${selectedWindowSize.height + (selectedWindowSize.frameType === 'mobile' ? 120 : 60)}px`
              : `${selectedWindowSize.width + (selectedWindowSize.frameType === 'mobile' ? 40 : 60)}px`,
            height: isLandscape
              ? `${selectedWindowSize.width + (selectedWindowSize.frameType === 'mobile' ? 80 : 60)}px`
              : `${selectedWindowSize.height + (selectedWindowSize.frameType === 'mobile' ? 80 : 100)}px`,
          }}
        >
          {/* Notch - positioned based on orientation */}
          <div
            style={{
              position: 'absolute',
              top: isLandscape ? '50%' : '20px',
              left: isLandscape ? '30px' : '50%',
              transform: isLandscape ? 'translateY(-50%)' : 'translateX(-50%)',
              width: isLandscape ? '8px' : selectedWindowSize.frameType === 'mobile' ? '60px' : '80px',
              height: isLandscape ? (selectedWindowSize.frameType === 'mobile' ? '60px' : '80px') : '8px',
              background: '#333',
              borderRadius: '4px',
              zIndex: 2,
            }}
          />

          {/* Home button - positioned based on orientation */}
          <div
            style={{
              position: 'absolute',
              bottom: isLandscape ? '50%' : '15px',
              right: isLandscape ? '30px' : '50%',
              transform: isLandscape ? 'translateY(50%)' : 'translateX(50%)',
              width: isLandscape ? '4px' : '40px',
              height: isLandscape ? '40px' : '4px',
              background: '#333',
              borderRadius: '50%',
              zIndex: 2,
            }}
          />

          <iframe
            ref={iframeRef}
            title="preview"
            style={{
              border: 'none',
              width: isLandscape ? `${selectedWindowSize.height}px` : `${selectedWindowSize.width}px`,
              height: isLandscape ? `${selectedWindowSize.width}px` : `${selectedWindowSize.height}px`,
              background: 'white',
              display: 'block',
            }}
            src={iframeUrl}
            sandbox="allow-scripts allow-forms allow-popups allow-modals allow-storage-access-by-user-activation allow-same-origin"
            allow="cross-origin-isolated"
          />
        </div>
      </div>
    );
  },
);
