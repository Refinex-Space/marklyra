import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  type DirectoryListing,
  type WorkspaceEntry,
  type WorkspaceFolder,
  workspaces,
} from '../../services/workspaces.js';
import { sortedDirectory, workspacePathIsActive } from './article-model.js';
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
}

interface TreeState extends TreeProps {
  focusPath: string | null;
  focusRow: (path: string) => void;
  listed: (path: string, entries: WorkspaceEntry[]) => void;
}

function treeKey(event: KeyboardEvent<HTMLElement>, typing: { prefix: string; time: number }) {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !target.hasAttribute('data-workspace-row')) return;
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
          disabled={props.disabled}
          title={entry.relativePath}
          onClick={(event) => {
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

function DirectoryBranch({ relativePath, ...props }: TreeState & { relativePath: string }) {
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [listingEpoch, setListingEpoch] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const { id } = props.workspace;
  const created = props.creation?.state?.view === 'tree' ? props.creation.state.entry : undefined;
  const entries = (listing?.entries ?? [])
    .map((entry) => projectedEntry(entry, listingEpoch, props.renames ?? NO_RENAMES))
    .filter((entry) =>
      entryIsPresent(
        entry.relativePath,
        listingEpoch,
        props.presence ?? NO_PRESENCE,
        props.renames ?? NO_RENAMES,
      ),
    );
  if (created && parentPath(created.relativePath) === relativePath) {
    const index = entries.findIndex((entry) => entry.relativePath === created.relativePath);
    if (index < 0) entries.push(created);
    else entries[index] = created;
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh and retry deliberately re-read the same directory path.
  useEffect(() => {
    let stale = false;
    const epoch = projectionEpoch(props.renames ?? NO_RENAMES, props.presence ?? NO_PRESENCE);
    setLoading(true);
    setError('');
    void workspaces.list(id, relativePath).then(
      (result) => {
        if (!stale) {
          setListingEpoch(epoch);
          setListing(result);
          props.listed(relativePath, result.entries);
          setLoading(false);
        }
      },
      (reason) => {
        if (!stale) {
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
      {loading && (
        <p className="workspace-hint" role="status">
          读取目录…
        </p>
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
      {!props.rootRow && !loading && listing?.entries.length === 0 && (
        <p className="workspace-hint">没有 Markdown 文件或子目录</p>
      )}
      {(listing || entries.length > 0) && (
        <>
          <ul className="workspace-tree-list">
            {sortedDirectory(
              entries,
              props.sort ?? 0,
              props.noGroup ?? false,
              props.platform === 'windows',
            ).map((entry, index) => (
              <DirectoryItem
                key={props.entryKey?.(entry.relativePath) ?? entry.relativePath}
                entry={entry}
                initial={relativePath === '' && index === 0}
                {...props}
              />
            ))}
          </ul>
          {listing && listing.skipped > 0 && (
            <p className="workspace-hint">
              已跳过 {listing.skipped} 个符号链接、不可读或不支持的名称。
            </p>
          )}
          {listing?.truncated && (
            <p className="workspace-limit" role="status">
              目录条目过多，当前列表未包含全部内容。请选择更小的目录。
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function DirectoryTree(props: TreeProps) {
  const [focusPath, focusRow] = useState<string | null>(null);
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
      onKeyDown={(event) => treeKey(event, typing.current)}
    >
      {props.rootRow && (
        <div
          className="workspace-root-row"
          title={props.workspace.path}
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
        focusPath={focusPath}
        focusRow={focusRow}
        listed={listed}
      />
    </nav>
  );
}
