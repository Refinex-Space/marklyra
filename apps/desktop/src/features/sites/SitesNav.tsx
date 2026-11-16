import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, useRef } from 'react';
import { Icon, type IconName } from '../../components/Icon.js';
import type { SiteGroup } from '../../services/sites.js';
import { type Scope, type SiteCatalog, scopeKey } from './model/catalog.js';
import { colorValue } from './model/colors.js';
import { NavSkeleton } from './SitesSkeleton.js';

export interface DropTarget {
  /** A group id; '' is 未分组. */
  id: string;
  /** A card lands in a group; a group lands before or after a sibling. */
  mode: 'into' | 'before' | 'after';
}

const dropClass = (drop: DropTarget | null | undefined, id: string) =>
  drop?.id !== id
    ? ''
    : drop.mode === 'into'
      ? ' drop'
      : drop.mode === 'before'
        ? ' drop-before'
        : ' drop-after';

const same = (a: Scope, b: Scope) => scopeKey(a) === scopeKey(b);

/** The group list in the window's sidebar: the views, then the group tree. */
export function SitesNav({
  catalog,
  scope,
  recentCount,
  collapsed,
  onScope,
  onToggle,
  onNewGroup,
  onGroupMenu,
  drop,
  dragging,
  onGroupDrag,
  onRename,
  onDelete,
}: {
  /** `null` while the sites are being read. */
  catalog: SiteCatalog | null;
  scope: Scope;
  recentCount: number;
  collapsed: ReadonlySet<string>;
  onScope(scope: Scope): void;
  onToggle(id: string): void;
  onNewGroup(): void;
  onGroupMenu(group: SiteGroup, x: number, y: number): void;
  drop?: DropTarget | null;
  /** The group being dragged. */
  dragging?: string | null;
  onGroupDrag?(group: SiteGroup, event: ReactPointerEvent<HTMLElement>): void;
  onRename?(group: SiteGroup): void;
  onDelete?(group: SiteGroup): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const item = (key: string, label: string, icon: IconName, count: number, target: Scope) => (
    <div className="site-nav-row" key={key}>
      <span className="site-nav-lead" />
      <button
        type="button"
        className="site-nav-item"
        data-nav
        aria-current={same(scope, target) ? 'page' : undefined}
        onClick={() => onScope(target)}
      >
        <span className="site-nav-icon">
          <Icon name={icon} />
        </span>
        <span className="site-nav-label">{label}</span>
        <span className="site-nav-count">{count}</span>
      </button>
    </div>
  );

  const groupRow = (group: SiteGroup, child: boolean) => {
    if (!catalog) return null;
    const kids = catalog.children(group.id);
    const open = !collapsed.has(group.id);
    const target: Scope = { kind: 'group', id: group.id };
    return (
      <div key={group.id}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: the context menu is a pointer shortcut; each row has a 更多 button. */}
        <div
          className={`site-nav-row${child ? ' child' : ''}${dropClass(drop, group.id)}${dragging === group.id ? ' dragging' : ''}`}
          data-drop={group.id}
          onPointerDown={(event) => {
            if (
              event.button === 0 &&
              !(event.target as HTMLElement).closest(
                'button.site-nav-more, button.site-nav-chevron',
              )
            )
              onGroupDrag?.(group, event);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            onGroupMenu(group, event.clientX, event.clientY);
          }}
        >
          {kids.length ? (
            <button
              type="button"
              className="site-nav-chevron"
              aria-label={`${open ? '折叠' : '展开'}「${group.name}」`}
              aria-expanded={open}
              onClick={() => onToggle(group.id)}
            >
              <Icon name="chevronRight" />
            </button>
          ) : (
            <span className="site-nav-lead" />
          )}
          <button
            type="button"
            className="site-nav-item"
            data-nav
            data-group={group.id}
            aria-current={same(scope, target) ? 'page' : undefined}
            onClick={() => onScope(target)}
            onKeyDown={(event) => {
              if (event.key === 'F10' && event.shiftKey) {
                event.preventDefault();
                const box = event.currentTarget.getBoundingClientRect();
                onGroupMenu(group, box.left + 24, box.bottom);
              }
            }}
          >
            <span className="site-nav-icon">
              <span className="site-dot" style={{ background: colorValue(group.color) }} />
            </span>
            <span className="site-nav-label">{group.name}</span>
            <span className="site-nav-count">{catalog.count(group.id)}</span>
          </button>
          <button
            type="button"
            className="site-nav-more"
            aria-label={`「${group.name}」的更多操作`}
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              onGroupMenu(group, box.left, box.bottom + 4);
            }}
          >
            <Icon name="more" />
          </button>
        </div>
        {open && kids.map((kid) => groupRow(kid, true))}
      </div>
    );
  };

  /** Up and down move between rows; right and left open and close a group. */
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[data-nav]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      items[
        Math.max(0, Math.min(items.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))
      ]?.focus();
    } else if (event.key === 'F2' || event.key === 'Delete' || event.key === 'Backspace') {
      const id = (document.activeElement as HTMLElement).dataset.group;
      const group = id ? catalog?.groupById.get(id) : undefined;
      if (!group) return;
      event.preventDefault();
      if (event.key === 'F2') onRename?.(group);
      else onDelete?.(group);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const id = (document.activeElement as HTMLElement).dataset.group;
      if (!id || !catalog?.children(id).length) return;
      const closed = collapsed.has(id);
      if ((event.key === 'ArrowRight') === closed) {
        event.preventDefault();
        onToggle(id);
      }
    }
  };

  return (
    <nav className="site-nav" aria-label="站点分组">
      <div className="site-nav-head">
        <h2>
          <Icon name="globe" />
          站点导航
        </h2>
        <button
          type="button"
          className="site-icon-btn"
          aria-label="新建分组"
          title="新建分组"
          disabled={!catalog}
          onClick={onNewGroup}
        >
          <Icon name="add" />
        </button>
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: arrow keys move between the buttons inside. */}
      <div className="site-nav-scroll" ref={root} onKeyDown={keyDown}>
        {catalog ? (
          <>
            {item('all', '全部站点', 'viewCards', catalog.items.length, { kind: 'all' })}
            {item('pinned', '常用', 'star', catalog.pinned.length, { kind: 'pinned' })}
            {item('recent', '最近打开', 'clock', recentCount, { kind: 'recent' })}
            <div className="site-nav-title">分组</div>
            {catalog.roots.map((group) => groupRow(group, false))}
            {catalog.ungrouped.length > 0 && (
              <div className={`site-nav-row${dropClass(drop, '')}`} data-drop="">
                <span className="site-nav-lead" />
                <button
                  type="button"
                  className="site-nav-item"
                  data-nav
                  aria-current={same(scope, { kind: 'none' }) ? 'page' : undefined}
                  onClick={() => onScope({ kind: 'none' })}
                >
                  <span className="site-nav-icon">
                    <span className="site-dot hollow" />
                  </span>
                  <span className="site-nav-label">未分组</span>
                  <span className="site-nav-count">{catalog.ungrouped.length}</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <NavSkeleton />
        )}
      </div>
    </nav>
  );
}
