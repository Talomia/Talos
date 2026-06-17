import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResizeSide } from '~/components/workbench/previewUtils';

export interface ResizingState {
  isResizing: boolean;
  side: ResizeSide;
  startX: number;
  startWidthPercent: number;
  windowWidth: number;
  pointerId: number | null;
}

export interface UsePreviewResizeParams {
  isDeviceModeOn: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export interface UsePreviewResizeReturn {
  widthPercent: number;
  currentWidth: number;
  startResizing: (e: React.PointerEvent, side: ResizeSide) => void;
  resizingState: React.MutableRefObject<ResizingState>;
}

export function usePreviewResize({ isDeviceModeOn, containerRef }: UsePreviewResizeParams): UsePreviewResizeReturn {
  const [widthPercent, setWidthPercent] = useState<number>(37.5);
  const [currentWidth, setCurrentWidth] = useState<number>(0);

  const resizingState = useRef<ResizingState>({
    isResizing: false,
    side: null,
    startX: 0,
    startWidthPercent: 37.5,
    windowWidth: window.innerWidth,
    pointerId: null,
  });

  // Reduce scaling factor to make resizing less sensitive
  const SCALING_FACTOR = 1;

  const startResizing = useCallback(
    (e: React.PointerEvent, side: ResizeSide) => {
      if (!isDeviceModeOn) {
        return;
      }

      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';

      resizingState.current = {
        isResizing: true,
        side,
        startX: e.clientX,
        startWidthPercent: widthPercent,
        windowWidth: window.innerWidth,
        pointerId: e.pointerId,
      };
    },
    [isDeviceModeOn, widthPercent],
  );

  useEffect(() => {
    // Skip if not in device mode
    if (!isDeviceModeOn) {
      return;
    }

    const handlePointerMove = (e: PointerEvent) => {
      const state = resizingState.current;

      if (!state.isResizing || e.pointerId !== state.pointerId) {
        return;
      }

      const dx = e.clientX - state.startX;
      const dxPercent = (dx / state.windowWidth) * 100 * SCALING_FACTOR;

      let newWidthPercent = state.startWidthPercent;

      if (state.side === 'right') {
        newWidthPercent = state.startWidthPercent + dxPercent;
      } else if (state.side === 'left') {
        newWidthPercent = state.startWidthPercent - dxPercent;
      }

      // Limit width percentage between 10% and 90%
      newWidthPercent = Math.max(10, Math.min(newWidthPercent, 90));

      // Force a synchronous update to ensure the UI reflects the change immediately
      setWidthPercent(newWidthPercent);

      // Calculate and update the actual pixel width
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const newWidth = Math.round((containerWidth * newWidthPercent) / 100);
        setCurrentWidth(newWidth);

        // Apply the width directly to the container for immediate feedback
        const previewContainer = containerRef.current.querySelector('div[style*="width"]');

        if (previewContainer) {
          (previewContainer as HTMLElement).style.width = `${newWidthPercent}%`;
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const state = resizingState.current;

      if (!state.isResizing || e.pointerId !== state.pointerId) {
        return;
      }

      // Find all resize handles
      const handles = document.querySelectorAll('.resize-handle-left, .resize-handle-right');

      // Release pointer capture from any handle that has it
      handles.forEach((handle) => {
        if ((handle as HTMLElement).hasPointerCapture?.(e.pointerId)) {
          (handle as HTMLElement).releasePointerCapture(e.pointerId);
        }
      });

      // Reset state
      resizingState.current = {
        ...resizingState.current,
        isResizing: false,
        side: null,
        pointerId: null,
      };

      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    // Add event listeners
    document.addEventListener('pointermove', handlePointerMove, { passive: false });
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);

    // Define cleanup function
    function cleanupResizeListeners() {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);

      // Release any lingering pointer captures
      if (resizingState.current.pointerId !== null) {
        const handles = document.querySelectorAll('.resize-handle-left, .resize-handle-right');
        handles.forEach((handle) => {
          if ((handle as HTMLElement).hasPointerCapture?.(resizingState.current.pointerId!)) {
            (handle as HTMLElement).releasePointerCapture(resizingState.current.pointerId!);
          }
        });

        // Reset state
        resizingState.current = {
          ...resizingState.current,
          isResizing: false,
          side: null,
          pointerId: null,
        };

        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    }

    // Return the cleanup function
    // eslint-disable-next-line consistent-return
    return cleanupResizeListeners;
  }, [isDeviceModeOn, SCALING_FACTOR]);

  useEffect(() => {
    const handleWindowResize = () => {
      // Update the window width in the resizing state
      resizingState.current.windowWidth = window.innerWidth;

      // Update the current width in pixels
      if (containerRef.current && isDeviceModeOn) {
        const containerWidth = containerRef.current.clientWidth;
        setCurrentWidth(Math.round((containerWidth * widthPercent) / 100));
      }
    };

    window.addEventListener('resize', handleWindowResize);

    // Initial calculation of current width
    if (containerRef.current && isDeviceModeOn) {
      const containerWidth = containerRef.current.clientWidth;
      setCurrentWidth(Math.round((containerWidth * widthPercent) / 100));
    }

    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [isDeviceModeOn, widthPercent]);

  // Update current width when device mode is toggled
  useEffect(() => {
    if (containerRef.current && isDeviceModeOn) {
      const containerWidth = containerRef.current.clientWidth;
      setCurrentWidth(Math.round((containerWidth * widthPercent) / 100));
    }
  }, [isDeviceModeOn]);

  return { widthPercent, currentWidth, startResizing, resizingState };
}
