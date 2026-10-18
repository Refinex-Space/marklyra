import { useRef } from 'react';

export function DocumentDetailsResize({
  width,
  minimum,
  maximum,
  change,
  dragging,
  setDragging,
}: {
  width: number;
  minimum: number;
  maximum: number;
  change: (width: number) => void;
  dragging: boolean;
  setDragging: (value: boolean) => void;
}) {
  const origin = useRef<{ x: number; width: number } | null>(null);
  const bounded = (value: number) => Math.round(Math.max(minimum, Math.min(maximum, value)));
  const stop = () => {
    origin.current = null;
    setDragging(false);
  };
  return (
    <>
      <hr
        className="document-details-resize pane-resize-handle"
        data-resizing={dragging || undefined}
        aria-label="调整目录宽度"
        aria-orientation="vertical"
        aria-controls="document-details-content"
        aria-valuemin={minimum}
        aria-valuemax={maximum}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
          const actual = bounded(bounds?.width ?? width);
          origin.current = {
            x: event.clientX,
            width: actual,
          };
          change(actual);
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (origin.current)
            change(bounded(origin.current.width + origin.current.x - event.clientX));
        }}
        onPointerUp={(event) => {
          if (origin.current) change(origin.current.width + origin.current.x - event.clientX);
          stop();
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          change(
            event.key === 'Home'
              ? minimum
              : event.key === 'End'
                ? maximum
                : width + (event.key === 'ArrowLeft' ? 1 : -1) * (event.shiftKey ? 40 : 10),
          );
        }}
      />
      {dragging && <div className="resize-shield" />}
    </>
  );
}
