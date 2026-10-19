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
  mode = 'outline',
}: {
  open: boolean;
  width: number;
  minimum: number;
  maximum: number;
  resize: (width: number) => void;
  finishTransition: () => void;
  elementRef: Ref<HTMLElement>;
  children: ReactNode;
  mode?: 'outline' | 'ai';
}) {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!open) setDragging(false);
  }, [open]);
  return (
    <>
      {/* A sibling of the pane, not a child: the pane clips its content while it animates, and the
          handle must cover the whole gap between the document and this pane. */}
      <DocumentDetailsResize
        label={mode === 'ai' ? '调整 AI 面板宽度' : '调整目录宽度'}
        open={open}
        width={width}
        minimum={minimum}
        maximum={maximum}
        change={resize}
        dragging={dragging}
        setDragging={setDragging}
      />
      <aside
        className="document-details-panel"
        aria-label={mode === 'ai' ? 'AI 助手侧栏' : '文档目录'}
        data-mode={mode}
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
          <header className="document-details-header" hidden={mode === 'ai'}>
            目录
          </header>
          <div
            className={mode === 'ai' ? 'document-details-ai-mask' : 'document-details-scroll-mask'}
          >
            <div
              id="document-details-content"
              className={
                mode === 'ai'
                  ? 'document-details-ai-content'
                  : 'document-details-content sidebar-panel'
              }
            >
              {children}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
