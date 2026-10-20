import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';

/** Native top-layer modal stays centered above the scrolled settings page and its iframe. */
export function AgentDialog({
  title,
  busy = false,
  close,
  children,
  footer,
  viewer = false,
  className = '',
}: {
  title: string;
  busy?: boolean;
  close: () => void;
  children: ReactNode;
  footer?: ReactNode;
  viewer?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [nativeModal] = useState(
    () =>
      typeof HTMLDialogElement !== 'undefined' &&
      typeof HTMLDialogElement.prototype.showModal === 'function',
  );
  const latest = useRef({ close, busy });
  latest.current = { close, busy };
  const titleId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement;
    const hidden: { node: HTMLElement; inert: boolean; aria: string | null }[] = [];
    if (!nativeModal) {
      for (let child: HTMLElement = dialog; child.parentElement; child = child.parentElement) {
        for (const node of child.parentElement.children) {
          if (
            node === child ||
            !(node instanceof HTMLElement) ||
            node.classList.contains('ai-dialog-fallback-backdrop')
          )
            continue;
          hidden.push({
            node,
            inert: node.hasAttribute('inert'),
            aria: node.getAttribute('aria-hidden'),
          });
          node.setAttribute('inert', '');
          node.setAttribute('aria-hidden', 'true');
        }
        if (child.parentElement === document.body) break;
      }
    }
    const keydown = (event: KeyboardEvent) => {
      if ([...document.querySelectorAll('dialog[open]')].at(-1) !== dialog) return;
      if (event.isComposing || event.keyCode === 229) return;
      if (
        event.key === 'Escape' ||
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'w')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!latest.current.busy) latest.current.close();
        return;
      }
      if (event.key !== 'Tab') return;
      const targets = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ),
      ].filter((node) => node.getClientRects().length > 0);
      const first = targets[0],
        last = targets.at(-1);
      if (
        !first ||
        !last ||
        !dialog.contains(document.activeElement) ||
        (event.shiftKey ? document.activeElement === first : document.activeElement === last)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    document.addEventListener('keydown', keydown, true);
    if (nativeModal) dialog.showModal();
    else dialog.setAttribute('open', '');
    if (viewer) dialog.focus({ preventScroll: true });
    else
      dialog
        .querySelector<HTMLElement>(
          '.ai-credential-list button:not(:disabled), input:not(:disabled)',
        )
        ?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', keydown, true);
      if (nativeModal) dialog.close();
      else dialog.removeAttribute('open');
      for (const { node, inert, aria } of hidden) {
        if (node.hasAttribute('inert')) node.toggleAttribute('inert', inert);
        if (node.getAttribute('aria-hidden') === 'true') {
          if (aria === null) node.removeAttribute('aria-hidden');
          else node.setAttribute('aria-hidden', aria);
        }
      }
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [nativeModal, viewer]);
  useLayoutEffect(() => {
    if (busy && [...document.querySelectorAll('dialog[open]')].at(-1) === ref.current)
      ref.current?.focus({ preventScroll: true });
  }, [busy]);
  return (
    <>
      {!nativeModal && (
        <div
          className={`ai-dialog-fallback-backdrop${viewer ? ' ai-viewer-fallback-backdrop' : ''}`}
          aria-hidden="true"
        />
      )}
      <dialog
        ref={ref}
        className={`ai-settings-dialog${viewer ? ' ai-image-viewer' : ''}${className ? ` ${className}` : ''}`}
        role={nativeModal ? undefined : 'dialog'}
        data-fallback={!nativeModal || undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        tabIndex={-1}
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) close();
        }}
      >
        {viewer ? (
          <h2 className="ai-visually-hidden" id={titleId}>
            {title}
          </h2>
        ) : (
          <header className="ai-dialog-heading">
            <h2 id={titleId}>{title}</h2>
            <button type="button" aria-label="关闭弹窗" disabled={busy} onClick={close}>
              关闭
            </button>
          </header>
        )}
        <div className="ai-dialog-content">{children}</div>
        {footer && <footer className="ai-dialog-footer">{footer}</footer>}
      </dialog>
    </>
  );
}
