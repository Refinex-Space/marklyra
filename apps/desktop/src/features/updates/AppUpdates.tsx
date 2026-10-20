import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { AgentDialog } from '../ai/AgentDialog.js';
import './app-updates.css';

export interface UpdateSnapshot {
  currentVersion: string;
  automatic: boolean;
  phase: string;
  version: string | null;
  downloaded: number;
  total: number | null;
  message: string;
}
export const appUpdates = {
  status: () => invoke<UpdateSnapshot>('app_update_status'),
  automatic: (automatic: boolean) => invoke<void>('app_update_automatic', { automatic }),
  open: () => window.dispatchEvent(new Event('marklyra-open-updates')),
};

/** Lives in the trusted shell; the preferences iframe can only request opening it. */
export function AppUpdates() {
  const [snapshot, setSnapshot] = useState<UpdateSnapshot | null>(null);
  const [opened, setOpened] = useState(false);
  const [hiddenVersion, setHiddenVersion] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const run = useCallback(async (command: string) => {
    setError('');
    setPending(true);
    try {
      await invoke(command);
      setSnapshot(await appUpdates.status());
    } catch (error) {
      setError(String(error));
      if (command === 'app_update_install') setOpened(true);
    } finally {
      setPending(false);
    }
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    let received = false;
    void listen<UpdateSnapshot>('app-update-changed', ({ payload }) => {
      received = true;
      if (alive) setSnapshot(payload);
    })
      .then(async (dispose) => {
        if (!alive) {
          dispose();
          return;
        }
        unlisten = dispose;
        const current = await appUpdates.status();
        if (alive && !received) setSnapshot(current);
      })
      .catch(() => {});
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    const open = () => {
      setError('');
      setOpened(true);
      void run('app_update_check');
    };
    window.addEventListener('marklyra-open-updates', open);
    return () => window.removeEventListener('marklyra-open-updates', open);
  }, [run]);
  const busy = pending || snapshot?.phase === 'checking' || snapshot?.phase === 'downloading';
  const available = snapshot?.phase === 'available';
  const ready = snapshot?.phase === 'ready';
  const close = () => {
    if (snapshot?.version) setHiddenVersion(snapshot.version);
    setOpened(false);
  };
  return (
    <>
      {!opened && (available || ready) && snapshot?.version !== hiddenVersion && (
        <aside className="app-update-notice" role="status">
          <span>
            MarkLyra {snapshot?.version} {ready ? '已下载' : '可更新'}
          </span>
          <button type="button" onClick={() => setOpened(true)}>
            查看更新
          </button>
          <button type="button" aria-label="稍后更新" onClick={close}>
            稍后
          </button>
        </aside>
      )}
      {opened && (
        <AgentDialog title="软件更新" close={close} className="app-update-dialog" focusContainer>
          <p>当前版本 {snapshot?.currentVersion || '—'}</p>
          {snapshot?.version && <p>新版本 {snapshot.version}</p>}
          <p role="status" aria-live="polite">
            {snapshot?.phase === 'checking'
              ? '正在检查更新…'
              : snapshot?.phase === 'current'
                ? '当前已是最新版本。'
                : snapshot?.phase === 'downloading'
                  ? `正在下载… ${snapshot.total ? `${Math.min(100, Math.floor((snapshot.downloaded / snapshot.total) * 100))}%` : `${(snapshot.downloaded / 1024 / 1024).toFixed(1)} MB`}`
                  : ready
                    ? '下载完成，签名校验通过。安装前将逐个处理打开的文稿；取消关闭也会取消本次安装。'
                    : available
                      ? '发现新版本，可下载更新。'
                      : ''}
          </p>
          {(error || snapshot?.message) && <p role="alert">{error || snapshot?.message}</p>}
          <div className="app-update-actions">
            <button type="button" onClick={close}>
              稍后
            </button>
            {available && (
              <button type="button" disabled={busy} onClick={() => void run('app_update_download')}>
                下载更新
              </button>
            )}
            {ready && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  flushSync(close);
                  void run('app_update_install');
                }}
              >
                安装并重启
              </button>
            )}
            {!available && !ready && (
              <button type="button" disabled={busy} onClick={() => void run('app_update_check')}>
                检查更新
              </button>
            )}
          </div>
        </AgentDialog>
      )}
    </>
  );
}
