import { useEffect, useState } from 'react';
import { applicationPreferences } from '../../services/application-preferences.js';
import { desktopAvailable } from '../../services/documents.js';
/** Native windows can force their own appearance, so their media query is not the OS setting. */
export function useSystemAppearance(enabled: boolean, report: (message: string) => void) {
  const [dark, setDark] = useState(
    () => !desktopAvailable && matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    if (!enabled) return;
    let alive = true,
      busy = false,
      failed = false;
    const query = matchMedia('(prefers-color-scheme: dark)');
    const refresh = async () => {
      if (busy || !alive) return;
      busy = true;
      try {
        const next = desktopAvailable ? await applicationPreferences.systemDark() : query.matches;
        if (alive) {
          setDark(next);
          failed = false;
        }
      } catch (error) {
        if (alive && !failed) {
          report(`系统外观尚未确认：${String(error)}`);
          failed = true;
        }
      } finally {
        busy = false;
      }
    };
    void refresh();
    // NSWindow appearance overrides prevent WebKit media changes. Poll only while this hook is enabled.
    const timer = desktopAvailable
      ? setInterval(() => {
          if (!document.hidden) void refresh();
        }, 1000)
      : undefined;
    const update = () => void refresh();
    window.addEventListener('focus', update);
    query.addEventListener('change', update);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', update);
      query.removeEventListener('change', update);
    };
  }, [enabled, report]);
  return dark;
}
