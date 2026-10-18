import type { useExternalChanges } from './useExternalChanges.js';

export function ExternalChangeNotice({
  sync,
  busy,
  saveAs,
}: {
  sync: ReturnType<typeof useExternalChanges>;
  busy: boolean;
  saveAs(): void;
}) {
  const notice = sync.notice;
  if (!notice || sync.dismissed) return null;
  const changed = notice.status === 'changed';
  return (
    <section className="external-change-notice" role="status" aria-label="磁盘文件变化">
      <div>
        <strong>{changed ? '磁盘文件已更新' : '磁盘文件暂不可用'}</strong>
        <p>
          {notice.status === 'changed'
            ? '当前编辑内容仍保留。载入磁盘版本后，可以撤销回到当前内容。'
            : notice.message}
        </p>
      </div>
      <div className="external-change-actions">
        {changed && (
          <button type="button" disabled={busy || sync.checking} onClick={() => void sync.reload()}>
            载入磁盘版本
          </button>
        )}
        <button type="button" disabled={busy || sync.checking} onClick={sync.keepLocal}>
          继续编辑
        </button>
        <button type="button" disabled={busy || sync.checking} onClick={saveAs}>
          另存为…
        </button>
        {!changed && (
          <button type="button" disabled={busy || sync.checking} onClick={sync.check}>
            重新检查
          </button>
        )}
      </div>
    </section>
  );
}
