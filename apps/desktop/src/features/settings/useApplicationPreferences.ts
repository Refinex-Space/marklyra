import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef, useState } from 'react';
import { applicationPreferences } from '../../services/application-preferences.js';
import { desktopAvailable } from '../../services/documents.js';
import {
  type ApplicationPreferencesSnapshot,
  applicationPreferencesSnapshot,
} from './runtime-preferences/application-preferences.js';

const empty: ApplicationPreferencesSnapshot = { schemaVersion: 1, revision: 0, values: {} };
/** Native snapshots are overrides, preserving pre-existing local preferences on first use. */
export function useApplicationPreferences() {
  const [value, setValue] = useState<ApplicationPreferencesSnapshot | null>(
    desktopAvailable ? null : empty,
  );
  const current = useRef(value),
    [error, setError] = useState(''),
    [zoomError, setZoomError] = useState(''),
    [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry intentionally renews the native subscription/read.
  useEffect(() => {
    if (!desktopAvailable) return;
    let alive = true,
      stop: (() => void) | undefined;
    const accept = (input: unknown) => {
      if (!alive) return;
      const next = applicationPreferencesSnapshot(input);
      if (!current.current || next.revision >= current.current.revision) {
        current.current = next;
        setValue(next);
        setError('');
      }
    };
    void getCurrentWindow()
      .listen<unknown>('application-preferences-changed', (event) => {
        try {
          accept(event.payload);
        } catch (e) {
          setError(String(e));
        }
      })
      .then(async (unlisten) => {
        if (!alive) {
          unlisten();
          return;
        }
        stop = unlisten;
        accept(await applicationPreferences.get());
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
      stop?.();
    };
  }, [attempt]);
  const zoom = value ? Number(value.values.zoomFactor ?? 1) : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit retry reapplies the scale; unrelated preference snapshots must not relayout the WebView.
  useEffect(() => {
    if (!desktopAvailable || zoom === null) return;
    let alive = true;
    void applicationPreferences
      .applyZoom()
      .then(() => {
        if (alive) setZoomError('');
      })
      .catch((e) => {
        if (alive) setZoomError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [zoom, attempt]);
  return {
    value,
    error: [error, zoomError].filter(Boolean).join('；'),
    retry: () => setAttempt((n) => n + 1),
  };
}
