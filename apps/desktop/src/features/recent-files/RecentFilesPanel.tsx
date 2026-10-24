import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { SkeletonRows } from '../../components/Skeleton.js';
import { useModalFocus } from '../../components/useModalFocus.js';
import { displayPath } from '../../services/display-path.js';
import { type RecentListing, recentFiles } from '../../services/recent.js';
import { relativeTime } from '../quick-open/quick-open-model.js';
import { recentFileLocation, recentFileName } from './recent-file-presentation.js';

export function RecentFilesPanel({ close, open }: { close(): void; open(id: string): void }) {
  const [listing, setListing] = useState<RecentListing | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const alive = useRef(true);
  const revision = useRef(0);
  const panel = useModalFocus(true, close, busy);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const focusAfterMutation = useRef<{ previous: Element | null; row: number | null } | null>(null);
  useLayoutEffect(() => {
    if (busy || !focusAfterMutation.current) return;
    const { previous, row } = focusAfterMutation.current;
    focusAfterMutation.current = null;
    const owner = panel.current?.ownerDocument;
    if (!owner || (owner.activeElement !== owner.body && owner.activeElement !== previous)) return;
    const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('.recent-file-remove');
    const target =
      row !== null && buttons?.length ? buttons[Math.min(row, buttons.length - 1)] : null;
    (target ?? refreshButton.current)?.focus({ preventScroll: true });
  }, [busy, panel]);
  const refresh = useCallback(async () => {
    const ticket = ++revision.current;
    try {
      const next = await recentFiles.list();
      if (!alive.current || ticket !== revision.current) return;
      setListing(next);
      setError('');
    } catch (error) {
      if (alive.current && ticket === revision.current) setError(String(error));
    }
  }, []);
  useEffect(() => {
    let subscribed = true;
    alive.current = true;
    void refresh();
    let stop: (() => void) | undefined;
    void listen('recent-files-changed', () => {
      if (subscribed) void refresh();
    }).then(
      (unlisten) => {
        if (subscribed) stop = unlisten;
        else unlisten();
      },
      () => {
        if (subscribed) setError('最近文件自动刷新不可用，可手动刷新列表。');
      },
    );
    return () => {
      subscribed = false;
      alive.current = false;
      revision.current++;
      stop?.();
    };
  }, [refresh]);
  const mutate = async (operation: () => Promise<RecentListing>, row: number | null = null) => {
    if (working.current) return;
    focusAfterMutation.current = {
      previous: panel.current?.ownerDocument.activeElement ?? null,
      row,
    };
    working.current = true;
    setBusy(true);
    // A slow earlier list response must not restore a removed row.
    revision.current++;
    try {
      await operation();
      if (!alive.current) return;
      // Read again after commit, including changes committed by another window
      // between the mutation response and its event notification.
      await refresh();
    } catch (error) {
      if (alive.current) setError(String(error));
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <section
        ref={panel}
        className="recent-files-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recent-files-title"
        aria-describedby="recent-files-hint"
      >
        <header className="recent-files-heading">
          <h2 id="recent-files-title">最近文件</h2>
          <p id="recent-files-hint">移除或清空记录不会删除文件</p>
        </header>
        <div className="recent-files-body">
          {error && <p role="alert">{error}</p>}
          {!listing && !error && (
            <SkeletonRows rows={4} icon height={44} label="正在读取最近文件" />
          )}
          {listing?.entries.length === 0 && <p>暂无最近打开的文件。</p>}
          <ul className="recent-files-list" aria-label="最近打开的文件">
            {listing?.entries.map((entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="recent-file-open"
                  disabled={busy}
                  onClick={() => {
                    close();
                    open(entry.id);
                  }}
                  aria-label={`打开最近文件 ${displayPath(entry.path)}`}
                  title={displayPath(entry.path)}
                >
                  <Icon name="document" />
                  <span className="recent-file-name">{recentFileName(entry.name)}</span>
                  <span className="recent-file-where" title={displayPath(entry.path)}>
                    {recentFileLocation(entry.path)}
                  </span>
                  <time
                    className="recent-file-time"
                    dateTime={new Date(entry.lastOpenedAt).toISOString()}
                    title={new Date(entry.lastOpenedAt).toLocaleString()}
                  >
                    {relativeTime(entry.lastOpenedAt)}
                  </time>
                </button>
                <button
                  type="button"
                  className="recent-file-remove"
                  disabled={busy}
                  aria-label={`移除最近记录 ${displayPath(entry.path)}`}
                  title="移除记录，不删除文件"
                  onClick={() => void mutate(() => recentFiles.remove(entry.id), index)}
                >
                  <Icon name="close" />
                </button>
              </li>
            ))}
          </ul>
        </div>
        <footer className="recent-files-actions">
          <button
            type="button"
            className="recent-files-clear"
            disabled={busy || (!error && !listing?.entries.length)}
            onClick={() => void mutate(recentFiles.clear)}
          >
            清空记录
          </button>
          <button ref={refreshButton} type="button" disabled={busy} onClick={() => void refresh()}>
            刷新
          </button>
          <button type="button" disabled={busy} onClick={close}>
            关闭
          </button>
        </footer>
      </section>
    </div>
  );
}
