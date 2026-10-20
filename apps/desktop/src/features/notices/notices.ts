import { useEffect, useSyncExternalStore } from 'react';

export type NoticeKind = 'info' | 'error';

export interface Notice {
  id: number;
  text: string;
  kind: NoticeKind;
}

const LIFETIME: Record<NoticeKind, number> = { info: 4500, error: 7000 };
const VISIBLE = 3;

let notices: Notice[] = [];
let next = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function publish(list: Notice[]) {
  notices = list;
  for (const listener of listeners) listener();
}

export function dismissNotice(id: number) {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
  publish(notices.filter((notice) => notice.id !== id));
}

/** Shows a short-lived message in the window's bottom-right corner. A repeated message restarts
 * its timer instead of stacking, and only the newest few stay on screen. */
export function notify(text: string, kind: NoticeKind = 'info') {
  const message = text.trim();
  if (!message) return;
  const existing = notices.find((notice) => notice.text === message && notice.kind === kind);
  const id = existing?.id ?? next++;
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.set(
    id,
    setTimeout(() => dismissNotice(id), LIFETIME[kind]),
  );
  if (existing) return;
  const list = [...notices, { id, text: message, kind }];
  for (const evicted of list.slice(0, Math.max(0, list.length - VISIBLE))) {
    const pending = timers.get(evicted.id);
    if (pending !== undefined) clearTimeout(pending);
    timers.delete(evicted.id);
  }
  publish(list.slice(-VISIBLE));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNotices(): readonly Notice[] {
  return useSyncExternalStore(
    subscribe,
    () => notices,
    () => notices,
  );
}

/** Reports `text` whenever it becomes a new non-empty value. */
export function useNotice(text: string | null | undefined, kind: NoticeKind = 'info') {
  useEffect(() => {
    if (text) notify(text, kind);
  }, [text, kind]);
}
