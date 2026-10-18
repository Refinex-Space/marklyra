import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type DocumentChange, desktopAvailable, documents } from '../../services/documents.js';
import type { useDocumentSession } from './useDocumentSession.js';

type Session = ReturnType<typeof useDocumentSession>;
type Notice = Exclude<DocumentChange, { status: 'unchanged' }>;
const sameVersion = (left: Notice | null, right: Notice) => {
  if (left?.status !== right.status) return false;
  if (left.status === 'changed' && right.status === 'changed')
    return (
      left.document.text === right.document.text &&
      left.document.encoding === right.document.encoding
    );
  return left.status !== 'changed' && right.status !== 'changed' && left.message === right.message;
};

/** Filesystem notifications are hints; authoritative bytes and version CAS live in Rust. */
export function useExternalChanges(session: Session) {
  const latest = useRef(session);
  latest.current = session;
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeRef = useRef<Notice | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [watchFallback, setWatchFallback] = useState(false);
  const holdLocal = useRef(false);
  const failedVersion = useRef<string | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = useRef(false);
  const notify = (value: Notice | null) => {
    if (value && !sameVersion(noticeRef.current, value)) setDismissed(false);
    noticeRef.current = value;
    setNotice(value);
  };
  const checkRef = useRef<() => Promise<void>>(async () => {});
  const schedule = useCallback((delay = 180) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void checkRef.current(), delay);
  }, []);

  const check = async () => {
    const api = latest.current;
    const id = api.file?.id;
    if (!desktopAvailable || !active.current || !id || api.file?.locationState === 'trashed')
      return;
    if (inFlight.current || api.working || api.pending) {
      again.current = true;
      return;
    }
    const epoch = generation.current;
    inFlight.current = true;
    setChecking(true);
    try {
      // A missing checkpoint (for example IME preedit) still permits detection,
      // but cannot authorize automatic view replacement.
      const expected = await api.observeExternal();
      const change = await documents.checkChange(id);
      if (!active.current || epoch !== generation.current || latest.current.file?.id !== id) return;
      if (change.status === 'unchanged') {
        if (noticeRef.current) latest.current.setMessage('');
        notify(null);
        holdLocal.current = false;
        failedVersion.current = null;
        return;
      }
      notify(change);
      if (change.status !== 'changed') return;
      if (holdLocal.current) {
        await documents.dismissChange(id, change.version);
        return;
      }
      if (
        expected &&
        !latest.current.dirty &&
        failedVersion.current !== change.version &&
        document.hasFocus() &&
        document.visibilityState === 'visible'
      ) {
        const outcome = await latest.current.reloadExternal(change, expected, true);
        if (!active.current || epoch !== generation.current) return;
        if (outcome === 'applied') notify(null);
        if (outcome === 'failed') failedVersion.current = change.version;
      }
    } catch (error) {
      if (active.current && epoch === generation.current) latest.current.setMessage(String(error));
    } finally {
      inFlight.current = false;
      if (active.current) {
        setChecking(false);
        if (again.current) {
          again.current = false;
          schedule();
        }
      }
    }
  };
  checkRef.current = check;

  // biome-ignore lint/correctness/useExhaustiveDependencies: a renamed native path revokes the old watcher lease even though its document ID stays unchanged.
  useEffect(() => {
    const id = session.file?.id;
    active.current = true;
    generation.current++;
    holdLocal.current = false;
    failedVersion.current = null;
    noticeRef.current = null;
    setNotice(null);
    setDismissed(false);
    setWatchFallback(false);
    if (session.file?.locationState === 'trashed') {
      active.current = false;
      return;
    }
    let alive = true;
    let watchId: string | undefined;
    const stops: (() => void)[] = [];
    const changed = () => schedule();
    window.addEventListener('focus', changed);
    document.addEventListener('visibilitychange', changed);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && document.hasFocus()) schedule(0);
    }, 15_000);
    if (id && desktopAvailable) {
      void (async () => {
        const stop = await getCurrentWindow().listen<{ id: string; watchId: string }>(
          'document-disk-change',
          (event) => {
            if (alive && event.payload.id === id && event.payload.watchId === watchId) changed();
          },
        );
        if (!alive) {
          stop();
          return;
        }
        stops.push(stop);
        const unFocus = await getCurrentWindow().onFocusChanged((event) => {
          if (alive && event.payload) changed();
        });
        if (!alive) {
          unFocus();
          return;
        }
        stops.push(unFocus);
        const result = await documents.startWatch(id);
        if (result.status === 'watching') {
          watchId = result.watchId;
          if (!alive) {
            await documents.stopWatch(id, watchId);
            return;
          }
        } else if (alive) setWatchFallback(true);
        if (alive) schedule(0);
      })().catch((error: unknown) => {
        if (alive) {
          setWatchFallback(true);
          latest.current.setMessage(String(error));
          schedule();
        }
      });
    }
    return () => {
      alive = false;
      active.current = false;
      generation.current++;
      if (timer.current) clearTimeout(timer.current);
      clearInterval(interval);
      window.removeEventListener('focus', changed);
      document.removeEventListener('visibilitychange', changed);
      for (const stop of stops) stop();
      if (id && watchId) void documents.stopWatch(id, watchId).catch(() => {});
    };
  }, [session.file?.id, session.file?.metadataRevision, session.file?.locationState, schedule]);

  useEffect(() => {
    if (!session.working && !session.pending && again.current) {
      again.current = false;
      schedule();
    }
  }, [session.working, session.pending, schedule]);
  useEffect(() => {
    if (session.file) schedule();
  }, [session.file, schedule]);

  const reload = async () => {
    const api = latest.current;
    const expected = await api.observeExternal().catch((error: unknown) => {
      api.setMessage(String(error));
      return null;
    });
    if (!expected) {
      api.setMessage('请先完成当前编辑操作');
      return;
    }
    if (expected.id !== latest.current.file?.id) return;
    if (inFlight.current) {
      api.setMessage('正在检查磁盘文件，请稍后重试');
      return;
    }
    const epoch = generation.current;
    inFlight.current = true;
    setChecking(true);
    try {
      // The displayed notice can be old or dismissed; reload always reads a fresh version.
      const change = await documents.checkChange(expected.id);
      if (!active.current || epoch !== generation.current) return;
      if (change.status === 'unchanged') {
        notify(null);
        holdLocal.current = false;
        return;
      }
      notify(change);
      if (change.status !== 'changed') return;
      const outcome = await latest.current.reloadExternal(change, expected, false);
      if (active.current && epoch === generation.current && outcome === 'applied') {
        holdLocal.current = false;
        failedVersion.current = null;
        notify(null);
      }
      if (active.current && epoch === generation.current && outcome === 'failed')
        failedVersion.current = change.version;
    } catch (error) {
      if (active.current && epoch === generation.current) latest.current.setMessage(String(error));
    } finally {
      inFlight.current = false;
      if (active.current) {
        setChecking(false);
        schedule();
      }
    }
  };
  const keepLocal = () => {
    holdLocal.current = true;
    setDismissed(true);
    const value = noticeRef.current;
    const epoch = generation.current;
    if (value?.status === 'changed')
      void documents.dismissChange(value.document.id, value.version).catch((error: unknown) => {
        if (active.current && epoch === generation.current)
          latest.current.setMessage(String(error));
      });
  };
  return {
    notice,
    dismissed,
    checking,
    watchFallback,
    check: () => schedule(0),
    reload,
    keepLocal,
    show: () => setDismissed(false),
  };
}
