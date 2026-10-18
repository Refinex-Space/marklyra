import { type ReactNode, type Ref, useEffect, useState } from 'react';
import { DocumentDetailsResize } from './DocumentDetailsResize.js';
import './document-details.css';

export function DocumentDetailsPanel({
  open,
  width,
  minimum,
  maximum,
  resize,
  finishTransition,
  elementRef,
  children,
}: {
  open: boolean;
  width: number;
  minimum: number;
  maximum: number;
  resize: (width: number) => void;
  finishTransition: () => void;
  elementRef: Ref<HTMLElement>;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!open) setDragging(false);
  }, [open]);
  return (
    <aside
      className="document-details-panel"
      aria-label="文档目录"
      aria-hidden={!open}
      inert={!open}
      data-open={open || undefined}
      data-resizing={(open && dragging) || undefined}
      ref={elementRef}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === 'flex-basis')
          finishTransition();
      }}
    >
      <div className="document-details-body">
        <header className="document-details-header">目录</header>
        <div className="document-details-scroll-mask">
          <div id="document-details-content" className="document-details-content sidebar-panel">
            {children}
          </div>
        </div>
      </div>
      {open && (
        <DocumentDetailsResize
          width={width}
          minimum={minimum}
          maximum={maximum}
          change={resize}
          dragging={dragging}
          setDragging={setDragging}
        />
      )}
    </aside>
  );
}
