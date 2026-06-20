import { memo } from 'react';
import type { ResizeSide } from '~/components/workbench/previewUtils';

// --- GripIcon ---

export const GripIcon = memo(() => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100%',
      pointerEvents: 'none',
    }}
  >
    <div
      style={{
        color: 'var(--ui-textSecondary, rgba(0,0,0,0.5))',
        fontSize: '10px',
        lineHeight: '5px',
        userSelect: 'none',
        marginLeft: '1px',
      }}
    >
      ••• •••
    </div>
  </div>
));

// --- ResizeHandle ---

interface ResizeHandleProps {
  side: ResizeSide;
  onPointerDown: (e: React.PointerEvent, side: ResizeSide) => void;
}

export const ResizeHandle = memo(({ side, onPointerDown }: ResizeHandleProps) => {
  if (!side) {
    return null;
  }

  return (
    <div
      className={`resize-handle-${side}`}
      onPointerDown={(e) => onPointerDown(e, side)}
      style={{
        position: 'absolute',
        top: 0,
        ...(side === 'left' ? { left: 0, marginLeft: '-7px' } : { right: 0, marginRight: '-7px' }),
        width: '15px',
        height: '100%',
        cursor: 'ew-resize',
        background: 'var(--ui-background-depth-4, rgba(0,0,0,.3))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.2s',
        userSelect: 'none',
        touchAction: 'none',
        zIndex: 10,
      }}
      onMouseOver={(e) => (e.currentTarget.style.background = 'var(--ui-background-depth-4, rgba(0,0,0,.3))')}
      onMouseOut={(e) => (e.currentTarget.style.background = 'var(--ui-background-depth-3, rgba(0,0,0,.15))')}
      title="Drag to resize width"
    >
      <GripIcon />
    </div>
  );
});
