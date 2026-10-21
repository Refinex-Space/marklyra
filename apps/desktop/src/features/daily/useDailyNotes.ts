import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type DailyLocation, type DailyNote, dailyNotes } from '../../services/daily.js';
import { desktopAvailable } from '../../services/documents.js';
import { type Agenda, parseAgenda } from './daily-agenda.js';
import { todayKey } from './daily-dates.js';

/** The local date, rolling over at midnight and whenever the window returns from sleep. */
export function useToday(): string {
  const [today, setToday] = useState(() => todayKey());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      setToday(todayKey());
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(update, Math.min(midnight.getTime() - now.getTime(), 3_600_000));
    };
    update();
    const visible = () => {
      if (document.visibilityState === 'visible') update();
    };
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  return today;
}

export interface DayNote extends DailyNote {
  /** Null when the file is too large or not UTF-8 to read here. */
  agenda: Agenda | null;
}
export type DailyNotesStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Notes for the keys on screen. Previous marks stay visible while a refresh runs, so
 * the grid never flickers; a failure is reported instead of waiting forever.
 */
export function useDailyNotes(
  location: DailyLocation | null,
  keys: readonly string[],
  refresh: number,
) {
  const [notes, setNotes] = useState<ReadonlyMap<string, DayNote>>(new Map());
  const [status, setStatus] = useState<DailyNotesStatus>('idle');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [changed, setChanged] = useState(0);
  const generation = useRef(0);
  const scope = location ? `${location.workspaceId}\n${location.folder}\n${location.layout}` : '';
  const keyList = keys.join(',');
  useEffect(() => {
    if (!desktopAvailable || !scope) return;
    let live = true;
    const stop = listen('workspace-files-changed', () => {
      if (live) setChanged((value) => value + 1);
    });
    const focus = () => setChanged((value) => value + 1);
    window.addEventListener('focus', focus);
    return () => {
      live = false;
      window.removeEventListener('focus', focus);
      void stop.then((dispose) => dispose()).catch(() => {});
    };
  }, [scope]);
  const previousScope = useRef(scope);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh, attempt and changed are explicit reload triggers.
  useEffect(() => {
    const ticket = ++generation.current;
    if (previousScope.current !== scope) {
      previousScope.current = scope;
      setNotes(new Map());
    }
    if (!desktopAvailable || !location || !keyList) {
      setStatus('idle');
      return;
    }
    setStatus('loading');
    void dailyNotes
      .read(location, keyList.split(','))
      .then((result) => {
        if (generation.current !== ticket) return;
        setNotes(
          new Map(
            result.map((note) => [
              note.key,
              { ...note, agenda: note.text === null ? null : parseAgenda(note.text) },
            ]),
          ),
        );
        setError('');
        setStatus('ready');
      })
      .catch((reason: unknown) => {
        if (generation.current !== ticket) return;
        setError(String(reason));
        setStatus('error');
      });
  }, [scope, keyList, refresh, attempt, changed]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return useMemo(() => ({ notes, status, error, retry }), [notes, status, error, retry]);
}
