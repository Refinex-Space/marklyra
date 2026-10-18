import { useEffect, useRef, useState } from 'react';
export function SidebarResize({
  width,
  change,
  native = false,
  hide,
}: {
  width: number;
  change: (width: number) => void;
  native?: boolean;
  hide?: () => void;
}) {
  const origin = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [viewport, setViewport] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const minimum = native ? 160 : 180;
  const maximum = Math.max(minimum, native ? viewport - 220 : Math.min(440, viewport - 300));
  const bounded = (next: number) => Math.round(Math.max(minimum, Math.min(maximum, next)));
  const resize = (next: number) => change(bounded(next));
  return (
    <>
      <hr
        className="sidebar-resize"
        aria-label="调整侧栏宽度"
        aria-orientation="vertical"
        aria-valuemin={minimum}
        aria-valuemax={maximum}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          origin.current = {
            x: event.clientX,
            width:
              event.currentTarget.previousElementSibling?.getBoundingClientRect().width ?? width,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          setPreview(width);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!origin.current) return;
          const next = origin.current.width + event.clientX - origin.current.x;
          if (native) setPreview(event.clientX < 100 && hide ? 0 : bounded(next));
          else resize(next);
        }}
        onPointerUp={(event) => {
          if (native && origin.current) {
            if (event.clientX < 100 && hide) hide();
            else resize(origin.current.width + event.clientX - origin.current.x);
          }
          origin.current = null;
          setDragging(false);
          setPreview(null);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => {
          origin.current = null;
          setDragging(false);
          setPreview(null);
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          resize(
            event.key === 'Home'
              ? minimum
              : event.key === 'End'
                ? maximum
                : width + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 40 : 10),
          );
        }}
      />
      {dragging && <div className="resize-shield" />}
      {native && dragging && preview !== null && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: 0,
            bottom: 0,
            left: preview,
            borderLeft: '1px solid var(--muted)',
            pointerEvents: 'none',
            zIndex: 100,
          }}
        />
      )}
    </>
  );
}
