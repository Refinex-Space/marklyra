import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef } from 'react';
import { desktopAvailable } from '../../services/documents.js';
import { deliverOsOpen, type OsOpenContext } from './os-open-delivery.js';

export function useOsOpenEvents(ready: boolean, context: OsOpenContext): void {
  const current = useRef(context);
  current.current = context;
  useEffect(() => {
    if (!desktopAvailable || !ready) return;
    let alive = true;
    let running = false;
    const pump = async () => {
      if (!alive || running) return;
      running = true;
      try {
        // Native owns a bounded process queue. A bounded drain prevents an OS
        // event burst from monopolizing the editor's event loop.
        for (let count = 0; alive && count < 64; count++) {
          const received = await deliverOsOpen({
            ...current.current,
            available: () => alive && current.current.available(),
            mayInitialize: () => alive && current.current.mayInitialize(),
          });
          if (!received) break;
        }
      } catch (error) {
        if (alive) current.current.report(`系统打开未完成：${String(error)}`);
      } finally {
        running = false;
      }
    };
    const nativeWindow = getCurrentWindow();
    const pending = nativeWindow.listen('os-open-pending', () => {
      void pump();
    });
    const focus = nativeWindow.onFocusChanged(({ payload }) => {
      if (payload) void pump();
    });
    const interval = window.setInterval(() => {
      void pump();
    }, 1000);
    void Promise.all([pending, focus])
      .then(() => pump())
      .catch((error: unknown) => {
        if (alive) current.current.report(`系统打开监听未完成：${String(error)}`);
      });
    return () => {
      alive = false;
      window.clearInterval(interval);
      void pending.then((stop) => stop()).catch(() => {});
      void focus.then((stop) => stop()).catch(() => {});
    };
  }, [ready]);
}
