import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Skeleton, SkeletonBar } from '../../components/Skeleton.js';
import { useModalFocus } from '../../components/useModalFocus.js';
import { notify } from '../notices/notices.js';
import './cli-install.css';

interface CliStatus {
  path: string;
  directory: string;
  installed: boolean;
  ours: boolean;
  current: boolean;
  onPath: boolean;
}

/** Installs, refreshes or removes the `marklyra` launcher in the person's own bin folder. */
export function CliInstallDialog({ close }: { close(): void }) {
  const [status, setStatus] = useState<CliStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const panel = useModalFocus(true, close, busy);
  useEffect(() => {
    invoke<CliStatus>('cli_status').then(setStatus, (e: unknown) => setError(String(e)));
  }, []);
  const run = async (command: 'cli_install' | 'cli_uninstall') => {
    setBusy(true);
    setError('');
    try {
      const next = await invoke<CliStatus>(command);
      setStatus(next);
      if (command === 'cli_uninstall') {
        notify('已卸载命令行工具', 'success');
        close();
      } else if (next.onPath) {
        notify('已安装：在新的终端里运行 marklyra', 'success');
        close();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const pathLine = status ? `export PATH="${status.directory}:$PATH"` : '';
  const foreign = status?.installed && !status.ours;
  return createPortal(
    <div className="cli-layer">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a press outside only dismisses; Escape is the keyboard path. */}
      <div className="cli-scrim" onMouseDown={() => !busy && close()} />
      <section
        ref={panel}
        className="cli-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cli-install-title"
      >
        <h2 id="cli-install-title">命令行工具</h2>
        {!status && !error ? (
          <Skeleton label="正在读取">
            <SkeletonBar width="80%" />
            <SkeletonBar width="55%" />
          </Skeleton>
        ) : status ? (
          <>
            <p>
              在终端中用 <code>marklyra</code> 查询和修改任务，与应用读写同一份文件。
            </p>
            <dl className="cli-facts">
              <dt>位置</dt>
              <dd>
                <code>{status.path}</code>
              </dd>
              <dt>状态</dt>
              <dd>
                {!status.installed
                  ? '未安装'
                  : foreign
                    ? '已有同名文件（不是 MarkLyra 安装的），不会改动'
                    : status.current
                      ? '已安装'
                      : '已安装，指向旧的应用位置'}
              </dd>
            </dl>
            {status.installed && !status.onPath && !foreign && (
              <div className="cli-path">
                <span>该文件夹不在 PATH 中，把这一行加入 shell 配置（如 ~/.zshrc）：</span>
                <code>{pathLine}</code>
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard?.writeText(pathLine).then(() => notify('已复制'))
                  }
                >
                  复制
                </button>
              </div>
            )}
          </>
        ) : null}
        {error && (
          <p className="cli-error" role="alert">
            {error}
          </p>
        )}
        <div className="cli-actions">
          {status?.installed && status.ours && (
            <button type="button" disabled={busy} onClick={() => void run('cli_uninstall')}>
              卸载
            </button>
          )}
          <span className="cli-spacer" />
          <button type="button" disabled={busy} onClick={close}>
            {status?.installed && status.current ? '完成' : '取消'}
          </button>
          {status && !foreign && !(status.installed && status.current) && (
            <button
              type="button"
              className="cli-primary"
              disabled={busy}
              onClick={() => void run('cli_install')}
            >
              {status.installed ? '重新安装' : '安装'}
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
