import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useModalFocus } from '../../components/useModalFocus.js';
import { displayPath } from '../../services/display-path.js';
import { type RecentListing, recentFiles } from '../../services/recent.js';

export function RecentFilesPanel({ close, open }: { close(): void; open(id: string): void }) {
  const [listing, setListing] = useState<RecentListing | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const alive = useRef(true);
  const revision = useRef(0);
  const panel = useModalFocus(true, close, busy);
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
  const mutate = async (operation: () => Promise<RecentListing>) => {
    if (working.current) return;
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
      >
        <header className="recent-files-heading">
          <h2 id="recent-files-title">最近文件</h2>
          <p>选择文件继续编辑。移除或清空只影响此列表，不会删除文件。</p>
        </header>
        <div className="recent-files-body">
          {error && <p role="alert">{error}</p>}
          {!listing && !error && <p>正在读取最近文件…</p>}
          {listing?.entries.length === 0 && <p>暂无最近打开的文件。</p>}
          <ul className="recent-files-list">
            {listing?.entries.map((entry) => (
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
                >
                  <strong title={entry.name}>{entry.name}</strong>
                  <small>{new Date(entry.lastOpenedAt).toLocaleString()}</small>
                  <span title={displayPath(entry.path)}>{displayPath(entry.path)}</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`移除最近记录 ${displayPath(entry.path)}`}
                  onClick={() => void mutate(() => recentFiles.remove(entry.id))}
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        </div>
        <footer className="recent-files-actions">
          <button
            type="button"
            disabled={busy || (!error && !listing?.entries.length)}
            onClick={() => void mutate(recentFiles.clear)}
          >
            清空最近文件
          </button>
          <button type="button" disabled={busy} onClick={() => void refresh()}>
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
