import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { desktopAvailable } from '../../services/documents.js';
import {
  type MarkdownPreferencesSnapshot,
  markdownPreferences,
} from '../../services/markdownPreferences.js';
import { MarkdownPreferenceSync } from './markdown-preference-sync.js';

const browserInitial: MarkdownPreferencesSnapshot = {
  schemaVersion: 1,
  revision: 0,
  indentSize: 2,
  prettyIndent: false,
};
export function useMarkdownPreferences(
  editor: MutableRefObject<MarkLyraEditor | null>,
  ready: boolean,
  report: (message: string) => void,
) {
  const [initial, setInitial] = useState<MarkdownPreferencesSnapshot | null>(
    desktopAvailable ? null : browserInitial,
  );
  const [status, setStatus] = useState({ error: '', working: false });
  const [attempt, setAttempt] = useState(0);
  const [listenerAttempt, setListenerAttempt] = useState(0);
  const [listenerError, setListenerError] = useState('');
  const reportRef = useRef(report);
  reportRef.current = report;
  const sync = useRef<MarkdownPreferenceSync | null>(null);
  useEffect(() => {
    const controller = new MarkdownPreferenceSync({
      get: () => (desktopAvailable ? markdownPreferences.get() : Promise.resolve(browserInitial)),
      complete: (token, error) => markdownPreferences.complete(token, error),
      report: (message) => reportRef.current(message),
      changed: (error, working) => setStatus({ error, working }),
    });
    sync.current = controller;
    return () => {
      controller.destroy();
      if (sync.current === controller) sync.current = null;
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit retry renews the four Native subscriptions.
  useEffect(() => {
    if (!desktopAvailable || !sync.current) return;
    const controller = sync.current,
      window = getCurrentWindow();
    let alive = true,
      remaining = 4,
      failed = false;
    const stops: (() => void)[] = [];
    const track = (registration: Promise<() => void>) =>
      void registration.then(
        (stop) => {
          if (alive) {
            stops.push(stop);
            remaining--;
            if (!remaining && !failed) setListenerError('');
          } else stop();
        },
        (error) => {
          if (alive) {
            failed = true;
            const message = `Markdown设置同步监听失败：${String(error)}。可重试同步。`;
            setListenerError(message);
            reportRef.current(message);
          }
        },
      );
    track(
      window.listen<unknown>('preference-markdown-request', (event) =>
        controller.receive(event.payload),
      ),
    );
    track(
      window.listen<{ token: string }>('preference-markdown-cancelled', (event) => {
        if (typeof event.payload?.token === 'string') controller.cancel(event.payload.token);
      }),
    );
    track(window.listen('markdown-preferences-changed', () => void controller.reload()));
    track(
      window.onFocusChanged((event) => {
        if (event.payload) void controller.reload();
      }),
    );
    return () => {
      alive = false;
      stops.forEach((stop) => {
        stop();
      });
    };
  }, [listenerAttempt]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit retry rereads the authoritative startup value.
  useEffect(() => {
    if (!desktopAvailable) return;
    let alive = true;
    void markdownPreferences.get().then(
      (snapshot) => {
        if (alive) {
          setInitial(snapshot);
          setStatus({ error: '', working: false });
        }
      },
      (error) => {
        if (alive) {
          const message = `无法读取Markdown缩进初值：${String(error)}。原稿未载入，可重试。`;
          setStatus({ error: message, working: false });
          reportRef.current(message);
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (!ready || !editor.current || !sync.current) return;
    sync.current.bind(editor.current);
    void sync.current.reload();
  }, [editor, ready]);
  const retry = useCallback(() => {
    if (listenerError) setListenerAttempt((value) => value + 1);
    if (!initial) setAttempt((value) => value + 1);
    else void sync.current?.reload();
  }, [initial, listenerError]);
  return {
    initial,
    error: [status.error, listenerError].filter(Boolean).join('\n'),
    working: status.working,
    retry,
  };
}
