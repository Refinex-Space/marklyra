import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/Icon.js';
import { SkeletonBar } from '../../components/Skeleton.js';
import type { DirectoryHistoryEntry } from '../../services/directory-history.js';
import { displayPath } from '../../services/display-path.js';
import type { WorkspaceFolder } from '../../services/workspaces.js';
import { DirectoryHistoryMenu } from './DirectoryHistoryMenu.js';
import {
  type FileSidebarPlatform,
  type FileSidebarPreferences,
  type FileSortType,
  revealLabel,
} from './file-preferences.js';
import { WorkspaceGlyph } from './WorkspaceGlyph.js';
import './workspace-navigation.css';

type Panel = 'directory' | 'create';
interface Props {
  workspace: WorkspaceFolder | null;
  platform: FileSidebarPlatform;
  restoring: boolean;
  disabled: boolean;
  creationBusy: boolean;
  canChoose: boolean;
  hidden: boolean;
  searchTargetId: string;
  searchPanelId: string;
  accessory?: ReactNode;
  choose(): void;
  refresh(): void;
  close(): void;
  search(): void;
  reveal(): void;
  create(kind: 'file' | 'directory'): void;
  navigate(entry: DirectoryHistoryEntry, revision: number, modifier: boolean): void;
  preferences: FileSidebarPreferences;
  changePreferences(value: FileSidebarPreferences): void;
}
const sorts = ['自然排序', '名称', '修改时间', '创建时间'] as const;

/** File navigation, creation and browsing preferences share one stable header.
 * The menu lives in the Shell layer so the sidebar never clips it or the editor. */
export function WorkspaceNavigation(props: Props) {
  const { workspace, preferences, disabled, creationBusy, platform } = props;
  const [panel, setPanel] = useState<Panel | null>(null);
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const submenu = useRef<HTMLDivElement>(null),
    viewTrigger = useRef<HTMLButtonElement>(null);
  const submenuShown = useRef(false),
    focusSubmenu = useRef<'none' | 'container' | 'first'>('none');
  const hoverOpen = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    hoverClose = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    add = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const owner = useRef<'folder' | 'create'>('folder');
  const parentFocus = useRef<'container' | 'first' | 'last'>('container');
  const id = useId();
  const sort = preferences.view === 'tree' ? preferences.treeSort : preferences.articleSort;
  const mode = sort === -10 ? 0 : Math.abs(sort);
  const noGroup =
    preferences.view === 'tree' ? preferences.treeNoGroup : preferences.articleNoGroup;
  const sortKey = preferences.view === 'tree' ? 'treeSort' : 'articleSort';
  const focusTrigger = useCallback(
    () => (owner.current === 'create' ? add : trigger).current?.focus({ preventScroll: true }),
    [],
  );
  const cancelSubmenuTimers = useCallback(() => {
    clearTimeout(hoverOpen.current);
    clearTimeout(hoverClose.current);
  }, []);
  const closeSubmenu = useCallback(
    (focus = false) => {
      cancelSubmenuTimers();
      submenuShown.current = false;
      focusSubmenu.current = 'none';
      setSubmenuOpen(false);
      viewTrigger.current?.removeAttribute('data-submenu-side');
      if (focus) viewTrigger.current?.focus({ preventScroll: true });
    },
    [cancelSubmenuTimers],
  );
  const showSubmenu = (focus: 'none' | 'container' | 'first' = 'none') => {
    cancelSubmenuTimers();
    submenuShown.current = true;
    focusSubmenu.current = focus;
    setSubmenuOpen(true);
    if (focus !== 'none' && submenu.current) {
      (focus === 'container'
        ? submenu.current
        : submenu.current.querySelector<HTMLButtonElement>('button:not(:disabled)')
      )?.focus({ preventScroll: true });
      focusSubmenu.current = 'none';
    }
  };
  const leaveSubmenu = () => {
    clearTimeout(hoverOpen.current);
    clearTimeout(hoverClose.current);
    hoverClose.current = setTimeout(
      () => closeSubmenu(Boolean(submenu.current?.contains(document.activeElement))),
      250,
    );
  };
  useEffect(() => cancelSubmenuTimers, [cancelSubmenuTimers]);
  const dismiss = useCallback(
    (focus = false) => {
      closeSubmenu();
      setPanel(null);
      if (focus) focusTrigger();
    },
    [focusTrigger, closeSubmenu],
  );
  const open = (next: 'directory' | 'create', position: typeof point = null, keyboard = false) => {
    closeSubmenu();
    parentFocus.current = keyboard ? 'first' : 'container';
    owner.current = next === 'create' ? 'create' : 'folder';
    setPoint(position);
    setPanel((previous) => (previous === next && !position ? null : next));
  };
  const run = (action: () => void) => {
    dismiss(true);
    action();
  };
  const setSort = (nextMode: number, descending: boolean) =>
    props.changePreferences({
      ...preferences,
      [sortKey]: (descending ? (nextMode === 0 ? -10 : -nextMode) : nextMode) as FileSortType,
    });
  const previousWorkspace = useRef(workspace?.id);
  useEffect(() => {
    if (disabled || props.hidden || previousWorkspace.current !== workspace?.id) dismiss();
    previousWorkspace.current = workspace?.id;
  }, [workspace?.id, disabled, props.hidden, dismiss]);
  const placeSubmenu = useCallback(() => {
    const child = submenu.current,
      anchor = viewTrigger.current,
      parent = menu.current;
    if (!child || !anchor || !parent) return;
    const bounds = parent.getBoundingClientRect(),
      row = anchor.getBoundingClientRect();
    if (row.bottom <= bounds.top || row.top >= bounds.bottom) {
      const ownedFocus = child.contains(document.activeElement);
      closeSubmenu();
      if (ownedFocus) {
        // A scrolled-away anchor must not leave keyboard focus in a removed portal.
        const visible = [
          ...parent.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        ].find((button) => {
          const box = button.getBoundingClientRect();
          return box.top >= bounds.top && box.bottom <= bounds.bottom;
        });
        (visible ?? trigger.current)?.focus({ preventScroll: true });
      }
      return;
    }
    child.style.maxHeight = `${Math.max(0, window.innerHeight - 16)}px`;
    const rect = child.getBoundingClientRect();
    const right = window.innerWidth - bounds.right - 12,
      left = bounds.left - 12;
    const side = right >= rect.width || right >= left ? 'right' : 'left';
    const x = side === 'right' ? bounds.right + 4 : bounds.left - rect.width - 4;
    child.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    child.style.top = `${Math.max(8, Math.min(row.top, window.innerHeight - rect.height - 8))}px`;
    child.dataset.side = side;
    anchor.dataset.submenuSide = side;
  }, [closeSubmenu]);
  useLayoutEffect(() => {
    if (!submenuOpen || panel !== 'directory' || !submenu.current) return;
    placeSubmenu();
    if (focusSubmenu.current !== 'none') {
      (focusSubmenu.current === 'container'
        ? submenu.current
        : submenu.current.querySelector<HTMLButtonElement>('button:not(:disabled)')
      )?.focus({ preventScroll: true });
      focusSubmenu.current = 'none';
    }
    const observer = new ResizeObserver(placeSubmenu);
    observer.observe(submenu.current);
    if (menu.current) observer.observe(menu.current);
    const parent = menu.current;
    parent?.addEventListener('scroll', placeSubmenu);
    window.addEventListener('resize', placeSubmenu);
    return () => {
      observer.disconnect();
      parent?.removeEventListener('scroll', placeSubmenu);
      window.removeEventListener('resize', placeSubmenu);
    };
  }, [panel, submenuOpen, placeSubmenu]);
  useLayoutEffect(() => {
    if (!panel || !menu.current) return;
    const element = menu.current;
    const anchor = (owner.current === 'create' ? add : trigger).current;
    if (!anchor) return;
    const place = () => {
      const bounds = anchor.getBoundingClientRect();
      const top = point?.y ?? (root.current?.getBoundingClientRect().bottom ?? bounds.bottom) + 4;
      element.style.maxHeight = `${Math.max(80, window.innerHeight - Math.max(8, top) - 8)}px`;
      const rect = element.getBoundingClientRect();
      element.style.left = `${Math.max(8, Math.min(point?.x ?? bounds.left, window.innerWidth - rect.width - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(top, window.innerHeight - rect.height - 8))}px`;
      placeSubmenu();
    };
    place();
    const buttons = [
      ...element.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled):not([data-menu-skip-roving])',
      ),
    ];
    (parentFocus.current === 'container'
      ? element
      : parentFocus.current === 'last'
        ? buttons.at(-1)
        : buttons[0]
    )?.focus({ preventScroll: true });
    parentFocus.current = 'container';
    const observer = new ResizeObserver(place);
    observer.observe(element);
    observer.observe(anchor);
    if (root.current) observer.observe(root.current);
    const outside = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !element.contains(target) &&
        !submenu.current?.contains(target) &&
        !trigger.current?.contains(target) &&
        !add.current?.contains(target)
      )
        dismiss();
    };
    const escapeMenu = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        event.stopPropagation();
        if (submenuShown.current) closeSubmenu(true);
        else dismiss(true);
      }
    };
    const blur = () => dismiss();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escapeMenu, true);
    window.addEventListener('blur', blur);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escapeMenu, true);
      window.removeEventListener('blur', blur);
      window.removeEventListener('resize', place);
    };
  }, [panel, point, dismiss, closeSubmenu, placeSubmenu]);
  const creationItems = (
    <>
      <button
        type="button"
        role="menuitem"
        disabled={disabled || creationBusy || !workspace}
        onClick={() => run(() => props.create('file'))}
      >
        <Icon name="document" />
        新建文档
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={disabled || creationBusy || !workspace}
        onClick={() => run(() => props.create('directory'))}
      >
        <WorkspaceGlyph name="folderOutline" />
        新建文件夹
      </button>
    </>
  );
  const popup = panel && (
    <div
      className="workspace-navigation-popup"
      role="menu"
      aria-label={panel === 'create' ? '新建' : '目录操作'}
      id={id}
      ref={menu}
      tabIndex={-1}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onFocusCapture={(event) => {
        if (submenuShown.current && !viewTrigger.current?.contains(event.target)) closeSubmenu();
      }}
      onKeyDown={(event) => {
        const buttons = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
            'button:not(:disabled):not([data-menu-skip-roving])',
          ),
        ];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? buttons[0]
            : event.key === 'End'
              ? buttons.at(-1)
              : event.key === 'ArrowDown'
                ? buttons[(current + 1) % buttons.length]
                : event.key === 'ArrowUp'
                  ? buttons[
                      current < 0
                        ? buttons.length - 1
                        : (current + buttons.length - 1) % buttons.length
                    ]
                  : null;
        if (next) {
          event.preventDefault();
          next.focus();
        }
      }}
    >
      {panel === 'create' ? (
        <>
          <p
            className="workspace-menu-caption"
            title={workspace ? displayPath(workspace.path) : undefined}
          >
            在 {workspace?.name} 根目录新建
          </p>
          {creationItems}
        </>
      ) : (
        <DirectoryHistoryMenu
          workspace={workspace}
          enabled={props.canChoose}
          disabled={disabled}
          choose={props.choose}
          refresh={props.refresh}
          dismiss={() => dismiss(true)}
          sortControls={null}
          platform={platform}
          navigate={props.navigate}
          header={
            <>
              {workspace && (
                <>
                  <div className="workspace-menu-identity">
                    <WorkspaceGlyph name="folderOpen" />
                    <span title={displayPath(workspace.path)}>
                      <strong>{workspace.name}</strong>
                      <small>{displayPath(workspace.path)}</small>
                    </span>
                  </div>
                  <hr />
                  <button
                    type="button"
                    role="menuitem"
                    ref={viewTrigger}
                    className="workspace-submenu-trigger"
                    aria-haspopup="menu"
                    aria-expanded={submenuOpen}
                    aria-controls={submenuOpen ? `${id}-view` : undefined}
                    onClick={(event) => showSubmenu(event.detail === 0 ? 'first' : 'container')}
                    onPointerEnter={(event) => {
                      if (event.pointerType !== 'mouse') return;
                      cancelSubmenuTimers();
                      if (!submenuShown.current)
                        hoverOpen.current = setTimeout(() => showSubmenu(), 150);
                    }}
                    onPointerLeave={(event) => {
                      if (event.pointerType === 'mouse') leaveSubmenu();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowRight') {
                        event.preventDefault();
                        showSubmenu('first');
                      }
                    }}
                  >
                    <Icon name="settings" />
                    视图与排序
                    <span className="workspace-menu-summary">
                      {preferences.view === 'tree' ? '文件树' : '列表'} · {sorts[mode]}
                    </span>
                    <Icon name="chevronRight" />
                  </button>
                  <hr />
                </>
              )}
              <button
                type="button"
                role="menuitem"
                disabled={disabled || !props.canChoose}
                onClick={() => run(props.choose)}
              >
                <Icon name="open" />
                打开文件夹…
              </button>
            </>
          }
          footer={
            workspace && (
              <>
                <hr />
                <button type="button" role="menuitem" onClick={() => run(props.reveal)}>
                  <Icon name="open" />
                  {revealLabel(platform)}
                </button>
                <button type="button" role="menuitem" onClick={() => run(props.refresh)}>
                  <Icon name="refresh" />
                  刷新文件列表
                </button>
                <hr />
                <button type="button" role="menuitem" onClick={() => run(props.close)}>
                  <Icon name="close" />
                  关闭文件夹
                </button>
              </>
            )
          }
        />
      )}
    </div>
  );
  const viewPopup = panel === 'directory' && submenuOpen && (
    <div
      className="workspace-navigation-popup workspace-navigation-submenu"
      role="menu"
      aria-label="视图与排序"
      id={`${id}-view`}
      ref={submenu}
      tabIndex={-1}
      onPointerEnter={cancelSubmenuTimers}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') leaveSubmenu();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          closeSubmenu(true);
          return;
        }
        const buttons = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        ];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? buttons[0]
            : event.key === 'End'
              ? buttons.at(-1)
              : event.key === 'ArrowDown'
                ? buttons[(at + 1) % buttons.length]
                : event.key === 'ArrowUp'
                  ? buttons[
                      at < 0 ? buttons.length - 1 : (at + buttons.length - 1) % buttons.length
                    ]
                  : null;
        if (next) {
          event.preventDefault();
          next.focus();
        }
      }}
    >
      <p className="workspace-menu-caption">显示方式</p>
      {(['tree', 'articles'] as const).map((view) => (
        <button
          key={view}
          type="button"
          role="menuitemradio"
          aria-checked={preferences.view === view}
          disabled={disabled || creationBusy}
          onClick={() => props.changePreferences({ ...preferences, view })}
        >
          {view === 'tree' ? '文件树' : '文档列表'}
          {preferences.view === view && <Icon name="check" />}
        </button>
      ))}
      <hr />
      <p className="workspace-menu-caption">排序依据</p>
      {sorts.map((name, value) => (
        <button
          key={name}
          type="button"
          role="menuitemradio"
          aria-checked={value === mode}
          onClick={() => setSort(value, sort < 0)}
        >
          {name}
          {value === mode && <Icon name="check" />}
        </button>
      ))}
      <hr />
      {[false, true].map((descending) => (
        <button
          key={String(descending)}
          type="button"
          role="menuitemradio"
          aria-checked={sort < 0 === descending}
          onClick={() => setSort(mode, descending)}
        >
          {descending ? '降序' : '升序'}
          {sort < 0 === descending && <Icon name="check" />}
        </button>
      ))}
      <hr />
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={!noGroup}
        onClick={() =>
          props.changePreferences({
            ...preferences,
            [preferences.view === 'tree' ? 'treeNoGroup' : 'articleNoGroup']: !noGroup,
          })
        }
      >
        按文件夹分组{!noGroup && <Icon name="check" />}
      </button>
    </div>
  );
  return (
    <nav
      ref={root}
      className="workspace-navigation-header workspace-navigation-single"
      aria-label="侧栏导航"
      hidden={props.hidden}
    >
      <button
        ref={trigger}
        type="button"
        className="workspace-root-row workspace-folder-trigger"
        aria-label="目录菜单"
        aria-haspopup="menu"
        aria-expanded={panel === 'directory'}
        aria-controls={panel && owner.current === 'folder' ? id : undefined}
        title={workspace ? displayPath(workspace.path) : '打开文件夹…'}
        disabled={disabled || props.restoring}
        onClick={(event) => open('directory', null, event.detail === 0)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          open('directory', { x: event.clientX, y: event.clientY });
        }}
        onKeyDown={(event) => {
          if (
            ['ArrowDown', 'ArrowUp', 'ContextMenu'].includes(event.key) ||
            (event.shiftKey && event.key === 'F10')
          ) {
            event.preventDefault();
            closeSubmenu();
            owner.current = 'folder';
            parentFocus.current = event.key === 'ArrowUp' ? 'last' : 'first';
            if (panel === 'directory') {
              const buttons = [
                ...(menu.current?.querySelectorAll<HTMLButtonElement>(
                  'button:not(:disabled):not([data-menu-skip-roving])',
                ) ?? []),
              ];
              (parentFocus.current === 'last' ? buttons.at(-1) : buttons[0])?.focus({
                preventScroll: true,
              });
            }
            setPoint(null);
            setPanel('directory');
          }
        }}
      >
        <WorkspaceGlyph name="folder" />
        <span className="workspace-root-name" title={workspace?.name}>
          {props.restoring ? (
            <SkeletonBar width={80} height={10} />
          ) : (
            (workspace?.name ?? '打开文件夹…')
          )}
        </span>
        <Icon name="chevronDown" />
      </button>
      {workspace && (
        <>
          {props.accessory}
          <button
            ref={add}
            type="button"
            className="sidebar-header-action workspace-create-trigger"
            aria-label="新建"
            title="在当前根目录新建文档或文件夹"
            aria-haspopup="menu"
            aria-expanded={panel === 'create'}
            aria-controls={panel === 'create' ? id : undefined}
            disabled={disabled || creationBusy}
            onClick={(event) => open('create', null, event.detail === 0)}
            onKeyDown={(event) => {
              if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
                event.preventDefault();
                closeSubmenu();
                owner.current = 'create';
                parentFocus.current = event.key === 'ArrowUp' ? 'last' : 'first';
                if (panel === 'create') {
                  const buttons = [
                    ...(menu.current?.querySelectorAll<HTMLButtonElement>(
                      'button:not(:disabled)',
                    ) ?? []),
                  ];
                  (parentFocus.current === 'last' ? buttons.at(-1) : buttons[0])?.focus({
                    preventScroll: true,
                  });
                }
                setPoint(null);
                setPanel('create');
              }
            }}
          >
            <Icon name="add" />
          </button>
          <button
            id={`${props.searchTargetId}-trigger`}
            type="button"
            className="sidebar-header-action"
            aria-label="全文搜索"
            aria-controls={props.searchPanelId}
            title="全文搜索"
            disabled={disabled}
            onClick={props.search}
          >
            <Icon name="search" />
          </button>
        </>
      )}
      {popup &&
        createPortal(
          <>
            {popup}
            {viewPopup}
          </>,
          root.current?.closest('.shell') ?? document.body,
        )}
    </nav>
  );
}
