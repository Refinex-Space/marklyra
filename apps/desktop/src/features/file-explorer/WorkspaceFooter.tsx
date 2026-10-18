import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ShellGlyph, type ShellGlyphName } from '../../components/ShellGlyph.js';
import type { DirectoryHistoryEntry } from '../../services/directory-history.js';
import type { WorkspaceFolder } from '../../services/workspaces.js';
import { DirectoryHistoryMenu } from './DirectoryHistoryMenu.js';
import type { FileSidebarPreferences, FileSortType } from './file-preferences.js';

interface Props {
  name: string | undefined;
  workspace?: WorkspaceFolder | null;
  platform?: 'macos' | 'windows' | 'browser';
  navigateDirectory?:
    | ((entry: DirectoryHistoryEntry, revision: number, modifier: boolean) => void)
    | undefined;
  search?: (() => void) | undefined;
  reveal?: (() => void) | undefined;
  path: string | undefined;
  disabled: boolean;
  canChoose: boolean;
  choose: () => void;
  refresh: () => void;
  close: () => void;
  newDocument: (() => void) | undefined;
  creationBusy?: boolean;
  preferences: FileSidebarPreferences;
  changePreferences: (value: FileSidebarPreferences) => void;
  contextPoint?: { x: number; y: number; version: number } | undefined;
}

const sortGlyphs = [
  ['naturalAscending', 'naturalDescending'],
  ['nameAscending', 'nameDescending'],
  ['modifiedAscending', 'modifiedDescending'],
  ['createdAscending', 'createdDescending'],
] as const satisfies readonly (readonly [ShellGlyphName, ShellGlyphName])[];

function SortGlyph({ mode, descending }: { mode: number; descending: boolean }) {
  const variants = sortGlyphs[mode] ?? sortGlyphs[0];
  return <ShellGlyph name={variants[descending ? 1 : 0]} className="workspace-sort-glyph" />;
}

export function WorkspaceFooter({
  name,
  workspace = null,
  platform = 'browser',
  navigateDirectory,
  search,
  reveal,
  path,
  disabled,
  canChoose,
  choose,
  refresh,
  close,
  newDocument,
  creationBusy = false,
  preferences,
  changePreferences,
  contextPoint,
}: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [context, setContext] = useState(false);
  const consumedContext = useRef<Props['contextPoint']>(undefined);
  const directions = useRef<Record<number, boolean>>({ 0: false, 1: false, 2: false, 3: false });
  const sort = preferences.view === 'tree' ? preferences.treeSort : preferences.articleSort;
  const noGroup =
    preferences.view === 'tree' ? preferences.treeNoGroup : preferences.articleNoGroup;
  const sortMode = sort === -10 ? 0 : Math.abs(sort);
  directions.current[sortMode] = sort < 0;
  useEffect(() => {
    if (!contextPoint || consumedContext.current === contextPoint) return;
    consumedContext.current = contextPoint;
    if (!disabled) {
      setContext(true);
      setOpen(true);
    }
  }, [contextPoint, disabled]);
  const setView = (view: 'tree' | 'articles') => changePreferences({ ...preferences, view });
  const setSort = (mode: number) => {
    const descending = mode === sortMode ? sort >= 0 : directions.current[mode] === true;
    directions.current[mode] = descending;
    const value = (descending ? (mode === 0 ? -10 : -mode) : mode) as FileSortType;
    changePreferences({
      ...preferences,
      [preferences.view === 'tree' ? 'treeSort' : 'articleSort']: value,
    });
  };
  const toggleGrouping = () =>
    changePreferences({
      ...preferences,
      [preferences.view === 'tree' ? 'treeNoGroup' : 'articleNoGroup']: !noGroup,
    });
  useLayoutEffect(() => {
    if (!open) return;
    if (context)
      menu.current
        ?.querySelector<HTMLButtonElement>('button:not(:disabled):not([data-menu-skip-roving])')
        ?.focus();
    else menu.current?.focus({ preventScroll: true });
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const dismissWithEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    // A real editor iframe has its own event document. Returning to it blurs
    // this window without delivering a parent pointerdown/focusin event.
    const dismissOnWindowBlur = () => setOpen(false);
    document.addEventListener('keydown', dismissWithEscape, true);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    window.addEventListener('blur', dismissOnWindowBlur);
    return () => {
      document.removeEventListener('keydown', dismissWithEscape, true);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
      window.removeEventListener('blur', dismissOnWindowBlur);
    };
  }, [open, context]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const run = (action: () => void) => {
    setOpen(false);
    trigger.current?.focus();
    action();
  };
  const sortControls = (
    <fieldset className="workspace-sort-controls" aria-label="文件排序">
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={!noGroup}
        aria-label="按文件夹分组"
        title="按文件夹分组"
        onClick={(event) => {
          event.currentTarget.focus();
          toggleGrouping();
        }}
      >
        <ShellGlyph name="group" />
      </button>
      {(
        [
          { mode: 0, label: '自然排序' },
          { mode: 1, label: '名称' },
          { mode: 2, label: '修改时间' },
          { mode: 3, label: '创建时间' },
        ] as const
      ).map((item) => (
        <button
          key={item.mode}
          type="button"
          role="menuitemradio"
          aria-checked={sortMode === item.mode}
          aria-label={item.label}
          title={`${item.label}${sortMode === item.mode ? (sort < 0 ? '（降序）' : '（升序）') : ''}`}
          onClick={(event) => {
            event.currentTarget.focus();
            setSort(item.mode);
          }}
        >
          <SortGlyph
            mode={item.mode}
            descending={sortMode === item.mode ? sort < 0 : directions.current[item.mode] === true}
          />
        </button>
      ))}
    </fieldset>
  );
  return (
    <nav
      className="workspace-footer"
      aria-label="目录位置"
      data-menu-open={open || undefined}
      ref={root}
    >
      {name && newDocument && (
        <button
          type="button"
          className="workspace-new-document"
          aria-label="新建文件"
          title="新建文件"
          disabled={disabled || creationBusy}
          onClick={newDocument}
        >
          <ShellGlyph name="add" />
        </button>
      )}
      <button
        type="button"
        className="workspace-location-menu"
        aria-label="目录菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={path ?? '打开文件夹…'}
        disabled={disabled}
        ref={trigger}
        onClick={() => {
          setContext(false);
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{name ?? '打开文件夹…'}</span>
        <span aria-hidden="true" className="workspace-menu-dots">
          <ShellGlyph name="dots" />
        </span>
      </button>
      {name && (
        <button
          type="button"
          className="workspace-switch-file-view"
          aria-label={preferences.view === 'tree' ? '切换到文档列表' : '切换到文件树'}
          title={preferences.view === 'tree' ? '文档列表' : '文件树'}
          disabled={disabled}
          onClick={() => setView(preferences.view === 'tree' ? 'articles' : 'tree')}
        >
          <ShellGlyph name={preferences.view === 'tree' ? 'articles' : 'tree'} />
        </button>
      )}
      {open && (
        <div
          className={`workspace-location-popup sidebar-popup-menu${context ? '' : ' directory-footer-popup'}`}
          tabIndex={-1}
          role="menu"
          aria-label="目录操作"
          ref={menu}
          style={
            context && contextPoint
              ? {
                  position: 'fixed',
                  left: Math.min(contextPoint.x, window.innerWidth - 240),
                  top: Math.min(contextPoint.y, window.innerHeight - 290),
                  bottom: 'auto',
                  right: 'auto',
                  width: 230,
                }
              : undefined
          }
          id={menuId}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !event.metaKey && !event.ctrlKey) {
              event.preventDefault();
              setOpen(false);
              trigger.current?.focus();
              return;
            }
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                'button:not(:disabled):not([data-menu-skip-roving])',
              ),
            );
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === 'Home'
                ? buttons[0]
                : event.key === 'End'
                  ? buttons.at(-1)
                  : ['ArrowDown', 'ArrowRight'].includes(event.key)
                    ? buttons[(current + 1) % buttons.length]
                    : ['ArrowUp', 'ArrowLeft'].includes(event.key)
                      ? buttons[(current + buttons.length - 1) % buttons.length]
                      : null;
            if (next) {
              event.preventDefault();
              next.focus();
            }
          }}
        >
          {!context ? (
            <DirectoryHistoryMenu
              workspace={workspace}
              enabled={canChoose}
              disabled={disabled}
              choose={choose}
              newDocument={newDocument}
              newDocumentDisabled={creationBusy}
              search={search}
              reveal={reveal}
              refresh={refresh}
              dismiss={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
              sortControls={sortControls}
              platform={platform}
              navigate={(entry, revision, modifier) =>
                navigateDirectory?.(entry, revision, modifier)
              }
            />
          ) : (
            <>
              {name && (
                <>
                  {sortControls}
                  <hr />
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={preferences.view === 'articles'}
                    onClick={() => run(() => setView('articles'))}
                  >
                    <span className="workspace-menu-check" aria-hidden="true">
                      {preferences.view === 'articles' ? '✓' : ''}
                    </span>
                    文档列表
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={preferences.view === 'tree'}
                    onClick={() => run(() => setView('tree'))}
                  >
                    <span className="workspace-menu-check" aria-hidden="true">
                      {preferences.view === 'tree' ? '✓' : ''}
                    </span>
                    文件树
                  </button>
                  <hr />
                </>
              )}
              {name && newDocument && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={creationBusy}
                  onClick={() => run(newDocument)}
                >
                  新建文件
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                disabled={!canChoose}
                onClick={() => run(choose)}
              >
                打开文件夹…
              </button>
              {name && (
                <>
                  <button type="button" role="menuitem" onClick={() => run(refresh)}>
                    刷新目录
                  </button>
                  <hr />
                  <button type="button" role="menuitem" onClick={() => run(close)}>
                    关闭目录
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </nav>
  );
}
