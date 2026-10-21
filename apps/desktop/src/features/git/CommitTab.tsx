import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SkeletonRows } from '../../components/Skeleton.js';
import { desktopAvailable } from '../../services/documents.js';
import { type GitChange, git } from '../../services/git.js';
import { notify } from '../notices/notices.js';
import { DiffPanel } from './DiffPanel.js';
import { FileList } from './FileList.js';
import { GitGlyph } from './GitGlyph.js';
import { GitMenu, type GitMenuEntry } from './GitMenu.js';
import type { DiffSide } from './GitProvider.js';
import { useGit } from './GitProvider.js';
import { commitMessage } from './git-preferences.js';

export async function copyText(text: string) {
  try {
    if (desktopAvailable) await invoke('clipboard_write', { data: { text } });
    else await navigator.clipboard.writeText(text);
    notify('已复制', 'success');
  } catch (error) {
    notify(`复制失败：${String(error)}`, 'error');
  }
}

/** The two sides of a work-tree change: HEAD (none for new files) against the file on disk. */
export function changeSides(
  change: GitChange,
  unborn: boolean,
): { left: DiffSide; right: DiffSide } {
  const isNew = change.kind === 'untracked' || change.kind === 'added' || unborn;
  return {
    left: { rev: isNew ? null : 'HEAD', label: isNew ? '（新文件）' : 'HEAD' },
    right: {
      rev: change.kind === 'deleted' ? null : 'WORKTREE',
      label: change.kind === 'deleted' ? '（已删除）' : '工作区',
    },
  };
}

/** IDEA's non-modal commit: changed files with inclusion checkboxes, the message, and a live diff. */
export function CommitTab(props: { openDocument: (repositoryPath: string) => void }) {
  const context = useGit();
  const { status, probe } = context;
  const repository = probe?.repository;
  const changes = status?.changes ?? [];
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [amend, setAmend] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const messageField = useRef<HTMLTextAreaElement>(null);
  const operation = repository?.operation ?? 'none';
  const unborn = repository?.head.unborn ?? false;

  const conflicts = changes.filter((change) => change.kind === 'conflicted');
  const regular = changes.filter((change) => change.kind !== 'conflicted');
  const included = useMemo(
    () =>
      new Set(regular.filter((change) => !excluded.has(change.path)).map((change) => change.path)),
    [regular, excluded],
  );
  useEffect(() => {
    if (selected && changes.some((change) => change.path === selected)) return;
    setSelected(changes[0]?.path ?? null);
  }, [changes, selected]);
  const selectedChange = changes.find((change) => change.path === selected) ?? null;
  const sides = selectedChange ? changeSides(selectedChange, unborn) : null;

  const toggleAmend = async (value: boolean) => {
    setAmend(value);
    const id = context.workspace?.id;
    if (!value || message.trim() || !id || unborn) return;
    try {
      const page = await git.log(id, { revisions: ['HEAD'], skip: 0, limit: 1 });
      const last = page.commits[0];
      if (!last) return;
      const details = await git.commitDetails(id, last.oid);
      setMessage([details.commit.subject, details.commit.body].filter(Boolean).join('\n\n'));
    } catch {
      // The message stays empty; amending still works with a typed message.
    }
  };
  const commit = async (push: boolean) => {
    const paths = [...included];
    const text = message.trim();
    if (!text || (!paths.length && !amend)) return;
    const result = await context.run('提交', (id) => git.commit(id, text, paths, amend), {
      success: (value) => `已提交 ${paths.length} 个文件（${value.oid.slice(0, 8)}）`,
    });
    if (!result) return;
    setMessage('');
    setAmend(false);
    setExcluded(new Set());
    if (push) context.openDialog({ kind: 'push' });
  };
  const rollback = (paths: string[]) => {
    const tracked = changes.filter(
      (change) => paths.includes(change.path) && change.kind !== 'untracked',
    );
    if (!tracked.length) {
      notify('未跟踪的文件没有可回滚的版本', 'info');
      return;
    }
    context.openDialog({
      kind: 'confirm',
      title: '回滚更改',
      message: (
        <>
          <p>以下 {tracked.length} 个文件将恢复到 HEAD 中的版本，未提交的修改会丢失：</p>
          <ul className="git-confirm-list">
            {tracked.slice(0, 12).map((change) => (
              <li key={change.path}>{change.path}</li>
            ))}
            {tracked.length > 12 && <li>… 以及另外 {tracked.length - 12} 个文件</li>}
          </ul>
          <p className="git-muted">新添加的文件只会取消跟踪，文件本身保留在磁盘上。</p>
        </>
      ),
      confirm: '回滚',
      danger: true,
      run: () =>
        void context.run(
          '回滚',
          (id) =>
            git.rollback(
              id,
              tracked.map((change) => change.path),
            ),
          {
            touchesWorkTree: true,
            success: () => `已回滚 ${tracked.length} 个文件`,
          },
        ),
    });
  };
  const openDiff = (path: string) => {
    const list = changes.filter((change) => change.kind !== 'conflicted');
    const index = list.findIndex((change) => change.path === path);
    const change = list[index];
    if (!change) {
      context.openDialog({ kind: 'conflicts' });
      return;
    }
    const { left, right } = changeSides(change, unborn);
    context.openDialog({
      kind: 'diff',
      request: {
        title: '工作区更改',
        left,
        right,
        files: list.map((item) => ({
          path: item.path,
          origPath: item.origPath,
          status: item.kind,
          sides: changeSides(item, unborn),
        })),
        index,
      },
    });
  };
  const menuEntries = (path: string): GitMenuEntry[] => {
    const change = changes.find((item) => item.path === path);
    const document = /\.(md|markdown|mdown|mkd|txt)$/i.test(path) && change?.kind !== 'deleted';
    return [
      { id: 'diff', label: '显示差异', icon: 'diff', run: () => openDiff(path) },
      ...(document
        ? [
            {
              id: 'open',
              label: '在编辑器中打开',
              icon: 'file' as const,
              run: () => props.openDocument(path),
            },
          ]
        : []),
      {
        id: 'history',
        label: '显示历史',
        icon: 'history',
        run: () => context.openView('log', { path }),
      },
      'separator',
      {
        id: 'rollback',
        label: '回滚…',
        icon: 'rollback',
        danger: true,
        disabled: change?.kind === 'untracked' || change?.kind === 'conflicted',
        run: () => rollback([path]),
      },
      'separator',
      { id: 'copy', label: '复制路径', icon: 'copy', run: () => void copyText(path) },
    ];
  };

  const busy = context.busy !== null;
  const blocked = operation !== 'none';
  const canCommit = !busy && !blocked && !!message.trim() && (included.size > 0 || amend);
  return (
    <div className="git-split git-commit-tab">
      <aside className="git-split-side git-commit-side">
        <div className="git-pane-toolbar" role="toolbar" aria-label="更改">
          <button
            type="button"
            className="git-icon-button"
            aria-label="刷新"
            title="刷新"
            onClick={() => void context.refresh(false)}
          >
            <GitGlyph name="refresh" />
          </button>
          <button
            type="button"
            className="git-icon-button"
            aria-label="回滚所选文件"
            title="回滚…"
            disabled={busy || !included.size}
            onClick={() => rollback([...included])}
          >
            <GitGlyph name="rollback" />
          </button>
          <button
            type="button"
            className="git-icon-button"
            aria-label="显示差异"
            title="显示差异（Enter）"
            disabled={!selected}
            onClick={() => selected && openDiff(selected)}
          >
            <GitGlyph name="diff" />
          </button>
          <button
            type="button"
            className="git-icon-button"
            aria-pressed={grouped}
            aria-label="按目录分组"
            title="按目录分组"
            onClick={() => setGrouped((value) => !value)}
          >
            <GitGlyph name="folder" />
          </button>
          <span className="git-toolbar-spacer" />
          {regular.length > 0 && (
            <label className="git-check git-check-small">
              <input
                type="checkbox"
                checked={included.size === regular.length}
                onChange={(event) =>
                  setExcluded(
                    event.target.checked
                      ? new Set()
                      : new Set(regular.map((change) => change.path)),
                  )
                }
              />
              全选
            </label>
          )}
        </div>
        <div className="git-commit-lists">
          {!status ? (
            <SkeletonRows rows={5} height={26} />
          ) : (
            <>
              {conflicts.length > 0 && (
                <div className="git-commit-group" data-tone="conflicted">
                  <div className="git-side-heading">
                    冲突 <span className="git-count">{conflicts.length}</span>
                    <button
                      type="button"
                      className="git-link-button"
                      onClick={() => context.openDialog({ kind: 'conflicts' })}
                    >
                      解决…
                    </button>
                  </div>
                  <FileList
                    label="冲突文件"
                    files={conflicts.map((change) => ({ path: change.path, status: change.kind }))}
                    selected={selected}
                    onSelect={setSelected}
                    onOpen={() => context.openDialog({ kind: 'conflicts' })}
                  />
                </div>
              )}
              <div className="git-commit-group">
                <div className="git-side-heading">
                  更改 <span className="git-count">{regular.length}</span>
                  {status.truncated && <span className="git-muted">（仅显示前 5000 个）</span>}
                </div>
                <FileList
                  label="更改的文件"
                  grouped={grouped}
                  files={regular.map((change) => ({
                    path: change.path,
                    origPath: change.origPath,
                    status: change.kind,
                  }))}
                  selected={selected}
                  onSelect={setSelected}
                  onOpen={openDiff}
                  checked={included}
                  onCheck={(paths, value) =>
                    setExcluded((set) => {
                      const next = new Set(set);
                      for (const path of paths) {
                        if (value) next.delete(path);
                        else next.add(path);
                      }
                      return next;
                    })
                  }
                  onContextMenu={(path, x, y) => setMenu({ path, x, y })}
                  empty={
                    <div className="git-empty-state">
                      <GitGlyph name="check" />
                      <p>没有未提交的更改</p>
                    </div>
                  }
                />
              </div>
            </>
          )}
        </div>
        <div className="git-commit-box">
          <textarea
            ref={messageField}
            className="git-input git-commit-message"
            aria-label="提交信息"
            placeholder={blocked ? '请先完成或中止当前的合并/变基' : '提交信息（Ctrl+Enter 提交）'}
            value={message}
            disabled={blocked}
            rows={4}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                (event.ctrlKey || event.metaKey) &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                if (canCommit) void commit(event.shiftKey);
              }
            }}
          />
          <div className="git-commit-options">
            <label className="git-check git-check-small">
              <input
                type="checkbox"
                checked={amend}
                disabled={blocked || unborn}
                onChange={(event) => void toggleAmend(event.target.checked)}
              />
              修改上一次提交
            </label>
            <button
              type="button"
              className="git-link-button"
              disabled={blocked}
              title="按设置中的提交信息模板生成"
              onClick={() => {
                setMessage(
                  commitMessage(context.preferences.commitTemplate, {
                    branch: repository?.head.branch ?? null,
                    files: [...included],
                  }),
                );
                messageField.current?.focus();
              }}
            >
              使用模板
            </button>
          </div>
          <div className="git-commit-actions">
            <button
              type="button"
              className="git-button git-button-primary"
              disabled={!canCommit}
              onClick={() => void commit(false)}
            >
              {amend ? '修改提交' : '提交'}
              {included.size ? ` ${included.size} 个文件` : ''}
            </button>
            <button
              type="button"
              className="git-button"
              disabled={!canCommit || !repository?.remotes.length}
              title="提交后打开推送对话框（Ctrl+Shift+Enter）"
              onClick={() => void commit(true)}
            >
              提交并推送…
            </button>
          </div>
        </div>
      </aside>
      <section className="git-split-main" aria-label="差异预览">
        <DiffPanel
          left={sides?.left ?? { rev: 'HEAD', label: 'HEAD' }}
          right={sides?.right ?? { rev: 'WORKTREE', label: '工作区' }}
          entry={
            selectedChange && selectedChange.kind !== 'conflicted'
              ? {
                  path: selectedChange.path,
                  origPath: selectedChange.origPath,
                  status: selectedChange.kind,
                }
              : null
          }
          empty={
            selectedChange?.kind === 'conflicted' ? (
              <div className="git-empty-state">
                <GitGlyph name="conflict" />
                <p>此文件有冲突。</p>
                <button
                  type="button"
                  className="git-button git-button-primary"
                  onClick={() => context.openDialog({ kind: 'merge', path: selectedChange.path })}
                >
                  合并…
                </button>
              </div>
            ) : (
              <div className="git-empty-state">
                <GitGlyph name="diff" />
                <p>选择文件查看更改</p>
              </div>
            )
          }
        />
      </section>
      {menu && (
        <GitMenu
          entries={menuEntries(menu.path)}
          label="文件操作"
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
