import { useEffect, useRef, useState } from 'react';
export function SidebarResize({
  width,
  change,
  native = false,
  hide,
  trailingWidth = 0,
  onDragWidthChange,
  minimumWidth,
  maximumWidth,
}: {
  minimumWidth?: number;
  maximumWidth?: number;
  width: number;
  change: (width: number) => void;
  native?: boolean;
  hide?: () => void;
  trailingWidth?: number;
  onDragWidthChange: (width: number | null) => void;
}) {
  const origin = useRef<{ x: number; width: number; latest: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [viewport, setViewport] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => () => onDragWidthChange(null), [onDragWidthChange]);
  const minimum = minimumWidth ?? (native ? 160 : 180);
  const available = viewport - trailingWidth - (native || trailingWidth ? 220 : 300);
  const maximum = Math.max(
    minimum,
    Math.min(maximumWidth ?? (native ? available : 440), available),
  );
  const bounded = (next: number) => Math.round(Math.max(minimum, Math.min(maximum, next)));
  const resize = (next: number) => change(bounded(next));
  const stop = () => {
    origin.current = null;
    setDragging(false);
    onDragWidthChange(null);
  };
  const cancel = () => {
    if (origin.current) resize(origin.current.latest);
    stop();
  };
  return (
    <>
      <hr
        className="sidebar-resize pane-resize-handle"
        data-resizing={dragging || undefined}
        aria-label="调整侧栏宽度"
        aria-orientation="vertical"
        aria-valuemin={minimum}
        aria-valuemax={maximum}
        aria-valuenow={bounded(width)}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          const actual =
            event.currentTarget.previousElementSibling?.getBoundingClientRect().width ?? width;
          origin.current = { x: event.clientX, width: actual, latest: bounded(actual) };
          event.currentTarget.setPointerCapture(event.pointerId);
          onDragWidthChange(origin.current.latest);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!origin.current) return;
          const next = origin.current.width + event.clientX - origin.current.x;
          origin.current.latest = bounded(next);
          onDragWidthChange(origin.current.latest);
        }}
        onPointerUp={(event) => {
          if (origin.current) {
            if (native && event.clientX < 100 && hide) hide();
            else resize(origin.current.width + event.clientX - origin.current.x);
          }
          stop();
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          resize(
            event.key === 'Home'
              ? minimum
              : event.key === 'End'
                ? maximum
                : bounded(width) +
                  (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 40 : 10),
          );
        }}
      />
      {dragging && <div className="resize-shield" />}
    </>
  );
}
