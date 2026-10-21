import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SkeletonRows } from '../../components/Skeleton.js';
import { type GitBranches, git, gitError } from '../../services/git.js';
import { type BranchTarget, branchMenu, checkoutBranch } from './branch-actions.js';
import { type BranchFolder, branchStore, branchTree } from './branch-store.js';
import { GitGlyph, type GitGlyphName } from './GitGlyph.js';
import { GitMenu, type GitMenuEntry } from './GitMenu.js';
import { useGit } from './GitProvider.js';
import { OperationBanner, ProgressLine } from './GitStatusParts.js';

interface Action {
  id: string;
  label: string;
  icon: GitGlyphName;
  hint?: string | undefined;
  disabled?: boolean;
  run: () => void;
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

/** The branch popup hanging from the sidebar's branch button, modelled on IDEA's VCS widget. */
export function BranchPopup() {
  const context = useGit();
  const { branchPopup: anchor, probe, workspace, revision } = context;
  const repository = probe?.repository ?? null;
  const root = repository?.root ?? '';
  const element = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [branches, setBranches] = useState<GitBranches | null>(null);
  const [error, setError] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(() => branchStore.favorites(root));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<{ target: BranchTarget; rect: DOMRect } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const open = anchor !== null;
  const close = () => context.openBranches(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch on open, retry and repository mutations.
  useEffect(() => {
    if (!open || !workspace || !repository) return;
    let alive = true;
    setError('');
    void git.branches(workspace.id).then(
      (value) => {
        if (alive) setBranches(value);
      },
      (failure: unknown) => {
        if (alive) setError(gitError(failure).message);
      },
    );
    return () => {
      alive = false;
    };
  }, [open, workspace?.id, !!repository, revision, attempt]);
  useEffect(() => {
    if (!open) {
      setQuery('');
      setMenu(null);
      return;
    }
    setFavorites(branchStore.favorites(root));
  }, [open, root]);
  useLayoutEffect(() => {
    const node = element.current;
    if (!node || !anchor) return;
    const width = node.offsetWidth;
    const viewport = document.documentElement.clientWidth;
    node.style.left = `${Math.max(8, Math.min(anchor.left, viewport - width - 8))}px`;
    node.style.top = `${anchor.bottom + 4}px`;
    node.style.maxHeight = `${Math.max(240, document.documentElement.clientHeight - anchor.bottom - 16)}px`;
    input.current?.focus();
  }, [anchor]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('.git-branch-popup, .git-menu, .git-branch-widget')) return;
      context.openBranches(null);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open, context.openBranches]);

  const local = branches?.local ?? [];
  const remote = branches?.remote ?? [];
  const recentNames = useMemo(() => (open ? branchStore.recent(root) : []), [open, root]);
  if (!anchor) return null;

  const current = branches?.current ?? repository?.head.branch ?? null;
  const filter = query.trim().toLowerCase();
  const matches = (text: string) => !filter || text.toLowerCase().includes(filter);
  const busy = context.busy !== null;
  const blocked = (repository?.operation ?? 'none') !== 'none';
  const actions: Action[] = repository
    ? [
        {
          id: 'sync',
          label: '同步',
          icon: 'sync',
          hint: '提交 · 拉取 · 推送',
          disabled: busy || repository.remotes.length === 0,
          run: () => {
            close();
            void context.sync('manual');
          },
        },
        {
          id: 'update',
          label: '更新项目…',
          icon: 'pull',
          hint: repository.upstream ?? undefined,
          disabled: busy || blocked,
          run: () => {
            close();
            void context.update();
          },
        },
        {
          id: 'commit',
          label: '提交…',
          icon: 'commit',
          run: () => context.openView('commit'),
        },
        {
          id: 'push',
          label: '推送…',
          icon: 'push',
          disabled: !repository.head.branch,
          run: () => context.openDialog({ kind: 'push' }),
        },
        {
          id: 'fetch',
          label: '获取',
          icon: 'fetch',
          disabled: busy || repository.remotes.length === 0,
          run: () => {
            close();
            void context.fetch();
          },
        },
        {
          id: 'new-branch',
          label: '新建分支…',
          icon: 'plus',
          disabled: repository.head.unborn,
          run: () =>
            context.openDialog({ kind: 'new-branch', from: current ?? 'HEAD', checkout: true }),
        },
        {
          id: 'checkout-revision',
          label: '签出标签或修订…',
          icon: 'tag',
          disabled: blocked,
          run: () => context.openDialog({ kind: 'checkout-revision' }),
        },
        {
          id: 'log',
          label: '显示 Git 日志',
          icon: 'history',
          run: () => context.openView('log'),
        },
        {
          id: 'repository',
          label: '仓库与远程…',
          icon: 'remote',
          run: () => context.openView('repository'),
        },
      ]
    : [];
  const visibleActions = actions.filter((action) => matches(action.label));

  // Running a branch action ends the popup, as in IDEA; toggling a favorite keeps it open.
  const closing = (entries: GitMenuEntry[]): GitMenuEntry[] =>
    entries.map((entry) =>
      typeof entry === 'object' && 'id' in entry && entry.run && entry.id !== 'favorite'
        ? {
            ...entry,
            run: () => {
              close();
              entry.run?.();
            },
          }
        : entry,
    );
  const toggleFavorite = (name: string) => setFavorites(branchStore.toggleFavorite(root, name));
  const showMenu = (target: BranchTarget, row: HTMLElement) => {
    if (!branches) return;
    setMenu({ target, rect: row.getBoundingClientRect() });
  };

  const rowKeys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    const rows = [
      ...(element.current?.querySelectorAll<HTMLElement>(
        '.git-popup-scroll .git-popup-row:not(:disabled)',
      ) ?? []),
    ];
    const index = rows.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      if (index < 0) rows[step > 0 ? 0 : rows.length - 1]?.focus();
      else if (index + step < 0) input.current?.focus();
      else rows[Math.min(rows.length - 1, index + step)]?.focus();
    } else if (event.key === 'ArrowRight' && index >= 0) {
      const row = rows[index];
      if (row?.dataset.branch) {
        event.preventDefault();
        row.click();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (menu) setMenu(null);
      else close();
    } else if (
      index >= 0 &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      input.current?.focus();
    }
  };

  const branchRow = (
    target: BranchTarget,
    label: string,
    depth: number,
    key: string,
  ): ReactNode => {
    const name = target.kind === 'local' ? target.branch.name : target.branch.fullName;
    const isCurrent = target.kind === 'local' && target.branch.current;
    const local = target.kind === 'local' ? target.branch : null;
    return (
      <button
        key={key}
        type="button"
        className="git-popup-row git-popup-branch"
        data-branch={name}
        data-current={isCurrent || undefined}
        data-open={
          (menu &&
            (menu.target.kind === 'local'
              ? menu.target.branch.name
              : menu.target.branch.fullName) === name &&
            menu.target.kind === target.kind) ||
          undefined
        }
        style={{ paddingLeft: 10 + depth * 14 }}
        title={`${name}${local?.upstream ? ` → ${local.upstream}` : ''}\n${target.branch.subject}`}
        aria-haspopup="menu"
        onClick={(event) => showMenu(target, event.currentTarget)}
        onDoubleClick={() => {
          if (isCurrent || blocked) return;
          setMenu(null);
          close();
          void checkoutBranch(context, name, target.kind);
        }}
      >
        <span className="git-popup-icon" aria-hidden="true">
          <GitGlyph
            name={isCurrent ? 'check' : favorites.has(name) ? 'star' : 'branch'}
            className={favorites.has(name) && !isCurrent ? 'git-favorite' : undefined}
          />
        </span>
        <span className="git-popup-label">
          <Highlight text={filter ? name : label} query={filter} />
        </span>
        {local && (local.ahead > 0 || local.behind > 0 || local.gone) && (
          <span className="git-popup-track">
            {local.gone ? (
              <span title="跟踪的远程分支已删除">已删除</span>
            ) : (
              <>
                {local.behind > 0 && (
                  <span className="git-incoming" title={`有 ${local.behind} 个传入提交`}>
                    ↓{local.behind}
                  </span>
                )}
                {local.ahead > 0 && (
                  <span className="git-outgoing" title={`有 ${local.ahead} 个待推送提交`}>
                    ↑{local.ahead}
                  </span>
                )}
              </>
            )}
          </span>
        )}
        <span className="git-popup-chevron" aria-hidden="true">
          <GitGlyph name="chevronRight" />
        </span>
      </button>
    );
  };
  const folderRows = <T,>(
    folder: BranchFolder<T>,
    depth: number,
    scope: string,
    row: (value: T, label: string, depth: number) => ReactNode,
  ): ReactNode[] => {
    const rows: ReactNode[] = [];
    for (const child of folder.folders) {
      const id = `${scope}:${child.path}`;
      const shut = collapsed.has(id);
      rows.push(
        <button
          key={id}
          type="button"
          className="git-popup-row git-popup-folder"
          style={{ paddingLeft: 10 + depth * 14 }}
          aria-expanded={!shut}
          onClick={() =>
            setCollapsed((set) => {
              const next = new Set(set);
              if (shut) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        >
          <span className="git-popup-icon" aria-hidden="true">
            <GitGlyph name={shut ? 'chevronRight' : 'chevronDown'} />
          </span>
          <span className="git-popup-label">{child.name}</span>
        </button>,
      );
      if (!shut) rows.push(...folderRows(child, depth + 1, scope, row));
    }
    for (const item of folder.items) rows.push(row(item.value, item.label, depth));
    return rows;
  };

  const section = (id: string, title: string, rows: ReactNode[], extra?: ReactNode) =>
    rows.length ? (
      <div className="git-popup-section" key={id}>
        <div className="git-popup-heading">
          <span>{title}</span>
          {extra}
        </div>
        {rows}
      </div>
    ) : null;

  let body: ReactNode;
  if (!probe) body = <SkeletonRows rows={5} icon height={28} />;
  else if (!probe.git || probe.problem)
    body = (
      <div className="git-popup-empty">
        <GitGlyph name="conflict" />
        <p>{probe.problem?.message ?? '未找到 Git'}</p>
        <div className="git-popup-empty-actions">
          {probe.problem?.code === 'dubious-ownership' && (
            <button
              type="button"
              className="git-button git-button-primary"
              onClick={() =>
                void context.run('信任仓库目录', (id) => git.trust(id), {
                  success: () => '已将仓库加入 safe.directory',
                })
              }
            >
              信任此目录
            </button>
          )}
          <button type="button" className="git-button" onClick={() => void context.refresh()}>
            重新检测
          </button>
        </div>
      </div>
    );
  else if (!repository)
    body = (
      <div className="git-popup-empty">
        <GitGlyph name="branch" />
        <p>此文件夹还不是 Git 仓库。初始化后即可记录版本、查看差异并与远程仓库同步。</p>
        <div className="git-popup-empty-actions">
          <button
            type="button"
            className="git-button git-button-primary"
            onClick={() => context.openDialog({ kind: 'init' })}
          >
            初始化仓库…
          </button>
          <button
            type="button"
            className="git-button"
            onClick={() => context.openView('repository')}
          >
            Git 设置
          </button>
        </div>
      </div>
    );
  else {
    const recent = recentNames
      .filter((name) => name !== current && matches(name))
      .map((name) => local.find((branch) => branch.name === name))
      .filter((branch) => branch !== undefined)
      .slice(0, 5);
    const favoriteLocal = local.filter((branch) => favorites.has(branch.name));
    const localEntries = local.filter((branch) => matches(branch.name));
    const localRows = filter
      ? localEntries.map((branch) =>
          branchRow({ kind: 'local', branch }, branch.name, 0, `local:${branch.name}`),
        )
      : [
          ...favoriteLocal.map((branch) =>
            branchRow({ kind: 'local', branch }, branch.name, 0, `fav:${branch.name}`),
          ),
          ...folderRows(
            branchTree(
              localEntries
                .filter((branch) => !favorites.has(branch.name))
                .map((branch) => ({ name: branch.name, value: branch })),
            ),
            0,
            'local',
            (branch, label, depth) =>
              branchRow({ kind: 'local', branch }, label, depth, `local:${branch.name}`),
          ),
        ];
    const remotes = [...new Set(remote.map((branch) => branch.remote))];
    const remoteRows: ReactNode[] = [];
    for (const name of remotes) {
      const entries = remote.filter((branch) => branch.remote === name && matches(branch.fullName));
      if (!entries.length) continue;
      if (filter) {
        remoteRows.push(
          ...entries.map((branch) =>
            branchRow({ kind: 'remote', branch }, branch.fullName, 0, `remote:${branch.fullName}`),
          ),
        );
        continue;
      }
      const id = `remote-root:${name}`;
      const shut = collapsed.has(id);
      remoteRows.push(
        <button
          key={id}
          type="button"
          className="git-popup-row git-popup-folder"
          aria-expanded={!shut}
          onClick={() =>
            setCollapsed((set) => {
              const next = new Set(set);
              if (shut) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        >
          <span className="git-popup-icon" aria-hidden="true">
            <GitGlyph name={shut ? 'chevronRight' : 'chevronDown'} />
          </span>
          <span className="git-popup-label">{name}</span>
          <span className="git-popup-count">{entries.length}</span>
        </button>,
      );
      if (!shut)
        remoteRows.push(
          ...folderRows(
            branchTree(entries.map((branch) => ({ name: branch.name, value: branch }))),
            1,
            `remote:${name}`,
            (branch, label, depth) =>
              branchRow({ kind: 'remote', branch }, label, depth, `remote:${branch.fullName}`),
          ),
        );
    }
    body = (
      <>
        {visibleActions.length > 0 && (
          <div className="git-popup-section">
            {visibleActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="git-popup-row git-popup-action"
                disabled={action.disabled}
                onClick={action.run}
              >
                <span className="git-popup-icon" aria-hidden="true">
                  <GitGlyph name={action.icon} />
                </span>
                <span className="git-popup-label">
                  <Highlight text={action.label} query={filter} />
                </span>
                {action.hint && <span className="git-popup-hint">{action.hint}</span>}
              </button>
            ))}
          </div>
        )}
        {error && (
          <div className="git-popup-error" role="alert">
            {error}
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
              重试
            </button>
          </div>
        )}
        {!branches && !error && <SkeletonRows rows={4} icon height={28} />}
        {branches &&
          section(
            'recent',
            '最近',
            recent.map((branch) =>
              branchRow({ kind: 'local', branch }, branch.name, 0, `recent:${branch.name}`),
            ),
          )}
        {branches && section('local', '本地', localRows)}
        {branches && section('remote', '远程', remoteRows)}
        {branches &&
          filter &&
          !localRows.length &&
          !remoteRows.length &&
          !visibleActions.length && (
            <p className="git-popup-none">没有匹配“{query.trim()}”的分支或操作</p>
          )}
      </>
    );
  }

  return (
    <div
      ref={element}
      className="git-branch-popup"
      role="dialog"
      aria-label="Git 分支"
      onKeyDown={rowKeys}
    >
      {repository && (
        <div className="git-popup-search">
          <GitGlyph name="search" />
          <input
            ref={input}
            type="search"
            value={query}
            aria-label="搜索分支和操作"
            placeholder="搜索分支和操作"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                const first = element.current?.querySelector<HTMLElement>(
                  '.git-popup-scroll .git-popup-row:not(:disabled):not(.git-popup-folder)',
                );
                if (first) {
                  event.preventDefault();
                  first.focus();
                  first.click();
                }
              }
            }}
          />
        </div>
      )}
      {context.busy && <ProgressLine />}
      {repository && repository.operation !== 'none' && <OperationBanner compact />}
      <div className="git-popup-scroll">{body}</div>
      {repository && (
        <footer className="git-popup-footer" title={repository.root}>
          <GitGlyph name="folder" />
          <span>{repository.root}</span>
        </footer>
      )}
      {menu && branches && (
        <GitMenu
          entries={closing(branchMenu(context, menu.target, branches, favorites, toggleFavorite))}
          label="分支操作"
          x={menu.rect.right - 4}
          y={menu.rect.top - 4}
          anchor={menu.rect}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
