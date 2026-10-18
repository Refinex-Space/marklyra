import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useModalFocus } from './useModalFocus.js';

interface Options {
  close(focusHandled?: boolean): void;
  beforeClose?:
    | ((returnTarget: HTMLElement | null, signal: AbortSignal) => Promise<void>)
    | undefined;
  locked: boolean;
}
/** Keep a modal's visible lifetime aligned with its host's actual focus reply. */
export function useModalCloseHandoff({ close, beforeClose, locked }: Options) {
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const returnTarget = useRef<HTMLElement | null>(null);
  const alive = useRef(true);
  const pending = useRef<AbortController | null>(null);
  const panel = useModalFocus(
    true,
    () => {
      if (pending.current) cancel();
      else void request();
    },
    locked,
    closing,
    { returnTarget, restoreOnUnmount: !closing },
  );
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const current = pending.current;
      pending.current = null;
      current?.abort();
    };
  }, []);
  const focusCloseControl = () =>
    panel.current?.querySelector<HTMLButtonElement>('[data-modal-close]')?.focus();
  function cancel() {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    current.abort();
    flushSync(() => {
      setClosing(false);
      setError('已取消关闭，恢复副本仍保留。');
    });
    focusCloseControl();
  }
  async function request() {
    if (locked || pending.current) return;
    if (!beforeClose) {
      close();
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    // The focus trap must yield in this commit before the host enters a child
    // frame. Otherwise its blur microtask can reclaim the modal's old button.
    flushSync(() => {
      setClosing(true);
      setError('');
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(new Error('关闭已取消'));
        controller.signal.addEventListener('abort', abort, { once: true });
        void Promise.resolve()
          .then(() => {
            if (controller.signal.aborted) throw new Error('关闭已取消');
            return beforeClose(returnTarget.current, controller.signal);
          })
          .then(resolve, reject)
          .finally(() => controller.signal.removeEventListener('abort', abort));
      });
      if (!alive.current || pending.current !== controller || controller.signal.aborted) return;
      pending.current = null;
      close(true);
    } catch (reason) {
      if (!alive.current || pending.current !== controller || controller.signal.aborted) return;
      pending.current = null;
      flushSync(() => {
        setClosing(false);
        setError(`返回输入位置失败：${String(reason)}`);
      });
      focusCloseControl();
    }
  }
  function closeWithoutFocus() {
    if (locked || pending.current || !error) return;
    flushSync(() => setClosing(true));
    // An explicit fallback after a reported failure must not schedule a second
    // asynchronous editor focus or restore the stale outer iframe on cleanup.
    close(true);
  }
  return { panel, closing, error, request, cancel, closeWithoutFocus };
}
