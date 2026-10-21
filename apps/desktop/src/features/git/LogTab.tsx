import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SkeletonRows } from '../../components/Skeleton.js';
import {
  type GitCommit,
  type GitCommitDetails,
  type GitFileChange,
  type GitRef,
  git,
  gitError,
} from '../../services/git.js';
import { useBranches } from './BranchDialogs.js';
import { checkoutBranch } from './branch-actions.js';
import { copyText } from './CommitTab.js';
import { FileList } from './FileList.js';
import { formatDate, relativeTime, shortOid } from './GitDialogFrame.js';
import { GitGlyph } from './GitGlyph.js';
import { GitMenu, type GitMenuEntry } from './GitMenu.js';
import { type LogFilter, useGit } from './GitProvider.js';
import { type GraphRow, layoutGraph } from './model/log-graph.js';

const ROW = 26;
const LANE = 12;
const PAGE = 200;
const OVERSCAN = 12;
const DATES = [
  { value: 0, label: '任何时间' },
  { value: 1, label: '最近 24 小时' },
  { value: 7, label: '最近 7 天' },
  { value: 30, label: '最近 30 天' },
  { value: 365, label: '最近一年' },
] as const;

function Graph({ row, width }: { row: GraphRow; width: number }) {
  const x = (lane: number) => lane * LANE + LANE / 2;
  const half = ROW / 2;
  const edge = (from: number, to: number, y1: number, y2: number) =>
    from === to
      ? `M${x(from)} ${y1}V${y2}`
      : `M${x(from)} ${y1}C${x(from)} ${(y1 + y2) / 2} ${x(to)} ${(y1 + y2) / 2} ${x(to)} ${y2}`;
  return (
    <svg className="git-graph" width={width * LANE} height={ROW} aria-hidden="true">
      {row.up.map((item, index) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: edges are positional.
          key={`u${index}`}
          d={edge(item.from, item.to, 0, half)}
          style={{ stroke: `var(--git-graph-${item.color % 8})` }}
        />
      ))}
      {row.down.map((item, index) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: edges are positional.
          key={`d${index}`}
          d={edge(item.from, item.to, half, ROW)}
          style={{ stroke: `var(--git-graph-${item.color % 8})` }}
        />
      ))}
      <circle
        cx={x(row.lane)}
        cy={half}
        r={row.merge ? 3 : 3.5}
        data-merge={row.merge || undefined}
        style={{ ['--node' as string]: `var(--git-graph-${row.color % 8})` }}
      />
    </svg>
  );
}

export function RefChips({ refs }: { refs: readonly GitRef[] }) {
  if (!refs.length) return null;
  return (
    <span className="git-refs">
      {refs.map((ref) => (
        <span
          key={`${ref.kind}:${ref.name}`}
          className="git-ref"
          data-kind={ref.kind}
          title={ref.name}
        >
          {ref.kind === 'tag' && <GitGlyph name="tag" />}
          {ref.name}
        </span>
      ))}
    </span>
  );
}

interface Query {
  revisions: string[];
  text: string;
  author: string;
  days: number;
  path: string;
}

/** Commit history with graph, filters and commit details, after IDEA's Git log. */
export function LogTab({ filter }: { filter: LogFilter | null }) {
  const context = useGit();
  const id = context.workspace?.id;
  const branches = useBranches();
  const [query, setQuery] = useState<Query>(() => ({
    revisions: filter?.revisions ?? [],
    text: filter?.text ?? '',
    author: '',
    days: 0,
    path: filter?.path ?? '',
  }));
  const [typed, setTyped] = useState({ text: query.text, author: '' });
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState<GitCommitDetails | null>(null);
  const [detailsError, setDetailsError] = useState('');
  const [file, setFile] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  const [menu, setMenu] = useState<{ commit: GitCommit; x: number; y: number } | null>(null);
  const [branchesOpen, setBranchesOpen] = useState(true);
  const list = useRef<HTMLDivElement>(null);
  const generation = useRef(0);

  // A new filter from outside (branch popup "查看日志", file history) replaces the current one.
  useEffect(() => {
    if (!filter) return;
    setQuery((value) => ({
      ...value,
      revisions: filter.revisions ?? [],
      path: filter.path ?? '',
      text: filter.text ?? '',
    }));
    setTyped((value) => ({ ...value, text: filter.text ?? '' }));
  }, [filter]);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setQuery((value) =>
          value.text === typed.text && value.author === typed.author
            ? value
            : { ...value, ...typed },
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [typed]);

  const load = useCallback(
    async (skip: number) => {
      if (!id) return;
      const mine = skip === 0 ? ++generation.current : generation.current;
      setLoading(true);
      setError('');
      try {
        const now = Math.floor(Date.now() / 1000);
        const page = await git.log(id, {
          revisions: query.revisions,
          skip,
          limit: PAGE,
          ...(query.text.trim() ? { text: query.text.trim() } : {}),
          ...(query.author.trim() ? { author: query.author.trim() } : {}),
          ...(query.days ? { since: now - query.days * 86_400 } : {}),
          ...(query.path ? { path: query.path } : {}),
        });
        if (mine !== generation.current) return;
        setCommits((value) => (skip === 0 ? page.commits : [...value, ...page.commits]));
        setHasMore(page.hasMore);
      } catch (failure) {
        if (mine === generation.current) setError(gitError(failure).message);
      } finally {
        if (mine === generation.current) setLoading(false);
      }
    },
    [id, query],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload on filter and repository changes.
  useEffect(() => {
    setCommits([]);
    setHasMore(true);
    list.current?.scrollTo({ top: 0 });
    void load(0);
  }, [load, context.revision]);
  useEffect(() => {
    if (selected && commits.some((commit) => commit.oid === selected)) return;
    setSelected(commits[0]?.oid ?? null);
  }, [commits, selected]);
  useEffect(() => {
    if (!id || !selected) {
      setDetails(null);
      return;
    }
    let alive = true;
    setDetails(null);
    setDetailsError('');
    void git.commitDetails(id, selected).then(
      (value) => {
        if (!alive) return;
        setDetails(value);
        setFile(value.files[0]?.path ?? null);
      },
      (failure: unknown) => {
        if (alive) setDetailsError(gitError(failure).message);
      },
    );
    return () => {
      alive = false;
    };
  }, [id, selected]);
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const graph = useMemo(() => layoutGraph(commits), [commits]);
  const graphWidth = Math.min(16, Math.max(1, ...graph.map((row) => row.width)));
  const first = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN);
  const last = Math.min(commits.length, Math.ceil((scrollTop + height) / ROW) + OVERSCAN);
  useEffect(() => {
    if (hasMore && !loading && !error && last >= commits.length - OVERSCAN && commits.length > 0)
      void load(commits.length);
  }, [last, commits.length, hasMore, loading, error, load]);

  const select = (oid: string) => {
    setSelected(oid);
    const index = commits.findIndex((commit) => commit.oid === oid);
    const element = list.current;
    if (!element || index < 0) return;
    const top = index * ROW;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + ROW > element.scrollTop + element.clientHeight)
      element.scrollTop = top + ROW - element.clientHeight;
  };
  const keys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = commits.findIndex((commit) => commit.oid === selected);
    const step =
      event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowUp'
          ? -1
          : event.key === 'PageDown'
            ? 20
            : event.key === 'PageUp'
              ? -20
              : 0;
    if (!step) return;
    event.preventDefault();
    const next = commits[Math.max(0, Math.min(commits.length - 1, index + step))];
    if (next) select(next.oid);
  };

  const touch = { touchesWorkTree: true } as const;
  const commitMenu = (commit: GitCommit): GitMenuEntry[] => {
    const label = `${shortOid(commit.oid)} ${commit.subject}`;
    const head = context.probe?.repository?.head;
    const blocked = (context.probe?.repository?.operation ?? 'none') !== 'none';
    return [
      { id: 'copy', label: '复制提交哈希', icon: 'copy', run: () => void copyText(commit.oid) },
      { id: 'copy-message', label: '复制提交信息', run: () => void copyText(commit.subject) },
      'separator',
      {
        id: 'compare',
        label: '与本地工作区比较',
        icon: 'diff',
        run: () =>
          context.openDialog({
            kind: 'compare',
            from: commit.oid,
            to: 'WORKTREE',
            title: `${shortOid(commit.oid)} ↔ 工作区`,
          }),
      },
      'separator',
      {
        id: 'checkout',
        label: '签出此修订',
        icon: 'branch',
        disabled: blocked,
        run: () => void checkoutBranch(context, commit.oid, 'revision'),
      },
      {
        id: 'branch',
        label: '从此处新建分支…',
        icon: 'plus',
        run: () => context.openDialog({ kind: 'new-branch', from: commit.oid, checkout: true }),
      },
      {
        id: 'tag',
        label: '新建标签…',
        icon: 'tag',
        run: () => context.openDialog({ kind: 'tag', target: commit.oid, label }),
      },
      'separator',
      {
        id: 'cherry-pick',
        label: '拣选到当前分支',
        icon: 'commit',
        disabled: blocked || head?.oid === commit.oid,
        run: () =>
          void context
            .run('拣选', (workspace) => git.cherryPick(workspace, commit.oid), touch)
            .then((result) => context.reportUpdate('拣选', result)),
      },
      {
        id: 'revert',
        label: '还原提交',
        icon: 'rollback',
        disabled: blocked,
        run: () =>
          context.openDialog({
            kind: 'confirm',
            title: '还原提交',
            message: `将创建一个新提交，撤销 ${label} 引入的更改。`,
            confirm: '还原',
            run: () =>
              void context
                .run('还原提交', (workspace) => git.revert(workspace, commit.oid), touch)
                .then((result) => context.reportUpdate('还原提交', result)),
          }),
      },
      {
        id: 'reset',
        label: `将 ${head?.branch ?? 'HEAD'} 重置到此处…`,
        danger: true,
        disabled: blocked,
        run: () => context.openDialog({ kind: 'reset', target: commit.oid, label }),
      },
    ];
  };

  const openFileDiff = (path: string) => {
    if (!details) return;
    const commit = details.commit;
    const files = details.files;
    const index = files.findIndex((item) => item.path === path);
    const parent = commit.parents.length ? `${commit.oid}^` : null;
    const sides = (item: GitFileChange) => ({
      left: {
        rev: item.status === 'A' ? null : parent,
        label: parent ? `${shortOid(commit.parents[0])}（父提交）` : '（无）',
      },
      right: { rev: item.status === 'D' ? null : commit.oid, label: shortOid(commit.oid) },
    });
    const first = files[index];
    if (!first) return;
    context.openDialog({
      kind: 'diff',
      request: {
        title: `${shortOid(commit.oid)} ${commit.subject}`,
        ...sides(first),
        files: files.map((item) => ({
          path: item.path,
          origPath: item.origPath,
          status: item.status,
          sides: sides(item),
        })),
        index,
      },
    });
  };

  const revisionLabel = query.revisions.length ? query.revisions.join(', ') : '全部分支';
  const branchItem = (value: string[], label: ReactNode, key: string, title?: string) => {
    const active = value.join('\n') === query.revisions.join('\n');
    return (
      <button
        key={key}
        type="button"
        className="git-log-branch"
        aria-pressed={active}
        title={title}
        onClick={() => setQuery((current) => ({ ...current, revisions: value }))}
      >
        {label}
      </button>
    );
  };
  const visible = commits.slice(first, last);
  return (
    <div className="git-log" data-branches={branchesOpen || undefined}>
      {branchesOpen && (
        <aside className="git-log-branches" aria-label="分支筛选">
          <div className="git-side-heading">分支</div>
          {branchItem([], '全部', 'all')}
          {branchItem(['HEAD'], 'HEAD（当前）', 'head')}
          {branches ? (
            <>
              <div className="git-log-branch-group">本地</div>
              {branches.local.map((branch) =>
                branchItem(
                  [branch.name],
                  <>
                    <GitGlyph name={branch.current ? 'check' : 'branch'} />
                    <span>{branch.name}</span>
                  </>,
                  `l:${branch.name}`,
                  branch.name,
                ),
              )}
              {branches.remote.length > 0 && <div className="git-log-branch-group">远程</div>}
              {branches.remote.map((branch) =>
                branchItem(
                  [branch.fullName],
                  <>
                    <GitGlyph name="remote" />
                    <span>{branch.fullName}</span>
                  </>,
                  `r:${branch.fullName}`,
                  branch.fullName,
                ),
              )}
            </>
          ) : (
            <SkeletonRows rows={4} height={24} />
          )}
        </aside>
      )}
      <section className="git-log-main" aria-label="提交历史">
        <div className="git-pane-toolbar git-log-filters" role="toolbar" aria-label="日志筛选">
          <button
            type="button"
            className="git-icon-button"
            aria-pressed={branchesOpen}
            aria-label="显示分支"
            title="显示分支"
            onClick={() => setBranchesOpen((value) => !value)}
          >
            <GitGlyph name="branch" />
          </button>
          <div className="git-search-field">
            <GitGlyph name="search" />
            <input
              type="search"
              aria-label="搜索提交信息或哈希"
              placeholder="搜索提交信息或哈希"
              value={typed.text}
              spellCheck={false}
              onChange={(event) => setTyped((value) => ({ ...value, text: event.target.value }))}
            />
          </div>
          <input
            className="git-input git-log-author"
            type="search"
            aria-label="作者"
            placeholder="作者"
            value={typed.author}
            spellCheck={false}
            onChange={(event) => setTyped((value) => ({ ...value, author: event.target.value }))}
          />
          <select
            className="git-input git-select"
            aria-label="时间"
            value={query.days}
            onChange={(event) =>
              setQuery((value) => ({ ...value, days: Number(event.target.value) }))
            }
          >
            {DATES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="git-chip" title={revisionLabel}>
            <GitGlyph name="branch" />
            {revisionLabel}
          </span>
          {query.path && (
            <span className="git-chip" title={query.path}>
              <GitGlyph name="file" />
              {query.path}
              <button
                type="button"
                aria-label="清除文件筛选"
                onClick={() => setQuery((value) => ({ ...value, path: '' }))}
              >
                <GitGlyph name="close" />
              </button>
            </span>
          )}
          <span className="git-toolbar-spacer" />
          <button
            type="button"
            className="git-icon-button"
            aria-label="刷新"
            title="刷新"
            onClick={() => void load(0)}
          >
            <GitGlyph name="refresh" />
          </button>
        </div>
        <div
          ref={list}
          className="git-log-list"
          role="listbox"
          aria-label="提交"
          tabIndex={0}
          onKeyDown={keys}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          {error ? (
            <div className="git-error-state" role="alert">
              <p>{error}</p>
              <button type="button" className="git-button" onClick={() => void load(0)}>
                重试
              </button>
            </div>
          ) : !commits.length && loading ? (
            <SkeletonRows rows={12} height={ROW} />
          ) : !commits.length ? (
            <div className="git-empty-state">
              <GitGlyph name="history" />
              <p>
                {context.probe?.repository?.head.unborn
                  ? '还没有任何提交'
                  : '没有符合筛选条件的提交'}
              </p>
            </div>
          ) : (
            <div
              className="git-log-canvas"
              style={{ height: commits.length * ROW + (loading ? ROW : 0) }}
            >
              {visible.map((commit, offset) => {
                const index = first + offset;
                const row = graph[index];
                return (
                  <div
                    key={commit.oid}
                    role="option"
                    aria-selected={commit.oid === selected}
                    className="git-log-row"
                    style={{ top: index * ROW }}
                    onClick={() => select(commit.oid)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      select(commit.oid);
                      setMenu({ commit, x: event.clientX, y: event.clientY });
                    }}
                    tabIndex={-1}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') select(commit.oid);
                    }}
                  >
                    <span className="git-log-graph" style={{ width: graphWidth * LANE }}>
                      {row && <Graph row={row} width={graphWidth} />}
                    </span>
                    <span className="git-log-subject">
                      <RefChips refs={commit.refs} />
                      <span title={commit.subject}>{commit.subject}</span>
                    </span>
                    <span className="git-log-author-cell" title={commit.authorEmail}>
                      {commit.authorName}
                    </span>
                    <span className="git-log-date" title={formatDate(commit.commitTime, true)}>
                      {relativeTime(commit.commitTime)}
                    </span>
                    <span className="git-log-hash">{shortOid(commit.oid)}</span>
                  </div>
                );
              })}
              {loading && (
                <div className="git-log-more" style={{ top: commits.length * ROW }}>
                  <span className="git-spinner" aria-hidden="true" />
                </div>
              )}
            </div>
          )}
        </div>
      </section>
      <aside className="git-log-details" aria-label="提交详情">
        {detailsError ? (
          <div className="git-error-state" role="alert">
            <p>{detailsError}</p>
          </div>
        ) : !selected ? (
          <p className="git-empty">选择提交查看详情</p>
        ) : !details ? (
          <SkeletonRows rows={6} lines={2} height={36} />
        ) : (
          <>
            <div className="git-commit-files">
              <div className="git-side-heading">
                {details.files.length} 个文件
                <span className="git-muted">
                  {details.commit.parents.length > 1 ? '（相对第一个父提交）' : ''}
                </span>
              </div>
              <FileList
                label="更改的文件"
                grouped
                files={details.files}
                selected={file}
                onSelect={setFile}
                onOpen={openFileDiff}
                empty={<p className="git-empty">此提交没有文件更改</p>}
              />
            </div>
            <div className="git-commit-info">
              <h3>{details.commit.subject}</h3>
              {details.commit.body && <pre className="git-commit-body">{details.commit.body}</pre>}
              <RefChips refs={details.commit.refs} />
              <dl>
                <dt>作者</dt>
                <dd>
                  {details.commit.authorName} &lt;{details.commit.authorEmail}&gt;
                  <br />
                  <span className="git-muted">{formatDate(details.commit.authorTime, true)}</span>
                </dd>
                {details.commit.committerName !== details.commit.authorName && (
                  <>
                    <dt>提交者</dt>
                    <dd>
                      {details.commit.committerName}
                      <br />
                      <span className="git-muted">
                        {formatDate(details.commit.commitTime, true)}
                      </span>
                    </dd>
                  </>
                )}
                <dt>哈希</dt>
                <dd>
                  <button
                    type="button"
                    className="git-link-button git-mono"
                    title="复制"
                    onClick={() => void copyText(details.commit.oid)}
                  >
                    {details.commit.oid}
                  </button>
                </dd>
                {details.commit.parents.length > 0 && (
                  <>
                    <dt>父提交</dt>
                    <dd>
                      {details.commit.parents.map((parent) => (
                        <button
                          key={parent}
                          type="button"
                          className="git-link-button git-mono"
                          onClick={() => {
                            if (commits.some((commit) => commit.oid === parent)) select(parent);
                          }}
                        >
                          {shortOid(parent)}
                        </button>
                      ))}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          </>
        )}
      </aside>
      {menu && (
        <GitMenu
          entries={commitMenu(menu.commit)}
          label="提交操作"
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
