import { listen } from '@tauri-apps/api/event';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  type DirectoryHistoryCatalog,
  type DirectoryHistoryEntry,
  directoryHistory,
} from '../../services/directory-history.js';
import { displayPath } from '../../services/display-path.js';
import type { WorkspaceFolder } from '../../services/workspaces.js';
import { directoryMenuLimit, directoryMenuRows } from './directory-menu-model.js';
import { revealLabel } from './file-preferences.js';
import { WorkspaceGlyph } from './WorkspaceGlyph.js';

interface Props {
  workspace: WorkspaceFolder | null;
  enabled: boolean;
  disabled: boolean;
  choose(): void;
  newDocument?: (() => void) | undefined;
  newDocumentDisabled?: boolean | undefined;
  search?: (() => void) | undefined;
  reveal?: (() => void) | undefined;
  refresh(): void;
  dismiss(): void;
  sortControls: ReactNode;
  navigate(entry: DirectoryHistoryEntry, revision: number, modifier: boolean): void;
  platform: 'macos' | 'windows' | 'browser';
}
function PinGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5 2h6M6 2v5L4 10h8l-2-3V2M8 10v5" />
    </svg>
  );
}
function TrashGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 4h10M6 4V2h4v2M4 4l1 10h6l1-10M6.5 6v6M9.5 6v6" />
    </svg>
  );
}

/** Host catalog paths are display metadata. Actions send only host-issued IDs. */
export function DirectoryHistoryMenu({
  workspace,
  enabled,
  disabled,
  choose,
  newDocument,
  newDocumentDisabled,
  search,
  reveal,
  refresh,
  dismiss,
  sortControls,
  navigate,
  platform,
}: Props) {
  const root = useRef<HTMLUListElement>(null),
    serial = useRef(0),
    alive = useRef(false),
    lifetime = useRef(0),
    busyRef = useRef(false);
  const [catalogState, setCatalog] = useState<{
      workspaceId: string | undefined;
      value: DirectoryHistoryCatalog;
    } | null>(null),
    [loading, setLoading] = useState(enabled),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [limit, setLimit] = useState(6);
  const catalog =
    catalogState?.workspaceId === workspace?.id ? (catalogState?.value ?? null) : null;
  const currentWorkspace = useRef(workspace);
  currentWorkspace.current = workspace;
  const request = async (id: string | undefined = currentWorkspace.current?.id) => {
    const ticket = ++serial.current;
    try {
      const next = await directoryHistory.list(id);
      if (alive.current && serial.current === ticket && currentWorkspace.current?.id === id) {
        directoryMenuRows(next, currentWorkspace.current, 6);
        setCatalog({ workspaceId: id, value: next });
        setLoading(false);
      }
    } catch (reason) {
      if (alive.current && serial.current === ticket && currentWorkspace.current?.id === id) {
        setError(String(reason));
        setLoading(false);
      }
    }
  };
  const reload = useRef(request);
  reload.current = request;
  useEffect(() => {
    alive.current = true;
    const scope = ++lifetime.current;
    busyRef.current = false;
    setBusy(false);
    setCatalog(null);
    setError('');
    setLoading(enabled);
    if (enabled) void reload.current(workspace?.id);
    const stop = enabled
      ? listen('directory-history-changed', () => {
          if (alive.current && lifetime.current === scope) void reload.current();
        })
      : null;
    void stop?.catch((reason: unknown) => {
      if (alive.current && lifetime.current === scope)
        setError(`目录历史监听失败：${String(reason)}`);
    });
    return () => {
      alive.current = false;
      lifetime.current++;
      serial.current++;
      void stop?.then((dispose) => dispose()).catch(() => {});
    };
  }, [enabled, workspace?.id]);
  const rows = catalog
    ? directoryMenuRows(catalog, workspace, limit)
    : workspace
      ? [
          {
            target: { kind: 'workspace' as const, workspaceId: workspace.id },
            name: workspace.name,
            path: workspace.path,
            pinned: false,
            current: true,
            reopenable: true,
          },
        ]
      : [];
  useLayoutEffect(() => {
    const list = root.current,
      menu = list?.closest<HTMLElement>('[role="menu"]'),
      sidebar = list?.closest<HTMLElement>('.workspace-sidebar');
    if (!list || !menu || !sidebar) return;
    const measure = () => {
      const footer = list.closest<HTMLElement>('.workspace-footer');
      const content =
        sidebar.querySelector<HTMLElement>('.workspace-panel:not([hidden])') ??
        sidebar.querySelector<HTMLElement>('.workspace-compact-empty');
      if (content) observer.observe(content);
      const height =
        content?.clientHeight ?? Math.max(0, sidebar.clientHeight - (footer?.clientHeight ?? 0));
      const style = getComputedStyle(menu);
      const base = Math.round(
        [...list.children]
          .filter((row) => !row.hasAttribute('data-directory-entry'))
          .reduce((sum, row) => sum + row.getBoundingClientRect().height, 0) +
          Number.parseFloat(style.paddingTop) +
          Number.parseFloat(style.paddingBottom),
      );
      const rowHeight =
        menu.querySelector<HTMLElement>('[data-directory-row-height]')?.clientHeight ?? 0;
      const count = directoryMenuLimit(height, base, rowHeight);
      setLimit((previous) => (previous === count ? previous : count));
    };
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(sidebar);
    observer.observe(menu);
    return () => observer.disconnect();
  }, []);
  const mutate = async (entry: DirectoryHistoryEntry, action: 'pin' | 'remove') => {
    if (!catalog || busyRef.current || disabled) return;
    const scope = lifetime.current;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (action === 'pin')
        await directoryHistory.pin(catalog.revision, entry.target, !entry.pinned);
      else await directoryHistory.remove(catalog.revision, entry.target);
      if (alive.current && lifetime.current === scope) await reload.current();
    } catch (reason) {
      if (alive.current && lifetime.current === scope) {
        setError(String(reason));
        await reload.current();
      }
    } finally {
      if (alive.current && lifetime.current === scope) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const action = (callback: (() => void) | undefined) => () => {
    if (!callback || disabled || busy) return;
    dismiss();
    callback();
  };
  return (
    <ul className="directory-menu-items" ref={root} role="none" aria-busy={loading || busy}>
      {workspace && (
        <>
          <li role="presentation" className="directory-menu-heading">
            <span>操作</span>
            <button
              type="button"
              className="directory-menu-dismiss"
              data-menu-skip-roving
              tabIndex={-1}
              aria-label="关闭目录菜单"
              onClick={dismiss}
            >
              <WorkspaceGlyph name="close" />
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              disabled={disabled || busy || !newDocument || newDocumentDisabled}
              onClick={action(newDocument)}
            >
              新建文件
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              disabled={disabled || busy || !search}
              onClick={action(search)}
            >
              搜索
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              data-directory-row-height
              disabled={disabled || busy || !reveal}
              onClick={action(reveal)}
            >
              {revealLabel(platform)}
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              disabled={disabled || busy || !enabled}
              onClick={action(choose)}
            >
              打开文件夹…
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              disabled={disabled || busy}
              onClick={action(refresh)}
            >
              刷新
            </button>
          </li>
          <li role="presentation" className="directory-menu-heading directory-sort-row">
            <span>排序</span>
            {sortControls}
          </li>
        </>
      )}
      {rows.length > 0 && (
        <li role="presentation" className="directory-menu-heading directory-recent-heading">
          最近使用的目录
        </li>
      )}
      {rows.map((entry) => (
        <li
          role="none"
          key={JSON.stringify(entry.target)}
          className="directory-location-row"
          data-directory-entry
          data-directory-path={entry.path}
          data-pinned={entry.pinned || undefined}
          data-current={entry.current || undefined}
        >
          <button
            type="button"
            role="menuitem"
            className="directory-location-open"
            title={displayPath(entry.reopenable ? entry.path : `${entry.path}\n请重新选择此文件夹`)}
            aria-current={entry.current ? 'location' : undefined}
            disabled={disabled || busy || !catalog || !entry.reopenable}
            onClick={(event) => {
              if (!catalog || disabled || busy || !entry.reopenable) return;
              const modifier = platform === 'macos' ? event.metaKey : event.ctrlKey;
              dismiss();
              navigate(entry, catalog.revision, modifier);
            }}
          >
            <WorkspaceGlyph name="folderOutline" />
            <span>{entry.name}</span>
          </button>
          <button
            type="button"
            className="directory-record-action directory-location-pin"
            role="menuitemcheckbox"
            aria-checked={entry.pinned}
            title={entry.pinned ? '取消固定' : '固定'}
            aria-label={`${entry.pinned ? '取消固定' : '固定'} ${entry.name}`}
            disabled={disabled || busy || !catalog}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void mutate(entry, 'pin')}
          >
            <PinGlyph />
          </button>
          {!entry.pinned && !entry.current && (
            <button
              type="button"
              role="menuitem"
              className="directory-record-action directory-location-remove"
              title="从列表中删除"
              aria-label={`从列表中删除 ${entry.name}`}
              disabled={disabled || busy || !catalog}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void mutate(entry, 'remove')}
            >
              <TrashGlyph />
            </button>
          )}
          {entry.current && <span className="directory-current-dot" aria-hidden="true" />}
        </li>
      ))}
      {loading && (
        <li className="directory-menu-status" role="status">
          正在读取目录…
        </li>
      )}
      {error && (
        <li className="directory-menu-error" role="alert">
          {error}
          <button
            type="button"
            onClick={() => {
              setError('');
              setLoading(true);
              void reload.current();
            }}
          >
            重试
          </button>
        </li>
      )}
      {!workspace && (
        <>
          <li role="presentation" className="directory-menu-heading directory-location-heading">
            目录
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              disabled={disabled || busy || !enabled}
              onClick={action(choose)}
            >
              打开文件夹…
            </button>
          </li>
        </>
      )}
    </ul>
  );
}
