import { useEffect, useRef } from 'react';
import { notify } from '../notices/notices.js';
import { CommitTab } from './CommitTab.js';
import { GitGlyph } from './GitGlyph.js';
import { type GitTab, useOptionalGit } from './GitProvider.js';
import { OperationBanner, ProgressLine } from './GitStatusParts.js';
import { LogTab } from './LogTab.js';
import { RepositoryPanel } from './RepositoryPanel.js';
import { StashTab } from './StashTab.js';

const TABS: { id: GitTab; label: string }[] = [
  { id: 'commit', label: '提交' },
  { id: 'log', label: '日志' },
  { id: 'stash', label: '储藏' },
  { id: 'repository', label: '仓库' },
];

/** Repository path to a workspace-relative path, or null when outside the open folder. */
export function workspacePath(path: string, prefix: string): string | null {
  if (!prefix) return path;
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : null;
}

/**
 * The Git view. It covers the document card the way the home view does; the sidebar stays, so
 * files remain one click away.
 */
export function GitWorkbench(props: {
  openDocument: (workspaceRelativePath: string) => void;
  openSettings: () => void;
}) {
  const optional = useOptionalGit();
  const view = optional?.view ?? null;
  const root = useRef<HTMLElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: focus once per opening request.
  useEffect(() => {
    if (view) root.current?.focus({ preventScroll: true });
  }, [view?.serial]);
  if (!view || !optional) return null;
  const context = optional;
  const { probe, status, busy } = context;
  const tab = view.tab;
  const repository = probe?.repository ?? null;
  const changes = status?.changes.length ?? 0;
  const head = status?.head ?? repository?.head;
  const ahead = status?.ahead ?? repository?.ahead ?? 0;
  const behind = status?.behind ?? repository?.behind ?? 0;
  const hasRemote = (repository?.remotes.length ?? 0) > 0;
  const blocked = (repository?.operation ?? 'none') !== 'none';
  const openDocument = (path: string) => {
    const relative = workspacePath(path, repository?.workspacePrefix ?? '');
    if (relative === null) {
      notify('该文件不在当前打开的文件夹中', 'warning');
      return;
    }
    context.closeView();
    props.openDocument(relative);
  };
  const shownTab = repository ? tab : 'repository';
  return (
    <section
      ref={root}
      className="git-workbench"
      aria-label="Git"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (
          event.key === 'Escape' &&
          !event.defaultPrevented &&
          !context.dialogs.length &&
          !context.branchPopup
        ) {
          const target = event.target as HTMLElement;
          if (target.closest('.git-menu')) return;
          event.preventDefault();
          context.closeView();
        }
      }}
    >
      <header className="git-workbench-header">
        <button
          type="button"
          className="git-branch-widget git-workbench-branch"
          aria-haspopup="dialog"
          title="分支"
          onClick={(event) => context.openBranches(event.currentTarget.getBoundingClientRect())}
        >
          <GitGlyph name="branch" />
          <span className="git-branch-widget-name">
            {repository
              ? head?.detached
                ? (head.oid?.slice(0, 8) ?? 'HEAD')
                : (head?.branch ?? 'HEAD')
              : 'Git'}
          </span>
          {(behind > 0 || ahead > 0) && (
            <span className="git-branch-widget-track">
              {behind > 0 && <span className="git-incoming">↓{behind}</span>}
              {ahead > 0 && <span className="git-outgoing">↑{ahead}</span>}
            </span>
          )}
          <GitGlyph name="chevronDown" />
        </button>
        {repository?.upstream && (
          <span className="git-muted git-upstream">→ {repository.upstream}</span>
        )}
        <div className="git-tabs" role="tablist" aria-label="Git 视图">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={shownTab === item.id}
              disabled={!repository && item.id !== 'repository'}
              onClick={() => context.openView(item.id)}
            >
              {item.label}
              {item.id === 'commit' && changes > 0 && <span className="git-count">{changes}</span>}
            </button>
          ))}
        </div>
        <span className="git-toolbar-spacer" />
        {repository && (
          <div className="git-workbench-actions" role="toolbar" aria-label="Git 操作">
            <button
              type="button"
              className="git-button git-button-primary"
              disabled={!!busy || !hasRemote || blocked}
              title={hasRemote ? '提交本地更改，拉取远程更新，再推送' : '请先添加远程仓库'}
              onClick={() => void context.sync('manual')}
            >
              <GitGlyph name="sync" />
              同步
            </button>
            <button
              type="button"
              className="git-icon-button"
              aria-label="更新项目"
              title={`更新项目（${{ merge: '合并', rebase: '变基', 'ff-only': '仅快进' }[context.preferences.pullMethod]}）`}
              disabled={!!busy || !repository.upstream || blocked}
              onClick={() => void context.update()}
            >
              <GitGlyph name="pull" />
            </button>
            <button
              type="button"
              className="git-icon-button"
              aria-label="推送"
              title="推送…"
              disabled={!!busy || !repository.head.branch}
              onClick={() => context.openDialog({ kind: 'push' })}
            >
              <GitGlyph name="push" />
            </button>
            <button
              type="button"
              className="git-icon-button"
              aria-label="获取"
              title="获取全部远程"
              disabled={!!busy || !hasRemote}
              onClick={() => void context.fetch()}
            >
              <GitGlyph name="fetch" />
            </button>
            <button
              type="button"
              className="git-icon-button"
              aria-label="Git 设置"
              title="Git 同步设置"
              onClick={props.openSettings}
            >
              <GitGlyph name="settings" />
            </button>
          </div>
        )}
        <button
          type="button"
          className="git-icon-button"
          aria-label="关闭 Git 视图"
          title="关闭（Esc）"
          onClick={context.closeView}
        >
          <GitGlyph name="close" />
        </button>
      </header>
      <ProgressLine />
      <OperationBanner />
      <div className="git-workbench-body" role="tabpanel">
        {shownTab === 'commit' && <CommitTab openDocument={openDocument} />}
        {shownTab === 'log' && <LogTab filter={view.filter} />}
        {shownTab === 'stash' && <StashTab />}
        {shownTab === 'repository' && (
          <div className="git-scroll-page">
            <RepositoryPanel onOpenSettings={props.openSettings} />
          </div>
        )}
      </div>
    </section>
  );
}
