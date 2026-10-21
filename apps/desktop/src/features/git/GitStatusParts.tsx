import { git } from '../../services/git.js';
import { GitGlyph } from './GitGlyph.js';
import { useGit } from './GitProvider.js';

const OPERATIONS = {
  merging: '正在合并',
  rebasing: '正在变基',
  'cherry-picking': '正在拣选',
  reverting: '正在还原提交',
  bisecting: '正在二分查找',
} as const;

/** The running operation, Git's own progress, and cancellation for network work. */
export function ProgressLine() {
  const { busy, progress, cancel } = useGit();
  if (!busy) return null;
  const percent = progress?.percent ?? null;
  return (
    <div className="git-progress" role="status" aria-live="polite">
      <div className="git-progress-text">
        <span className="git-spinner" aria-hidden="true" />
        <span>
          {busy.label}
          {progress?.phase ? ` · ${progress.phase}` : ''}
          {percent !== null ? ` ${percent}%` : ''}
        </span>
        {busy.network && (
          <button type="button" className="git-link-button" onClick={cancel}>
            取消
          </button>
        )}
      </div>
      <div
        className="git-progress-track"
        data-indeterminate={percent === null || undefined}
        aria-hidden="true"
      >
        <i style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** A merge, rebase or pick in progress, with the ways out of it. */
export function OperationBanner({ compact = false }: { compact?: boolean }) {
  const context = useGit();
  const repository = context.probe?.repository;
  const operation = repository?.operation ?? 'none';
  if (!repository || operation === 'none') return null;
  const conflicts = (context.status?.changes ?? []).filter(
    (change) => change.kind === 'conflicted',
  );
  const busy = context.busy !== null;
  const act = (action: 'continue' | 'abort' | 'skip', label: string) =>
    void context
      .run(label, (id) => git.operation(id, action), { touchesWorkTree: true })
      .then((result) => {
        if (action === 'abort') return;
        context.reportUpdate(label, result);
      });
  const abortLabel =
    operation === 'merging' ? '中止合并' : operation === 'rebasing' ? '中止变基' : '中止';
  return (
    <div className="git-operation" data-compact={compact || undefined} role="status">
      <GitGlyph name="conflict" />
      <span className="git-operation-text">
        {OPERATIONS[operation]}
        {conflicts.length > 0 ? `，${conflicts.length} 个文件有冲突` : '，冲突已全部解决'}
      </span>
      <span className="git-operation-actions">
        {conflicts.length > 0 ? (
          <button
            type="button"
            className="git-button git-button-primary"
            disabled={busy}
            onClick={() => context.openDialog({ kind: 'conflicts' })}
          >
            解决冲突…
          </button>
        ) : (
          operation !== 'bisecting' && (
            <button
              type="button"
              className="git-button git-button-primary"
              disabled={busy}
              onClick={() => act('continue', operation === 'merging' ? '提交合并' : '继续')}
            >
              {operation === 'merging' ? '提交合并' : '继续'}
            </button>
          )
        )}
        {operation === 'rebasing' && (
          <button
            type="button"
            className="git-button"
            disabled={busy}
            title="跳过当前提交"
            onClick={() => act('skip', '跳过提交')}
          >
            跳过
          </button>
        )}
        {operation !== 'bisecting' && (
          <button
            type="button"
            className="git-button"
            disabled={busy}
            onClick={() =>
              context.openDialog({
                kind: 'confirm',
                title: abortLabel,
                message: '将放弃本次操作中的所有更改（包括已解决的冲突），回到操作开始之前的状态。',
                confirm: abortLabel,
                danger: true,
                run: () => act('abort', abortLabel),
              })
            }
          >
            {abortLabel}
          </button>
        )}
      </span>
    </div>
  );
}
