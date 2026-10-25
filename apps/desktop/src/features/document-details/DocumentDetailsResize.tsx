import { type RefObject, useEffect, useRef } from 'react';

export function DocumentDetailsResize({
  label = '调整目录宽度',
  open,
  width,
  minimum,
  maximum,
  change,
  dragging,
  setDragging,
  container,
  widthProperty = '--document-details-width',
  controlsId = 'document-details-content',
}: {
  label?: string;
  open: boolean;
  width: number;
  minimum: number;
  maximum: number;
  change: (width: number) => void;
  dragging: boolean;
  setDragging: (value: boolean) => void;
  container?: RefObject<HTMLElement | null>;
  widthProperty?: `--${string}`;
  controlsId?: string;
}) {
  const origin = useRef<{ x: number; width: number } | null>(null);
  // One layout update per painted frame, however many pointer events arrived.
  const frame = useRef(0);
  const latest = useRef(width);
  const handle = useRef<HTMLHRElement | null>(null);
  // While dragging only the CSS variable the layout reads moves; React learns the width on release.
  const paint = (value: number) => {
    const layout = container?.current ?? handle.current?.closest<HTMLElement>('.workspace');
    layout?.style.setProperty(widthProperty, `${value}px`);
    handle.current?.setAttribute('aria-valuenow', String(value));
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(() => {
    if (!open) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      origin.current = null;
    }
  }, [open]);
  const bounded = (value: number) => Math.round(Math.max(minimum, Math.min(maximum, value)));
  const stop = () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    origin.current = null;
    setDragging(false);
  };
  const cancel = () => {
    if (origin.current) change(latest.current);
    stop();
  };
  return (
    <>
      <hr
        ref={handle}
        className="document-details-resize pane-resize-handle"
        data-resizing={dragging || undefined}
        aria-label={label}
        aria-orientation="vertical"
        aria-controls={controlsId}
        aria-hidden={!open}
        data-open={open || undefined}
        inert={!open}
        aria-valuemin={minimum}
        aria-valuemax={maximum}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          const bounds = event.currentTarget.nextElementSibling?.getBoundingClientRect();
          const actual = bounded(bounds?.width ?? width);
          origin.current = {
            x: event.clientX,
            width: actual,
          };
          latest.current = actual;
          change(actual);
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!origin.current) return;
          latest.current = bounded(origin.current.width + origin.current.x - event.clientX);
          if (frame.current) return;
          frame.current = requestAnimationFrame(() => {
            frame.current = 0;
            if (origin.current) paint(latest.current);
          });
        }}
        onPointerUp={(event) => {
          if (origin.current) {
            const final = bounded(origin.current.width + origin.current.x - event.clientX);
            paint(final);
            change(final);
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
          event.stopPropagation();
          change(
            event.key === 'Home'
              ? minimum
              : event.key === 'End'
                ? maximum
                : width + (event.key === 'ArrowLeft' ? 1 : -1) * (event.shiftKey ? 40 : 10),
          );
        }}
      />
      {open && dragging && <div className="resize-shield" />}
    </>
  );
}
