import { useEffect, useRef, useState } from 'react';
export function SidebarResize({
  width,
  change,
  native = false,
  hide,
  trailingWidth = 0,
  onDragWidthChange,
  direct = false,
  minimumWidth,
  maximumWidth,
}: {
  /** Move the sibling pane in the DOM while dragging and commit once on release, instead of
   * re-rendering the shell for every frame. */
  direct?: boolean;
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
  // Pointer events can outnumber frames; publishing the width once per frame keeps a drag
  // from re-rendering the shell faster than it can paint.
  const frame = useRef(0);
  const handle = useRef<HTMLHRElement | null>(null);
  const publish = useRef(onDragWidthChange);
  publish.current = onDragWidthChange;
  const paint = (value: number) => {
    const sidebar = handle.current?.previousElementSibling;
    if (sidebar instanceof HTMLElement) sidebar.style.width = `${value}px`;
    handle.current?.setAttribute('aria-valuenow', String(value));
  };
  const schedule = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (!origin.current) return;
      if (direct) paint(origin.current.latest);
      else publish.current(origin.current.latest);
    });
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
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
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    origin.current = null;
    setDragging(false);
    if (!direct) onDragWidthChange(null);
  };
  const cancel = () => {
    if (origin.current) resize(origin.current.latest);
    stop();
  };
  return (
    <>
      <hr
        ref={handle}
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
          if (!direct) onDragWidthChange(origin.current.latest);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!origin.current) return;
          const next = origin.current.width + event.clientX - origin.current.x;
          origin.current.latest = bounded(next);
          schedule();
        }}
        onPointerUp={(event) => {
          if (origin.current) {
            if (native && event.clientX < 100 && hide) {
              // The pane is about to disappear; leave React's width as the one to restore.
              if (direct) paint(width);
              hide();
            } else {
              const final = bounded(origin.current.width + event.clientX - origin.current.x);
              // The last frame may not have painted yet; React only rewrites a changed width.
              if (direct) paint(final);
              resize(final);
            }
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
