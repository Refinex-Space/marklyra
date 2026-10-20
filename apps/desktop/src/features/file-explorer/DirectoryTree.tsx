import { displayPath } from '../../services/display-path.js';
import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type DirectoryListing,
  type WorkspaceEntry,
  type WorkspaceFolder,
  workspaces,
} from '../../services/workspaces.js';
import { useNotice } from '../notices/notices.js';
import { sortedDirectory, workspacePathIsActive, workspacePathIsInside } from './article-model.js';
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
import { SidebarSkeleton } from './SidebarSkeleton.js';
import { WorkspaceGlyph } from './WorkspaceGlyph.js';

interface TreeProps {
  workspace: WorkspaceFolder;
  activePath: string | undefined;
  disabled: boolean;
  refresh: number;
  onOpen: (relativePath: string) => void;
  rootRow?: boolean;
  sort?: FileSortType;
  noGroup?: boolean;
  platform?: FileSidebarPlatform;
  creation?: CreationEditor | undefined;
  entryKey?: ((path: string) => string) | undefined;
  renames?: readonly RelativeEntryRename[] | undefined;
  presence?: readonly RelativeEntryPresence[] | undefined;
  highlightPath?: string | undefined;
  /** Beside each folder: how many documents it holds, subfolders included. */
  showCounts?: boolean;
  /** F2 and Delete on the focused row; the host decides whether the action may start. */
  onRename?: ((target: TreeTarget) => void) | undefined;
  onTrash?: ((target: TreeTarget) => void) | undefined;
}
export interface TreeTarget {
  relativePath: string;
  kind: 'file' | 'directory';
}

type DocumentCountMap = Readonly<Record<string, number>>;
const NO_COUNTS: DocumentCountMap = Object.freeze({});

interface TreeState extends TreeProps {
  counts: DocumentCountMap;
  focusPath: string | null;
  focusRow: (path: string) => void;
  listed: (path: string, entries: WorkspaceEntry[]) => void;
}

function treeKey(
  event: KeyboardEvent<HTMLElement>,
  typing: { prefix: string; time: number },
  entry: Pick<TreeProps, 'disabled' | 'onRename' | 'onTrash' | 'platform'>,
) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !target.hasAttribute('data-workspace-row')) return;
  // File operations follow the system's keys: F2 renames; Delete (Cmd+Backspace on a Mac) deletes.
  const item: TreeTarget | undefined = target.dataset.entryPath
    ? {
        relativePath: target.dataset.entryPath,
        kind: target.dataset.entryKind === 'directory' ? 'directory' : 'file',
      }
    : undefined;
  if (item && !entry.disabled && !event.altKey && !event.shiftKey) {
    const trash =
      event.key === 'Delete' ||
      (entry.platform === 'macos' && event.metaKey && event.key === 'Backspace');
    if (event.key === 'F2' && !event.metaKey && !event.ctrlKey && entry.onRename) {
      event.preventDefault();
      entry.onRename(item);
      return;
    }
    if (trash && !event.ctrlKey && entry.onTrash) {
      event.preventDefault();
      entry.onTrash(item);
      return;
    }
  }
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  const rows = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      'button[data-workspace-row]:not(:disabled)',
    ),
  );
  const index = rows.indexOf(target);
  if (index < 0) return;
  let next: HTMLButtonElement | undefined | null;
  if (event.key === 'ArrowDown') next = rows[index + 1];
  else if (event.key === 'ArrowUp') next = rows[index - 1];
  else if (event.key === 'Home') next = rows[0];
  else if (event.key === 'End') next = rows.at(-1);
  else if (event.key === 'ArrowRight' && target.getAttribute('aria-expanded') !== null) {
    if (target.getAttribute('aria-expanded') === 'false') target.click();
    else
      next = target
        .closest('li')
        ?.querySelector('ul')
        ?.querySelector<HTMLButtonElement>('button[data-workspace-row]');
    event.preventDefault();
  } else if (event.key === 'ArrowLeft') {
    if (target.getAttribute('aria-expanded') === 'true') target.click();
    else
      next = target
        .closest('ul')
        ?.closest('li')
        ?.querySelector<HTMLButtonElement>('button[data-workspace-row]');
    event.preventDefault();
  }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) event.preventDefault();
  if (event.key.length === 1 && event.key !== ' ') {
    const now = Date.now(),
      key = event.key.toLocaleLowerCase();
    typing.prefix = now - typing.time < 700 && typing.prefix !== key ? typing.prefix + key : key;
    typing.time = now;
    next = [...rows.slice(index + 1), ...rows.slice(0, index + 1)].find((row) =>
      row.dataset.name?.toLocaleLowerCase().startsWith(typing.prefix),
    );
    event.preventDefault();
  }
  if (next) next.focus();
}

function DirectoryItem({
  entry,
  initial,
  ...props
}: TreeState & { entry: WorkspaceEntry; initial: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const groupId = useId();
  const directory = entry.kind === 'directory';
  const pending = props.creation?.state;
  const editing =
    pending?.entry?.relativePath === entry.relativePath &&
    pending.view === 'tree' &&
    !['creating', 'opening'].includes(pending.phase);
  useEffect(() => {
    const path = pending?.view === 'tree' ? pending.parentRelativePath : '';
    if (
      directory &&
      path &&
      (path === entry.relativePath || path.startsWith(`${entry.relativePath}/`))
    )
      setExpanded(true);
  }, [directory, entry.relativePath, pending?.parentRelativePath, pending?.view]);
  const active =
    !directory &&
    workspacePathIsActive(
      props.workspace.path,
      entry.relativePath,
      props.activePath,
      props.platform,
    );
  // Opening a document from anywhere (search, recents, a restored session) reveals it here. Only
  // the change into a folder expands it, so the user can still collapse a folder afterwards.
  const holdsActive =
    directory &&
    workspacePathIsInside(
      props.workspace.path,
      entry.relativePath,
      props.activePath,
      props.platform,
    );
  useEffect(() => {
    if (holdsActive) setExpanded(true);
  }, [holdsActive]);
  const row = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active) row.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  return (
    <li className="workspace-tree-item">
      {editing && props.creation ? (
        <div
          className="workspace-tree-row workspace-tree-row-editing"
          data-entry-path={entry.relativePath}
          data-entry-kind={entry.kind}
          style={
            { '--workspace-tree-depth': entry.relativePath.split('/').length } as CSSProperties
          }
        >
          <span className="workspace-tree-disclosure" aria-hidden="true">
            {directory && <WorkspaceGlyph name="chevron" />}
          </span>
          <WorkspaceGlyph name={directory ? 'folder' : 'file'} />
          <CreatedNameInput
            key={pending?.entry?.entryToken}
            creation={props.creation}
            disabled={props.disabled}
            view="tree"
          />
        </div>
      ) : (
        <button
          ref={row}
          type="button"
          className={`workspace-tree-row${props.highlightPath === entry.relativePath ? ' workspace-file-highlight' : ''}`}
          data-workspace-row=""
          data-name={entry.name}
          data-entry-path={entry.relativePath}
          data-entry-kind={entry.kind}
          draggable={!props.disabled}
          style={
            { '--workspace-tree-depth': entry.relativePath.split('/').length } as CSSProperties
          }
          tabIndex={
            props.focusPath === entry.relativePath || (props.focusPath === null && initial) ? 0 : -1
          }
          onFocus={() => props.focusRow(entry.relativePath)}
          aria-expanded={directory ? expanded : undefined}
          aria-controls={directory && expanded ? groupId : undefined}
          aria-current={active ? 'page' : undefined}
          // Not `disabled`: a disabled button drops keyboard focus and is dimmed by the global
          // button style, which made the whole tree flash on every document switch.
          aria-disabled={props.disabled || undefined}
          title={entry.relativePath}
          onClick={(event) => {
            if (props.disabled) return;
            props.focusRow(entry.relativePath);
            if (directory) {
              event.currentTarget.focus();
              setExpanded((value) => !value);
            } else props.onOpen(entry.relativePath);
          }}
        >
          <span className="workspace-tree-disclosure" aria-hidden="true">
            {directory && <WorkspaceGlyph name="chevron" />}
          </span>
          <WorkspaceGlyph name={directory ? (expanded ? 'folderOpen' : 'folder') : 'file'} />
          <span className="workspace-tree-name">{entry.name}</span>
          {directory && (props.counts[entry.relativePath] ?? 0) > 0 && (
            <span className="workspace-tree-count">
              {formatCount(props.counts[entry.relativePath] ?? 0)}
            </span>
          )}
        </button>
      )}
      {directory && expanded && (
        <div id={groupId}>
          <DirectoryBranch {...props} relativePath={entry.relativePath} />
        </div>
      )}
    </li>
  );
}

const formatCount = (count: number) => (count > 9999 ? '9999+' : String(count));

function sameCounts(a: DocumentCountMap, b: DocumentCountMap): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/**
 * Documents per folder, recounted after every change of the directory. The numbers are a
 * courtesy: a failed or late count leaves the previous ones and never blocks the tree.
 */
function useDocumentCounts(workspace: WorkspaceFolder, refresh: number, enabled: boolean) {
  const [counts, setCounts] = useState<DocumentCountMap>(NO_COUNTS);
  const { id, metadataRevision } = workspace;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a changed refresh or revision recounts the same workspace.
  useEffect(() => {
    if (!enabled) {
      setCounts(NO_COUNTS);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      void workspaces.documentCounts(id).then(
        (report) => {
          // Hosts without the command (and test doubles) answer nothing: keep the tree plain.
          const next = report?.counts;
          if (!stale && next && typeof next === 'object')
            setCounts((previous) => (sameCounts(previous, next) ? previous : next));
        },
        () => {},
      );
    }, 120);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [id, metadataRevision, refresh, enabled]);
  return counts;
}

/** A refresh that finds the directory unchanged must not re-render its rows. */
function sameListing(a: DirectoryListing | null, b: DirectoryListing): boolean {
  return (
    !!a &&
    a.truncated === b.truncated &&
    a.skipped === b.skipped &&
    a.entries.length === b.entries.length &&
    a.entries.every((entry, index) => {
      const other = b.entries[index];
      return (
        !!other &&
        entry.name === other.name &&
        entry.relativePath === other.relativePath &&
        entry.kind === other.kind &&
        entry.size === other.size
      );
    })
  );
}

function DirectoryBranch({ relativePath, ...props }: TreeState & { relativePath: string }) {
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [listingEpoch, setListingEpoch] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const listed = useRef(false);
  const { id } = props.workspace;
  const created = props.creation?.state?.view === 'tree' ? props.creation.state.entry : undefined;
  const renames = props.renames ?? NO_RENAMES;
  const presence = props.presence ?? NO_PRESENCE;
  const entries = useMemo(() => {
    const visible = (listing?.entries ?? [])
      .map((entry) => projectedEntry(entry, listingEpoch, renames))
      .filter((entry) => entryIsPresent(entry.relativePath, listingEpoch, presence, renames));
    if (created && parentPath(created.relativePath) === relativePath) {
      const index = visible.findIndex((entry) => entry.relativePath === created.relativePath);
      if (index < 0) visible.push(created);
      else visible[index] = created;
    }
    return visible;
  }, [listing, listingEpoch, renames, presence, created, relativePath]);
  const ordered = useMemo(
    () =>
      sortedDirectory(
        entries,
        props.sort ?? 0,
        props.noGroup ?? false,
        props.platform === 'windows',
      ),
    [entries, props.sort, props.noGroup, props.platform],
  );
  useNotice(
    listing && listing.skipped > 0
      ? `已跳过 ${listing.skipped} 个符号链接、不可读或不支持的名称。`
      : '',
  );
  useNotice(listing?.truncated ? '目录条目过多，当前列表未包含全部内容。请选择更小的目录。' : '');
  // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh and retry deliberately re-read the same directory path.
  useEffect(() => {
    let stale = false;
    const epoch = projectionEpoch(props.renames ?? NO_RENAMES, props.presence ?? NO_PRESENCE);
    // Only the first read shows a busy state; later refreshes swap the rows in place.
    if (!listed.current) setLoading(true);
    setError('');
    void workspaces.list(id, relativePath).then(
      (result) => {
        if (!stale) {
          listed.current = true;
          setListingEpoch(epoch);
          setListing((previous) => (sameListing(previous, result) ? previous : result));
          props.listed(relativePath, result.entries);
          setLoading(false);
        }
      },
      (reason) => {
        if (!stale) {
          listed.current = false;
          setListing(null);
          props.listed(relativePath, []);
          setError(String(reason));
          setLoading(false);
        }
      },
    );
    return () => {
      stale = true;
    };
  }, [
    id,
    props.workspace.path,
    props.workspace.metadataRevision,
    relativePath,
    props.refresh,
    retry,
  ]);

  return (
    <div className="workspace-branch" aria-busy={loading}>
      {loading && entries.length === 0 && (
        <SidebarSkeleton variant="tree" rows={props.rootRow || relativePath === '' ? 6 : 2} />
      )}
      {error && (
        <div className="workspace-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            disabled={props.disabled}
            onClick={() => setRetry((value) => value + 1)}
          >
            重试
          </button>
        </div>
      )}
      {(listing || entries.length > 0) && (
        <ul className="workspace-tree-list">
          {ordered.map((entry, index) => (
            <DirectoryItem
              key={props.entryKey?.(entry.relativePath) ?? entry.relativePath}
              entry={entry}
              initial={relativePath === '' && index === 0}
              {...props}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function DirectoryTree(props: TreeProps) {
  const [focusPath, focusRow] = useState<string | null>(null);
  const counts = useDocumentCounts(props.workspace, props.refresh, props.showCounts ?? true);
  const typing = useRef({ prefix: '', time: 0 });
  const seenRename = useRef(0);
  useEffect(() => {
    const epoch = seenRename.current;
    const next = props.renames?.filter((rename) => rename.sequence > epoch) ?? [];
    if (!next.length) return;
    focusRow((path) =>
      path === null
        ? null
        : projectedEntry({ name: '', relativePath: path, kind: 'file', size: null }, epoch, next)
            .relativePath,
    );
    seenRename.current = next.at(-1)?.sequence ?? seenRename.current;
  }, [props.renames]);
  const listed = useCallback((path: string, entries: WorkspaceEntry[]) => {
    focusRow((focused) => {
      if (!focused || focused === path || (path && !focused.startsWith(`${path}/`))) return focused;
      const retained = entries.some(
        (entry) => focused === entry.relativePath || focused.startsWith(`${entry.relativePath}/`),
      );
      return retained ? focused : path || entries[0]?.relativePath || null;
    });
  }, []);
  return (
    <nav
      className="workspace-directory-tree"
      aria-label={`${props.workspace.name} 文件目录`}
      onKeyDown={(event) => treeKey(event, typing.current, props)}
    >
      {props.rootRow && (
        <div
          className="workspace-root-row"
          title={displayPath(props.workspace.path)}
          data-entry-path=""
          data-entry-kind="directory"
        >
          <WorkspaceGlyph name="folder" />
          <span>{props.workspace.name}</span>
        </div>
      )}
      <DirectoryBranch
        {...props}
        relativePath=""
        counts={counts}
        focusPath={focusPath}
        focusRow={focusRow}
        listed={listed}
      />
    </nav>
  );
}
