import { useLayoutEffect, useRef } from 'react';

interface ModalFocusOptions {
  returnTarget?: { current: HTMLElement | null };
  restoreOnUnmount?: boolean;
}

/** Focus scope shared by the recovery chooser and the unsaved-document prompt. */
export function useModalFocus(
  open: boolean,
  close: () => void,
  locked: boolean,
  suspendFocus = false,
  options: ModalFocusOptions = {},
) {
  const panel = useRef<HTMLElement | null>(null);
  const latest = useRef({ close, locked, suspendFocus, options });
  latest.current = { close, locked, suspendFocus, options };
  useLayoutEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    const owner = element.ownerDocument;
    const previous = owner.activeElement;
    if (latest.current.options.returnTarget)
      latest.current.options.returnTarget.current =
        previous instanceof HTMLElement ? previous : null;
    const focusable = () =>
      [
        ...element.querySelectorAll<HTMLElement>(
          'button:not(:disabled), summary, input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ),
      ].filter((target) => target.getClientRects().length > 0);
    // Establish the focus scope in the same commit that makes the modal visible.
    // Native menu actions and recovery replies may arrive before a passive effect.
    if (!element.contains(owner.activeElement)) focusable()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === 'Escape' && !latest.current.locked) {
        event.preventDefault();
        latest.current.close();
      }
      if (event.key !== 'Tab' || latest.current.suspendFocus) return;
      const targets = focusable(),
        first = targets[0],
        last = targets.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (
        !element.contains(owner.activeElement) ||
        (event.shiftKey ? owner.activeElement === first : owner.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    let active = true;
    let lastFocused =
      owner.activeElement instanceof HTMLElement && element.contains(owner.activeElement)
        ? owner.activeElement
        : null;
    const constrainFocus = () => {
      if (owner.activeElement instanceof HTMLElement && element.contains(owner.activeElement)) {
        lastFocused = owner.activeElement;
        return;
      }
      if (
        !active ||
        latest.current.locked ||
        latest.current.suspendFocus ||
        !element.isConnected ||
        !owner.hasFocus() ||
        element.contains(owner.activeElement)
      )
        return;
      const targets = focusable();
      (lastFocused && targets.includes(lastFocused) ? lastFocused : targets[0])?.focus();
    };
    // Cross-origin iframe focus blurs the owning window without necessarily
    // dispatching focusin on the iframe element. Check after that focus completes.
    const frameFocus = () => queueMicrotask(constrainFocus);
    owner.addEventListener('focusin', constrainFocus);
    owner.defaultView?.addEventListener('blur', frameFocus);
    owner.addEventListener('keydown', key);
    return () => {
      active = false;
      owner.removeEventListener('focusin', constrainFocus);
      owner.defaultView?.removeEventListener('blur', frameFocus);
      owner.removeEventListener('keydown', key);
      if (
        latest.current.options.restoreOnUnmount !== false &&
        (element.contains(owner.activeElement) || owner.activeElement === owner.body) &&
        previous instanceof HTMLElement &&
        previous.isConnected
      ) {
        previous.focus();
      }
    };
  }, [open]);
  return panel;
}
