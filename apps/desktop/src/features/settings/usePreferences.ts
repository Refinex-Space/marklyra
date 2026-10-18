import { type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import {
  type Preferences,
  preferencesKey,
  readPreferences,
  savePreferences,
} from './preferences.js';

/** Persist only explicit edits. Rereading another window must never write a stale snapshot. */
export function usePreferences() {
  const [value, setValue] = useState(readPreferences);
  const current = useRef(value);
  current.current = value;
  const reload = useCallback(() => {
    const next = readPreferences();
    current.current = next;
    setValue(next);
  }, []);
  const update = useCallback((change: SetStateAction<Preferences>) => {
    const next = typeof change === 'function' ? change(current.current) : change;
    current.current = next;
    savePreferences(next);
    setValue(next);
  }, []);
  useEffect(() => {
    const storage = (event: StorageEvent) => {
      if (event.key === preferencesKey || event.key === null) reload();
    };
    window.addEventListener('storage', storage);
    window.addEventListener('marklyra-preferences-changed', reload);
    return () => {
      window.removeEventListener('storage', storage);
      window.removeEventListener('marklyra-preferences-changed', reload);
    };
  }, [reload]);
  return [value, update, reload] as const;
}
