import {
  type KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { SavedDocumentPreview } from '../../services/documents.js';
import {
  type WorkspaceArticlesReport,
  type WorkspaceDocument,
  type WorkspaceDocumentSummary,
  type WorkspaceFolder,
  workspaces,
} from '../../services/workspaces.js';
import {
  articleSummary,
  groupedArticles,
  naturalModifiedDate,
  workspacePathIsActive,
} from './article-model.js';
import { CreatedNameInput } from './CreatedNameInput.js';
import { type CreationEditor, parentPath } from './creation-types.js';
import {
  entryIsPresent,
  NO_PRESENCE,
  NO_RENAMES,
  projectedEntry,
  projectionEpoch,
  type RelativeEntryPresence,
  type RelativeEntryRename,
} from './entry-projection.js';
import type { FileSidebarPlatform, FileSortType } from './file-preferences.js';
import { SidebarSkeleton, SummarySkeleton } from './SidebarSkeleton.js';

/** Rows drawn per step while scrolling, and previews requested per call. */
const PAGE_SIZE = 120;
const SUMMARY_BATCH = 48;

interface Props {
  compact?: boolean;
  workspace: WorkspaceFolder;
  active: boolean;
  activePath: string | undefined;
  activeSource?: string | undefined;
  activeSavedSource?: string | undefined;
  savedPreview?: SavedDocumentPreview | undefined;
  platform?: FileSidebarPlatform;
  disabled: boolean;
  refresh: number;
  sort: FileSortType;
  noGroup: boolean;
  onOpen: (relativePath: string) => void;
  onSwitchToTree: () => void;
  creation?: CreationEditor | undefined;
  entryKey?: ((path: string) => string) | undefined;
  renames?: readonly RelativeEntryRename[] | undefined;
  presence?: readonly RelativeEntryPresence[] | undefined;
  highlightPath?: string | undefined;
  onNestedContent?: ((nested: boolean) => void) | undefined;
}

function articleKey(event: KeyboardEvent<HTMLElement>, typing: { prefix: string; time: number }) {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !target.hasAttribute('data-article-path')) return;
  const rows = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      'button[data-article-path]:not(:disabled)',
    ),
  );
  const index = rows.indexOf(target);
  let next: HTMLButtonElement | undefined;
  if (event.key === 'ArrowDown') next = rows[index + 1];
  else if (event.key === 'ArrowUp') next = rows[index - 1];
  else if (event.key === 'Home') next = rows[0];
  else if (event.key === 'End') next = rows.at(-1);
  else if (event.key.length === 1 && event.key !== ' ') {
    const now = Date.now(),
      key = event.key.toLocaleLowerCase();
    typing.prefix = now - typing.time < 700 && typing.prefix !== key ? typing.prefix + key : key;
    typing.time = now;
    next = [...rows.slice(index + 1), ...rows.slice(0, index + 1)].find((row) =>
      row.dataset.name?.toLocaleLowerCase().startsWith(typing.prefix),
    );
  } else return;
  event.preventDefault();
  next?.focus();
}

interface CardProps {
  entry: WorkspaceDocument;
  workspaceName: string;
  selected: boolean;
  activeSource: string | undefined;
  tabIndex: 0 | -1;
  disabled: boolean;
  now: Date;
  /** The preview has not been read yet: draw placeholder lines and ask to be loaded. */
  summaryPending: boolean;
  register: (path: string, element: HTMLLIElement | null) => void;
  onFocusPath: (path: string) => void;
  onOpen: (path: string) => void;
  creation?: CreationEditor | undefined;
  highlighted?: boolean;
}
const ArticleCard = memo(function ArticleCard({
  entry,
  workspaceName,
  selected,
  activeSource,
  tabIndex,
  disabled,
  now,
  summaryPending,
  register,
  onFocusPath,
  onOpen,
  creation,
  highlighted = false,
}: CardProps) {
  const extension = entry.name.lastIndexOf('.');
  const path = entry.relativePath;
  const attach = useCallback(
    (element: HTMLLIElement | null) => register(path, element),
    [register, path],
  );
  const diskSummary = useMemo(() => articleSummary(entry.summary), [entry.summary]);
  const liveSummary = useMemo(
    () => (activeSource === undefined ? undefined : articleSummary(activeSource.slice(0, 500))),
    [activeSource],
  );
  const editing =
    creation?.state?.view === 'articles' &&
    creation.state.entry?.relativePath === entry.relativePath &&
    !['creating', 'opening'].includes(creation.state.phase);
  const content = (
    <>
      <span className="workspace-article-location">
        <span className="workspace-article-folder">{entry.folderName || workspaceName}</span>
        <span className="workspace-article-time">{naturalModifiedDate(entry.modifiedAt, now)}</span>
      </span>
      <span className="workspace-article-name">
        {editing && creation ? (
          <CreatedNameInput
            key={creation.state?.entry?.entryToken}
            creation={creation}
            disabled={disabled}
            view="articles"
          />
        ) : extension > 0 ? (
          <>
            {entry.name.slice(0, extension)}
            <span className="workspace-article-extension">{entry.name.slice(extension)}</span>
          </>
        ) : (
          entry.name
        )}
      </span>
      <span className="workspace-article-summary">
        {liveSummary ?? (summaryPending ? <SummarySkeleton /> : diskSummary)}
      </span>
    </>
  );
  return (
    <li ref={summaryPending ? attach : undefined}>
      {editing ? (
        <div
          className="workspace-article workspace-article-editing"
          data-article-path={entry.relativePath}
          data-entry-path={entry.relativePath}
          data-entry-kind="file"
        >
          {content}
        </div>
      ) : (
        <button
          type="button"
          className={`workspace-article${highlighted ? ' workspace-file-highlight' : ''}`}
          data-article-path={entry.relativePath}
          data-name={entry.name}
          data-entry-path={entry.relativePath}
          data-entry-kind="file"
          draggable={!disabled}
          aria-current={selected ? 'page' : undefined}
          tabIndex={tabIndex}
          // Not `disabled`: that drops keyboard focus and dims the card on every document switch.
          aria-disabled={disabled || undefined}
          title={entry.relativePath}
          onFocus={() => onFocusPath(entry.relativePath)}
          onClick={() => {
            if (!disabled) onOpen(entry.relativePath);
          }}
        >
          {content}
        </button>
      )}
    </li>
  );
});

/** A capability-scoped disk snapshot. Hidden/cancelled generations never publish late results. */
export function WorkspaceArticles({
  workspace,
  compact = false,
  active,
  activePath,
  activeSource,
  activeSavedSource,
  savedPreview,
  platform = 'browser',
  disabled,
  refresh,
  sort,
  noGroup,
  onOpen,
  onSwitchToTree,
  creation,
  onNestedContent,
  entryKey,
  renames = NO_RENAMES,
  presence = NO_PRESENCE,
  highlightPath,
}: Props) {
  const [diskReport, setReport] = useState<WorkspaceArticlesReport | null>(null);
  const [reportEpoch, setReportEpoch] = useState(0);
  const latestRenames = useRef(renames);
  latestRenames.current = renames;
  const latestPresence = useRef(presence);
  latestPresence.current = presence;
  const report = useMemo(() => {
    if (
      !diskReport ||
      (!renames.some((rename) => rename.sequence > reportEpoch) &&
        !presence.some((change) => change.sequence > reportEpoch))
    )
      return diskReport;
    return {
      ...diskReport,
      entries: diskReport.entries
        .map((entry) => {
          const item = projectedEntry(entry, reportEpoch, renames);
          if (item === entry) return item;
          const folderRelativePath = parentPath(item.relativePath);
          return {
            ...item,
            folderRelativePath,
            folderName: folderRelativePath.split('/').at(-1) || workspace.name,
          };
        })
        .filter((entry) => entryIsPresent(entry.relativePath, reportEpoch, presence, renames)),
    };
  }, [diskReport, reportEpoch, renames, presence, workspace.name]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [summaries, setSummaries] = useState<ReadonlyMap<string, WorkspaceDocumentSummary>>(
    () => new Map(),
  );
  const navigation = useRef<HTMLElement | null>(null);
  const sentinel = useRef<HTMLLIElement | null>(null);
  const previewRows = useRef(new Map<string, HTMLLIElement>());
  const preview = useRef<{
    generation: unknown;
    requested: Set<string>;
    wanted: Set<string>;
    timer: number | undefined;
    observer: IntersectionObserver | null;
  }>({
    generation: null,
    requested: new Set(),
    wanted: new Set(),
    timer: undefined,
    observer: null,
  });
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const cached = useRef('');
  const typing = useRef({ prefix: '', time: 0 });
  const { id } = workspace;
  const requestKey = JSON.stringify([
    id,
    workspace.path,
    workspace.metadataRevision,
    refresh,
    retry,
  ]);
  const committedOrder = useRef<{
    id: string;
    report: WorkspaceArticlesReport | null;
    sort: FileSortType;
    noGroup: boolean;
    platform: FileSidebarPlatform;
    entries: WorkspaceDocument[];
  } | null>(null);
  const savedPreviews = useRef<{
    generation: string;
    started: boolean;
    previews: Map<string, string>;
  }>({ generation: '', started: false, previews: new Map() });
  const observedSaved = useRef<{ id: string; path: string; prefix: string } | null>(null);
  const observedCommit = useRef(savedPreview);
  const pathKey = useCallback(
    (path: string) => (platform === 'windows' ? path.replaceAll('\\', '/') : path),
    [platform],
  );
  // A save and the subsequent document load may commit in a single React render.
  // Consume each acknowledgement once; a fresh catalog must supersede old receipts.
  const newPreview =
    savedPreview !== observedCommit.current &&
    savedPreviews.current.generation === requestKey &&
    savedPreviews.current.started
      ? savedPreview
      : undefined;
  useLayoutEffect(() => {
    observedCommit.current = savedPreview;
    if (!newPreview) return;
    const previews = savedPreviews.current.previews,
      path = pathKey(newPreview.path);
    previews.delete(path);
    previews.set(path, newPreview.sourcePrefix);
    if (previews.size > 400) {
      const oldest = previews.keys().next().value;
      if (oldest !== undefined) previews.delete(oldest);
    }
  }, [savedPreview, newPreview, pathKey]);
  useLayoutEffect(() => {
    if (savedPreviews.current.generation !== requestKey)
      savedPreviews.current = { generation: requestKey, started: false, previews: new Map() };
    if (disabled || activeSavedSource === undefined || activePath === undefined) return;
    const path = pathKey(activePath),
      prefix = activeSavedSource.slice(0, 500),
      previous = observedSaved.current;
    const changed =
      !previous || previous.id !== id || previous.path !== path || previous.prefix !== prefix;
    if (changed && savedPreviews.current.started) {
      const previews = savedPreviews.current.previews;
      previews.delete(path);
      previews.set(path, prefix);
      if (previews.size > 400) {
        const oldest = previews.keys().next().value;
        if (oldest !== undefined) previews.delete(oldest);
      }
    }
    observedSaved.current = { id, path, prefix };
  }, [id, requestKey, activePath, activeSavedSource, disabled, pathKey]);
  // A new listing owns new previews and starts again from the first page of rows.
  useEffect(() => {
    window.clearTimeout(preview.current.timer);
    preview.current = {
      generation: report,
      requested: new Set(),
      wanted: new Set(),
      timer: undefined,
      observer: preview.current.observer,
    };
    setSummaries(new Map());
    setShown(PAGE_SIZE);
  }, [report]);
  const flushPreviews = useCallback(() => {
    const state = preview.current;
    state.timer = undefined;
    const generation = state.generation;
    const batch = [...state.wanted].slice(0, SUMMARY_BATCH);
    for (const path of batch) {
      state.wanted.delete(path);
      state.requested.add(path);
    }
    if (state.wanted.size > 0) state.timer = window.setTimeout(flushPreviews, 30);
    if (batch.length === 0) return;
    const blank = (path: string, state: WorkspaceDocumentSummary['state']) => ({
      relativePath: path,
      state,
      size: 0,
      modifiedAt: null,
      createdAt: null,
      summary: '',
      summaryTruncated: false,
    });
    const publish = (read: (path: string) => WorkspaceDocumentSummary) => {
      if (preview.current.generation !== generation) return;
      setSummaries((current) => {
        const next = new Map(current);
        for (const path of batch) next.set(path, read(path));
        return next;
      });
    };
    void workspaces.articleSummaries(id, batch).then(
      (result) => {
        // Older hosts and test doubles have no preview command: keep rows as listed.
        const byPath = new Map((result ?? []).map((item) => [item.relativePath, item]));
        publish((path) => byPath.get(path) ?? blank(path, result ? 'unavailable' : 'ready'));
      },
      // A failed read leaves the row without a preview instead of placeholders forever.
      () => publish((path) => blank(path, 'ready')),
    );
  }, [id]);
  const registerRow = useCallback((path: string, element: HTMLLIElement | null) => {
    const rows = previewRows.current;
    const known = rows.get(path);
    if (known && known !== element) preview.current.observer?.unobserve(known);
    if (!element) {
      rows.delete(path);
      return;
    }
    element.dataset.summaryPath = path;
    rows.set(path, element);
    preview.current.observer?.observe(element);
  }, []);
  useEffect(() => {
    if (!active || !report) return;
    const state = preview.current;
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          const path = (record.target as HTMLElement).dataset.summaryPath;
          if (!record.isIntersecting || !path || state.requested.has(path)) continue;
          state.wanted.add(path);
          if (state.timer === undefined) state.timer = window.setTimeout(flushPreviews, 30);
        }
      },
      {
        root: navigation.current?.closest('.workspace-panel, .sidebar-panel') ?? null,
        rootMargin: '360px 0px',
      },
    );
    state.observer = observer;
    for (const row of previewRows.current.values()) observer.observe(row);
    return () => {
      observer.disconnect();
      if (state.observer === observer) state.observer = null;
      window.clearTimeout(state.timer);
      state.timer = undefined;
    };
  }, [active, report, flushPreviews]);
  const openLatest = useRef(onOpen);
  openLatest.current = onOpen;
  const open = useCallback((path: string) => openLatest.current(path), []);
  useEffect(() => {
    if (!active) return;
    if (cached.current === requestKey) return;
    // The new scan supersedes old previews. Only saves acknowledged after this start survive its response.
    savedPreviews.current = { generation: requestKey, started: true, previews: new Map() };
    let cancelled = false;
    setLoading(true);
    setError('');
    const epoch = projectionEpoch(latestRenames.current, latestPresence.current);
    void workspaces.articles(id).then(
      (result) => {
        if (cancelled) return;
        cached.current = requestKey;
        setReportEpoch(epoch);
        setReport(result);
        setFocusPath((current) =>
          result.entries.some((entry) => entry.relativePath === current) ? current : null,
        );
        setLoading(false);
      },
      (reason) => {
        if (cancelled) return;
        setReport(null);
        setError(String(reason));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, active, requestKey]);
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [active]);
  const previousOrder = committedOrder.current;
  const sameReport = previousOrder?.id === id && previousOrder.report === report;
  const entries =
    sameReport &&
    previousOrder.sort === sort &&
    previousOrder.noGroup === noGroup &&
    previousOrder.platform === platform
      ? previousOrder.entries
      : groupedArticles(
          sameReport ? previousOrder.entries : (report?.entries ?? []),
          sort,
          noGroup,
          platform === 'windows',
        ).flatMap((group) => group.entries);
  useLayoutEffect(() => {
    committedOrder.current = { id, report, sort, noGroup, platform, entries };
  }, [id, report, sort, noGroup, platform, entries]);
  // Render also checks the generation: old overrides are never shown while the new request starts.
  const previews =
    savedPreviews.current.generation === requestKey ? savedPreviews.current.previews : undefined;
  const showFolders = entries.some((entry) => entry.folderRelativePath !== '');
  useLayoutEffect(() => {
    onNestedContent?.(showFolders);
  }, [onNestedContent, showFolders]);
  // Previews are read for the rows being shown. A document the host reports as hidden,
  // unsupported or gone leaves the list, exactly as the former full read skipped it.
  const visibleEntries = entries.filter((entry) => {
    const known = summaries.get(entry.relativePath);
    return !known || known.state === 'ready';
  });
  const created = creation?.state?.view === 'articles' ? creation.state.entry : undefined;
  if (created?.kind === 'file') {
    const folderRelativePath = parentPath(created.relativePath);
    const item: WorkspaceDocument = {
      name: created.name,
      relativePath: created.relativePath,
      folderName: folderRelativePath.split('/').at(-1) || workspace.name,
      folderRelativePath,
      size: created.size ?? 0,
      modifiedAt: created.modifiedAt ?? Date.now(),
      createdAt: created.createdAt ?? Date.now(),
      summary: '',
      summaryTruncated: false,
    };
    const index = visibleEntries.findIndex((entry) => entry.relativePath === created.relativePath);
    if (index < 0) visibleEntries.push(item);
    else visibleEntries[index] = item;
  }
  const withPreview = (entry: WorkspaceDocument): WorkspaceDocument => {
    const known = summaries.get(entry.relativePath);
    return known?.state === 'ready' && known.summary !== ''
      ? { ...entry, summary: known.summary, summaryTruncated: known.summaryTruncated }
      : entry;
  };
  // Rows are drawn a page at a time while scrolling; a row that must stay reachable
  // (the one being created, highlighted or focused) is always included.
  const required = new Set(
    [created?.relativePath, highlightPath, focusPath].filter(
      (path): path is string => path !== undefined && path !== null,
    ),
  );
  const renderedEntries = visibleEntries.filter(
    (entry, index) => index < shown || required.has(entry.relativePath),
  );
  const total = visibleEntries.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a fresh observer reports the sentinel again after every page.
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !active) return;
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting))
          setShown((current) => Math.min(current + PAGE_SIZE, total));
      },
      {
        root: navigation.current?.closest('.workspace-panel, .sidebar-panel') ?? null,
        rootMargin: '480px 0px',
      },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [active, shown, total]);
  const skipped = report
    ? report.skipped.symlinks +
      report.skipped.unsupportedNames +
      report.skipped.unreadable +
      report.skipped.unsupportedEncoding
    : 0;
  return (
    <nav
      ref={navigation}
      className={`workspace-articles${showFolders ? ' workspace-articles-folders' : ''}`}
      aria-label={`${workspace.name} 文档列表`}
      aria-busy={loading}
      onKeyDown={(event) => articleKey(event, typing.current)}
    >
      {loading && !report && <SidebarSkeleton variant="articles" />}
      {error && (
        <div className="workspace-error" role="alert">
          <span>{error}</span>
          <button type="button" disabled={disabled} onClick={() => setRetry((value) => value + 1)}>
            重试
          </button>
        </div>
      )}
      {!compact && !loading && !error && report?.entries.length === 0 && (
        <p className="workspace-hint">没有支持的文档</p>
      )}
      <ul className="workspace-article-list">
        {renderedEntries.map((entry, index) => {
          const path = `${pathKey(workspace.path).replace(/\/+$/, '')}/${entry.relativePath}`;
          const selected = workspacePathIsActive(
            workspace.path,
            entry.relativePath,
            activePath,
            platform,
          );
          return (
            <ArticleCard
              key={entryKey?.(entry.relativePath) ?? entry.relativePath}
              entry={withPreview(entry)}
              workspaceName={workspace.name}
              selected={selected}
              activeSource={
                selected
                  ? (activeSource ?? activeSavedSource)
                  : newPreview && pathKey(newPreview.path) === path
                    ? newPreview.sourcePrefix
                    : previews?.get(path)
              }
              tabIndex={
                focusPath === entry.relativePath || (focusPath === null && index === 0) ? 0 : -1
              }
              disabled={disabled}
              now={now}
              summaryPending={entry.summary === '' && !summaries.has(entry.relativePath)}
              register={registerRow}
              onFocusPath={setFocusPath}
              onOpen={open}
              creation={creation}
              highlighted={entry.relativePath === highlightPath}
            />
          );
        })}
        {renderedEntries.length < visibleEntries.length && (
          <li ref={sentinel} className="workspace-article-sentinel" aria-hidden="true" />
        )}
      </ul>
      {report && skipped > 0 && (
        <p className="workspace-hint">已跳过 {skipped} 个符号链接、不可读或不支持的条目。</p>
      )}
      {report?.truncated && (
        <div className="workspace-limit" role="status">
          <p>
            当前文件夹内文件过多，请切换至
            <button
              type="button"
              className="workspace-oversize-switch"
              aria-label="切换到文件树视图"
              disabled={disabled}
              onClick={onSwitchToTree}
            >
              文件树视图
            </button>
            以获得更佳的使用体验。
          </p>
          <small>
            已扫描 {report.scannedFiles} 个文件，当前列表未包含全部文档。
            {report.truncationReasons.length > 0 &&
              `达到${report.truncationReasons
                .map((reason) =>
                  reason === 'documents'
                    ? '文档数'
                    : reason === 'scan'
                      ? '扫描条目数'
                      : reason === 'depth'
                        ? '目录深度'
                        : '读取字节数',
                )
                .join('、')}上限。`}
          </small>
        </div>
      )}
    </nav>
  );
}
