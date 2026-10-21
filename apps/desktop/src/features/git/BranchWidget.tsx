import { relativeTime, shortOid } from './GitDialogFrame.js';
import { GitGlyph } from './GitGlyph.js';
import { useOptionalGit } from './GitProvider.js';

/**
 * The branch button at the top of the sidebar. It names the checked-out branch, shows what is
 * waiting to be pulled or pushed and whether anything is running, and opens the branch popup.
 */
export function BranchWidget() {
  const context = useOptionalGit();
  if (!context?.workspace) return null;
  const { probe, status, busy, lastSync, branchPopup } = context;
  const repository = probe?.repository ?? null;
  const head = status?.head ?? repository?.head;
  const ahead = status?.ahead ?? repository?.ahead ?? 0;
  const behind = status?.behind ?? repository?.behind ?? 0;
  const changes = status?.changes.length ?? 0;
  const conflicts = status?.changes.filter((change) => change.kind === 'conflicted').length ?? 0;
  const operation = status?.operation ?? repository?.operation ?? 'none';
  let label: string;
  let title: string;
  if (!probe) {
    label = 'Git';
    title = '正在检测 Git 仓库';
  } else if (!probe.git || probe.problem) {
    label = 'Git';
    title = probe.problem?.message ?? '未找到 Git';
  } else if (!repository || !head) {
    label = 'Git';
    title = '此文件夹还不是 Git 仓库，点击初始化';
  } else {
    label = head.detached ? shortOid(head.oid) : (head.branch ?? 'HEAD');
    const parts = [
      head.detached ? `分离 HEAD：${head.oid ?? ''}` : `当前分支：${label}`,
      repository.upstream ? `跟踪：${repository.upstream}` : '没有跟踪的远程分支',
    ];
    if (behind) parts.push(`${behind} 个传入提交`);
    if (ahead) parts.push(`${ahead} 个待推送提交`);
    if (changes) parts.push(`${changes} 个文件有更改`);
    if (lastSync)
      parts.push(
        `${lastSync.ok ? '上次同步' : '同步失败'}：${relativeTime(lastSync.time / 1000)}${lastSync.ok ? '' : ` · ${lastSync.message}`}`,
      );
    title = parts.join('\n');
  }
  const state = !repository
    ? 'none'
    : conflicts || operation !== 'none'
      ? 'conflict'
      : lastSync && !lastSync.ok
        ? 'error'
        : changes
          ? 'dirty'
          : 'clean';
  return (
    <button
      type="button"
      className="git-branch-widget"
      data-state={state}
      data-busy={busy ? true : undefined}
      aria-haspopup="dialog"
      aria-expanded={branchPopup !== null}
      aria-label={repository ? `Git 分支：${label}` : 'Git'}
      title={title}
      onClick={(event) =>
        context.openBranches(branchPopup ? null : event.currentTarget.getBoundingClientRect())
      }
    >
      <GitGlyph name={busy ? 'sync' : 'branch'} className={busy ? 'git-spin' : undefined} />
      <span className="git-branch-widget-name">{label}</span>
      {repository && (behind > 0 || ahead > 0) && (
        <span className="git-branch-widget-track" aria-hidden="true">
          {behind > 0 && <span className="git-incoming">↓{behind}</span>}
          {ahead > 0 && <span className="git-outgoing">↑{ahead}</span>}
        </span>
      )}
      {repository && state !== 'clean' && (
        <i className="git-branch-widget-dot" aria-hidden="true" />
      )}
    </button>
  );
}
