import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/Icon.js';
import {
  onSitesFetching,
  openInBrowser,
  type Site,
  type SiteGroup,
  sites,
} from '../../services/sites.js';
import type { WorkspaceFolder } from '../../services/workspaces.js';
import { notify } from '../notices/notices.js';
import { GroupDialog, RemoveGroupDialog, SiteDialog } from './dialogs.js';
import { Menu, type MenuEntry } from './Layer.js';
import { type Scope, type SiteCatalog, scopeKey } from './model/catalog.js';
import { colorValue } from './model/colors.js';
import { shortcut } from './model/platform.js';
import { loadRecent, pushRecent } from './model/recent.js';
import { displayHost, siteAddress } from './model/url.js';
import { SearchBox, type SearchBoxHandle } from './SearchBox.js';
import { type SiteActions, SiteSections, type SiteSort, sectionsOf } from './SiteCards.js';
import { SiteMark } from './SiteMark.js';
import { type DropTarget, SitesNav } from './SitesNav.js';
import { CardsSkeleton } from './SitesSkeleton.js';
import type { SitesPreferences, SitesView } from './sites-preferences.js';
import { useSiteStore } from './useSiteStore.js';
import './sites.css';

/** Where each workspace's page was, so closing and reopening returns there. */
const remembered = new Map<string, { scope: Scope; collapsed: Set<string>; sort: SiteSort }>();
const SORTS: { id: SiteSort; label: string }[] = [
  { id: 'manual', label: '手动' },
  { id: 'name', label: '名称' },
  { id: 'opened', label: '最近打开' },
  { id: 'added', label: '添加时间' },
];
// Menu wording: 手动排序 / 按名称 / 按最近打开 / 按添加时间.
const sortLabel = (id: SiteSort) =>
  id === 'manual' ? '手动排序' : `按${SORTS.find((item) => item.id === id)?.label ?? ''}`;

type Dialog =
  | { kind: 'site'; site?: Site; group: string | null }
  | { kind: 'group'; group?: SiteGroup; parent?: SiteGroup }
  | { kind: 'remove'; group: SiteGroup };
interface Ghost {
  kind: 'site' | 'group';
  x: number;
  y: number;
  source: string;
  label: string;
  color: string;
  src: string | null;
}

type MenuState =
  | { kind: 'site'; site: Site; x: number; y: number }
  | { kind: 'move'; site: Site; x: number; y: number }
  | { kind: 'group'; group: SiteGroup; x: number; y: number }
  | { kind: 'sort'; x: number; y: number };

const unsupported = (error: unknown) => String(error).replace(/^\[[a-z-]+\]\s*/, '');

function neighbor(cards: HTMLElement[], from: DOMRect, key: string): HTMLElement | null {
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  let best: { el: HTMLElement; score: number } | null = null;
  for (const el of cards) {
    const rect = el.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - cx;
    const dy = rect.top + rect.height / 2 - cy;
    const forward =
      key === 'ArrowRight'
        ? dx > 8
        : key === 'ArrowLeft'
          ? dx < -8
          : key === 'ArrowDown'
            ? dy > 8
            : dy < -8;
    if (!forward) continue;
    const primary = key === 'ArrowLeft' || key === 'ArrowRight' ? Math.abs(dx) : Math.abs(dy);
    const secondary = key === 'ArrowLeft' || key === 'ArrowRight' ? Math.abs(dy) : Math.abs(dx);
    if (secondary > 96 && secondary > primary) continue;
    const score = primary + secondary * 2;
    if (!best || score < best.score) best = { el, score };
  }
  return best?.el ?? null;
}

export interface SitesWorkbenchProps {
  workspace: WorkspaceFolder;
  /** The window sidebar to place the group list in; `null` keeps it inside the page. */
  navHost: HTMLElement | null;
  preferences: SitesPreferences;
  onView(view: SitesView): void;
  onManageEngines?: (() => void) | undefined;
  onClose(): void;
}

/** The site navigation page: search on top, the chosen group's sites below, groups in the sidebar. */
export default function SitesWorkbench({
  workspace,
  navHost,
  preferences,
  onView,
  onManageEngines,
  onClose,
}: SitesWorkbenchProps) {
  const store = useSiteStore(workspace.id);
  const catalog: SiteCatalog | null = store.load.state === 'ready' ? store.load.catalog : null;
  const [scope, setScope] = useState<Scope>(
    () => remembered.get(workspace.id)?.scope ?? { kind: 'all' },
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(remembered.get(workspace.id)?.collapsed ?? []),
  );
  const [recent, setRecent] = useState<string[]>([]);
  const [sort, setSort] = useState<SiteSort>(() => remembered.get(workspace.id)?.sort ?? 'manual');
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [fetching, setFetching] = useState<ReadonlySet<string>>(new Set());
  /** Where a dragged card or group would land; `id` '' is 未分组. */
  const [drop, setDrop] = useState<DropTarget | null>(null);
  /** The label that follows the pointer while something is dragged. */
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<SearchBoxHandle>(null);

  useEffect(() => {
    remembered.set(workspace.id, { scope, collapsed, sort });
  }, [workspace.id, scope, collapsed, sort]);

  useEffect(() => {
    let alive = true;
    void loadRecent(workspace.id, workspace.path).then((ids) => {
      if (alive) setRecent(ids);
    });
    return () => {
      alive = false;
    };
  }, [workspace.id, workspace.path]);

  const iconKey =
    catalog?.items
      .map((site) => site.icon)
      .filter((icon): icon is string => !!icon)
      .join('\n') ?? '';
  // Icon files become object URLs once each; a URL is revoked when its icon leaves the list
  // or the page closes, so reopening the page or re-fetching one icon does not leak the rest.
  const iconUrls = useRef(new Map<string, string>());
  useEffect(() => {
    const wanted = new Set(iconKey.split('\n').filter(Boolean));
    const cache = iconUrls.current;
    for (const [path, url] of cache)
      if (!wanted.has(path)) {
        URL.revokeObjectURL(url);
        cache.delete(path);
      }
    const missing = [...wanted].filter((path) => !cache.has(path));
    let cancelled = false;
    void Promise.all(
      missing.map(async (path) => {
        try {
          const icon = await sites.icon(workspace.id, path.slice('icons/'.length));
          const bytes = Uint8Array.from(atob(icon.base64), (char) => char.charCodeAt(0));
          return [path, URL.createObjectURL(new Blob([bytes], { type: icon.mime }))] as const;
        } catch {
          return null;
        }
      }),
    ).then((pairs) => {
      for (const pair of pairs) {
        if (!pair) continue;
        if (cancelled || cache.has(pair[0])) URL.revokeObjectURL(pair[1]);
        else cache.set(pair[0], pair[1]);
      }
      if (!cancelled) setIcons(Object.fromEntries(cache));
    });
    return () => {
      cancelled = true;
    };
  }, [iconKey, workspace.id]);
  useEffect(
    () => () => {
      for (const url of iconUrls.current.values()) URL.revokeObjectURL(url);
      iconUrls.current.clear();
    },
    [],
  );

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void onSitesFetching((id, active) => {
      setFetching((current) => {
        const next = new Set(current);
        if (active) next.add(id);
        else next.delete(id);
        return next;
      });
    }).then(
      (unlisten) => {
        if (cancelled) unlisten();
        else stop = unlisten;
      },
      () => {},
    );
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  // Stale sites in the visible scope are refreshed once per visit. Every write produces a new
  // snapshot, so without this a failing site would be asked for again after each change.
  const refreshed = useRef(new Set<string>());
  useEffect(() => {
    if (!catalog || !preferences.fetchMetadata) return;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const ids = catalog.items
      .filter((site) => !refreshed.current.has(site.id))
      .filter((site) => {
        const here =
          scope.kind === 'group'
            ? site.group === scope.id
            : scope.kind === 'none'
              ? site.group === null
              : scope.kind === 'pinned'
                ? site.pinned
                : true;
        return here && (!site.fetched || Date.parse(site.fetched) < cutoff);
      })
      .slice(0, 20)
      .map((site) => site.id);
    for (const id of ids) refreshed.current.add(id);
    if (ids.length)
      void sites.refetch(workspace.id, ids, preferences.thirdPartyIcons, false).catch(() => {});
  }, [catalog, preferences.fetchMetadata, preferences.thirdPartyIcons, workspace.id, scope]);

  // A group removed elsewhere leaves the page showing everything rather than nothing.
  const effective: Scope =
    scope.kind === 'group' && catalog && !catalog.groupById.has(scope.id) ? { kind: 'all' } : scope;

  const openUrl = useCallback(async (url: string): Promise<string | null> => {
    try {
      await openInBrowser(url);
      setOpenError(null);
      return null;
    } catch (error) {
      return unsupported(error);
    }
  }, []);
  const openSite = useCallback(
    async (site: Site) => {
      const failure = await openUrl(site.url);
      if (failure !== null) {
        setOpenError(failure);
        return;
      }
      void sites.recordOpen(workspace.id, site.id).then(
        (entries) => setRecent(entries.map((entry) => entry.id).slice(0, 20)),
        () => setRecent(pushRecent(workspace.path, site.id)),
      );
    },
    [openUrl, workspace.id, workspace.path],
  );

  const togglePin = (site: Site) =>
    void store.mutate({
      kind: 'updateItem',
      id: site.id,
      revision: site.revision,
      set: { pinned: !site.pinned },
    });
  const removeSite = async (site: Site) => {
    const result = await store.mutate({
      kind: 'removeItems',
      ids: [site.id],
      revisions: [site.revision],
    });
    if (!result?.applied.length) return;
    notify(`已删除「${site.title}」`, 'info', {
      actions: [
        {
          label: '撤销',
          run: () =>
            void store.mutate({
              kind: 'addItem',
              url: site.url,
              group: site.group,
              title: site.title,
              description: site.description,
              pinned: site.pinned,
              manual: site.manual,
            }),
        },
      ],
    });
  };
  const copyLink = (site: Site) =>
    void navigator.clipboard.writeText(site.url).then(
      () => notify('已复制链接', 'success'),
      () => notify('无法访问剪贴板', 'error'),
    );
  const moveSite = (site: Site, group: string | null) =>
    void store.mutate({
      kind: 'moveItems',
      ids: [site.id],
      revisions: [site.revision],
      group,
    });
  const shiftGroup = (group: SiteGroup, step: -1 | 1) => {
    if (!catalog) return;
    const siblings = (group.parent ? catalog.children(group.parent) : catalog.roots).map(
      (g) => g.id,
    );
    const at = siblings.indexOf(group.id);
    const to = at + step;
    if (at < 0 || to < 0 || to >= siblings.length) return;
    const moved = siblings[at];
    const other = siblings[to];
    if (!moved || !other) return;
    siblings[at] = other;
    siblings[to] = moved;
    void store.mutate({ kind: 'reorderGroups', ids: siblings, parent: group.parent });
  };
  const seed = async () => {
    for (const [name, color] of [
      ['开发', 'blue'],
      ['设计', 'pink'],
      ['阅读', 'amber'],
    ] as const)
      if (!(await store.mutate({ kind: 'addGroup', name, color }))) return;
  };

  const dragPointer = (
    event: ReactPointerEvent,
    onMove: (x: number, y: number) => void,
    onEnd: (moved: boolean, x: number, y: number) => void,
  ) => {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
      if (!moved) document.documentElement.dataset.siteDragging = '';
      moved = true;
      onMove(ev.clientX, ev.clientY);
    };
    const finish = (ev: PointerEvent, cancelled: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', onEscape, true);
      delete document.documentElement.dataset.siteDragging;
      if (moved) {
        // The press that ended a drag is not also a click on the card or the group.
        const stop = (click: Event) => {
          click.preventDefault();
          click.stopPropagation();
        };
        window.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', stop, true), 0);
      }
      onEnd(moved && !cancelled, ev.clientX, ev.clientY);
    };
    const up = (ev: PointerEvent) => finish(ev, false);
    const cancel = (ev: PointerEvent) => finish(ev, true);
    const onEscape = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !moved) return;
      ev.preventDefault();
      ev.stopPropagation();
      finish(new PointerEvent('pointercancel', { clientX: startX, clientY: startY }), true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', onEscape, true);
  };
  /** The group row under the pointer, with which half of it the pointer is in. */
  const rowAt = (x: number, y: number) => {
    const node = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { id: node.dataset.drop ?? '', upper: y < box.top + box.height / 2 };
  };
  const colorOf = (site: Site) =>
    (site.group && catalog?.groupById.get(site.group)?.color) || 'gray';
  const actions: SiteActions = {
    onOpen: (site) => void openSite(site),
    onMenu: (site, x, y) => setMenu({ kind: 'site', site, x, y }),
    onPin: togglePin,
    onEdit: (site) => setDialog({ kind: 'site', site, group: site.group }),
    iconOf: (site) => (site.icon ? (icons[site.icon] ?? null) : null),
    fetching: (site) => fetching.has(site.id),
    dragging: (site) => ghost?.kind === 'site' && ghost.source === site.id,
    onDrag: (site, event) => {
      if ((event.target as HTMLElement).closest('button.site-icon-btn')) return;
      dragPointer(
        event,
        (x, y) => {
          const row = rowAt(x, y);
          setDrop(row ? { id: row.id, mode: 'into' } : null);
          setGhost({
            kind: 'site',
            x,
            y,
            source: site.id,
            label: site.title,
            color: colorOf(site),
            src: site.icon ? (icons[site.icon] ?? null) : null,
          });
        },
        (moved, x, y) => {
          const row = moved ? rowAt(x, y) : null;
          setDrop(null);
          setGhost(null);
          if (!row) return;
          const group = row.id || null;
          if (group !== site.group) moveSite(site, group);
        },
      );
    },
  };

  // Keys that belong to the page when nothing else has focus: `/` searches, Escape leaves.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return;
    if (dialog || menu || document.querySelector('.site-layer')) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.closest('input, textarea, select, [contenteditable="true"]') ||
        (target !== document.body && !root.current?.contains(target) && !navHost?.contains(target)))
    )
      return;
    const card = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-site]') : null;
    if (card && root.current?.contains(card) && catalog) {
      const site = catalog.items.find((item) => item.id === card.dataset.site);
      if (site && (event.key === 'e' || event.key === 'E')) {
        event.preventDefault();
        setDialog({ kind: 'site', site, group: site.group });
        return;
      }
      if (site && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        void removeSite(site);
        return;
      }
      if (event.key.startsWith('Arrow')) {
        const cards = [...root.current.querySelectorAll<HTMLElement>('[data-site]')];
        const next = neighbor(cards, card.getBoundingClientRect(), event.key);
        if (next) {
          event.preventDefault();
          (next.querySelector('button') ?? next).focus();
        }
        return;
      }
    }
    if (event.key === '/') {
      event.preventDefault();
      search.current?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => keys.current(event);
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    search.current?.focus();
  }, []);
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (dialog || menu || document.querySelector('.site-layer')) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      const url = siteAddress(event.clipboardData?.getData('text/plain')?.trim() ?? '');
      if (!url) return;
      event.preventDefault();
      const group = effective.kind === 'group' ? effective.id : null;
      void store
        .mutate({ kind: 'addItem', url, group, title: displayHost(url) })
        .then(async (result) => {
          const id = result?.created[0];
          if (!id) return;
          if (preferences.fetchMetadata)
            void sites.enrich(workspace.id, id, preferences.thirdPartyIcons).catch(() => {});
          const snapshot = await sites.snapshot(workspace.id);
          const saved = snapshot.items.find((item) => item.id === id);
          notify(`已添加 ${displayHost(url)}`, 'info', {
            actions: saved
              ? [
                  {
                    label: '撤销',
                    run: () =>
                      void store.mutate({
                        kind: 'removeItems',
                        ids: [saved.id],
                        revisions: [saved.revision],
                      }),
                  },
                ]
              : [],
          });
        });
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [
    dialog,
    effective,
    menu,
    preferences.fetchMetadata,
    preferences.thirdPartyIcons,
    store,
    workspace.id,
  ]);

  const siteMenu = (state: Extract<MenuState, { kind: 'site' }>): MenuEntry[] => [
    { id: 'open', label: '在浏览器中打开', icon: 'arrowRight' },
    { id: 'copy', label: '复制链接', icon: 'copy' },
    { id: 'edit', label: '编辑…', icon: 'rename' },
    { id: 'pin', label: state.site.pinned ? '取消常用' : '设为常用', icon: 'star' },
    { separator: true },
    { id: 'move', label: '移动到…', icon: 'open' },
    { id: 'refetch', label: '重新获取信息', icon: 'refresh' },
    { separator: true },
    { id: 'delete', label: '删除', icon: 'delete', danger: true },
  ];
  const moveMenu = (state: Extract<MenuState, { kind: 'move' }>): MenuEntry[] => [
    ...(catalog?.roots.flatMap((root_) => [
      {
        id: `g:${root_.id}`,
        label: root_.name,
        dot: colorValue(root_.color),
        checked: state.site.group === root_.id,
      },
      ...catalog.children(root_.id).map((child) => ({
        id: `g:${child.id}`,
        label: child.name,
        dot: colorValue(child.color),
        indent: true,
        checked: state.site.group === child.id,
      })),
    ]) ?? []),
    { separator: true },
    { id: 'g:', label: '未分组', checked: state.site.group === null },
  ];
  const groupMenu = (state: Extract<MenuState, { kind: 'group' }>): MenuEntry[] => {
    const siblings = catalog
      ? state.group.parent
        ? catalog.children(state.group.parent)
        : catalog.roots
      : [];
    const at = siblings.findIndex((g) => g.id === state.group.id);
    return [
      { id: 'add', label: '在此分组添加站点', icon: 'add' },
      ...(state.group.parent ? [] : [{ id: 'sub', label: '新建子分组', icon: 'open' as const }]),
      { id: 'edit', label: '重命名或更改颜色…', icon: 'rename' },
      ...(at > 0 ? [{ id: 'up', label: '上移', icon: 'chevronUp' as const }] : []),
      ...(at >= 0 && at < siblings.length - 1
        ? [{ id: 'down', label: '下移', icon: 'chevronDown' as const }]
        : []),
      { separator: true },
      { id: 'delete', label: '删除分组…', icon: 'delete', danger: true },
    ];
  };

  const pickMenu = (id: string) => {
    const state = menu;
    setMenu(null);
    if (!state) return;
    if (state.kind === 'site') {
      const { site } = state;
      if (id === 'open') void openSite(site);
      else if (id === 'copy') copyLink(site);
      else if (id === 'edit') setDialog({ kind: 'site', site, group: site.group });
      else if (id === 'pin') togglePin(site);
      else if (id === 'move') setMenu({ kind: 'move', site, x: state.x, y: state.y });
      else if (id === 'refetch')
        void sites.refetch(workspace.id, [site.id], preferences.thirdPartyIcons, true);
      else if (id === 'delete') void removeSite(site);
    } else if (state.kind === 'sort') {
      const next = SORTS.find((item) => item.id === id);
      if (next) setSort(next.id);
    } else if (state.kind === 'move') {
      if (id.startsWith('g:')) moveSite(state.site, id.slice(2) || null);
    } else {
      const { group } = state;
      if (id === 'add') setDialog({ kind: 'site', group: group.id });
      else if (id === 'sub') setDialog({ kind: 'group', parent: group });
      else if (id === 'edit') setDialog({ kind: 'group', group });
      else if (id === 'up') shiftGroup(group, -1);
      else if (id === 'down') shiftGroup(group, 1);
      else if (id === 'delete') setDialog({ kind: 'remove', group });
    }
  };

  const nav = (
    <SitesNav
      catalog={catalog}
      scope={effective}
      recentCount={catalog ? catalog.of({ kind: 'recent' }, recent).length : 0}
      collapsed={collapsed}
      onScope={(next) => {
        setScope(next);
        root.current?.querySelector('.site-scroll')?.scrollTo({ top: 0 });
      }}
      onToggle={(id) =>
        setCollapsed((previous) => {
          const next = new Set(previous);
          if (!next.delete(id)) next.add(id);
          return next;
        })
      }
      onNewGroup={() => setDialog({ kind: 'group' })}
      onGroupMenu={(group, x, y) => setMenu({ kind: 'group', group, x, y })}
      drop={drop}
      dragging={ghost?.kind === 'group' ? ghost.source : null}
      onRename={(group) => setDialog({ kind: 'group', group })}
      onDelete={(group) => setDialog({ kind: 'remove', group })}
      onGroupDrag={(group, event) => {
        if (!catalog) return;
        const siblings = (group.parent ? catalog.children(group.parent) : catalog.roots).map(
          (item) => item.id,
        );
        // Only siblings take a group: one level of nesting, reordered in place.
        const landing = (x: number, y: number): DropTarget | null => {
          const row = rowAt(x, y);
          if (!row || row.id === group.id || !siblings.includes(row.id)) return null;
          return { id: row.id, mode: row.upper ? 'before' : 'after' };
        };
        dragPointer(
          event,
          (x, y) => {
            setDrop(landing(x, y));
            setGhost({
              kind: 'group',
              x,
              y,
              source: group.id,
              label: group.name,
              color: group.color,
              src: null,
            });
          },
          (moved, x, y) => {
            const target = moved ? landing(x, y) : null;
            setDrop(null);
            setGhost(null);
            if (!target) return;
            const next = siblings.filter((id) => id !== group.id);
            next.splice(next.indexOf(target.id) + (target.mode === 'after' ? 1 : 0), 0, group.id);
            if (next.join() !== siblings.join())
              void store.mutate({ kind: 'reorderGroups', ids: next, parent: group.parent });
          },
        );
      }}
    />
  );

  const defaultGroup = effective.kind === 'group' ? effective.id : null;
  const header = useMemo(() => {
    if (!catalog) return null;
    switch (effective.kind) {
      case 'all':
        return { name: '全部站点', color: null, count: catalog.items.length };
      case 'pinned':
        return { name: '常用', color: null, count: catalog.pinned.length };
      case 'recent':
        return { name: '最近打开', color: null, count: catalog.of(effective, recent).length };
      case 'none':
        return { name: '未分组', color: 'gray', count: catalog.ungrouped.length };
      case 'group': {
        const group = catalog.groupById.get(effective.id);
        return {
          name: group ? catalog.pathOf(group.id) : '',
          color: group?.color ?? null,
          count: catalog.count(effective.id),
        };
      }
    }
  }, [catalog, effective, recent]);

  const pinned = catalog && preferences.showPinned ? catalog.pinned.slice(0, 8) : [];
  const empty = catalog && catalog.items.length === 0 && catalog.snapshot.groups.length === 0;
  const sections = catalog ? sectionsOf(catalog, effective, recent, sort) : [];
  const problem = dialog ? null : store.problem;
  // The dialog edits the site as it is now, so a fetch that lands while it is open does not
  // turn the save into a revision conflict.
  const editing =
    dialog?.kind === 'site' && dialog.site
      ? (catalog?.itemById.get(dialog.site.id) ?? undefined)
      : undefined;
  useEffect(() => {
    if (dialog?.kind === 'site' && dialog.site && catalog && !catalog.itemById.has(dialog.site.id))
      setDialog(null);
  }, [dialog, catalog]);

  return (
    <div
      className="site-workbench knowledge-surface"
      ref={root}
      tabIndex={-1}
      data-scope={scopeKey(effective)}
    >
      {navHost ? (
        createPortal(<div className="site-sidebar">{nav}</div>, navHost)
      ) : (
        <div className="site-sidebar inline">{nav}</div>
      )}
      <main className="site-pane" aria-label="站点导航">
        <div className="site-scroll">
          <section className="site-hero">
            <SearchBox
              handle={search}
              catalog={catalog}
              engines={preferences.engines}
              defaultEngine={preferences.engine}
              workspaceId={workspace.id}
              error={openError}
              onOpenSite={(site) => void openSite(site)}
              onOpenUrl={async (url) => openUrl(url)}
              onManageEngines={onManageEngines}
            />
            {pinned.length > 0 && (
              <ul className="site-pins" aria-label="常用站点">
                {pinned.map((site) => (
                  <li key={site.id}>
                    <button
                      type="button"
                      className="site-pin"
                      title={site.url}
                      onClick={() => void openSite(site)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setMenu({ kind: 'site', site, x: event.clientX, y: event.clientY });
                      }}
                    >
                      <SiteMark
                        title={site.title}
                        color={(site.group && catalog?.groupById.get(site.group)?.color) || 'gray'}
                        size="lg"
                        src={site.icon ? (icons[site.icon] ?? null) : null}
                        fetching={fetching.has(site.id)}
                      />
                      <span>{site.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="site-content" aria-live="polite">
            {store.load.state === 'error' ? (
              <div className="site-empty">
                <h3>无法读取站点</h3>
                <p>{store.load.error}</p>
                <button type="button" className="site-btn" onClick={() => void store.refresh()}>
                  重试
                </button>
              </div>
            ) : !catalog ? (
              <CardsSkeleton />
            ) : empty ? (
              <div className="site-empty welcome">
                <div className="site-empty-actions">
                  <button
                    type="button"
                    className="site-btn primary"
                    onClick={() => setDialog({ kind: 'site', group: null })}
                  >
                    <Icon name="add" />
                    添加第一个站点
                  </button>
                  <button
                    type="button"
                    className="site-btn"
                    title="创建「开发」「设计」「阅读」三个空分组"
                    onClick={() => void seed()}
                  >
                    创建示例分组
                  </button>
                </div>
                <p className="site-empty-tip">
                  也可以在这个页面直接粘贴网址（<kbd>{shortcut('V')}</kbd>）快速添加
                </p>
              </div>
            ) : (
              <>
                {catalog.snapshot.invalid.length > 0 && (
                  <details className="site-banner" role="status">
                    <summary>
                      有 {catalog.snapshot.invalid.length} 个文件无法读取，已保持原样
                    </summary>
                    <ul>
                      {catalog.snapshot.invalid.map((file) => (
                        <li key={file.path}>
                          <code>{file.path}</code>：{file.error}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {problem && (
                  <p className="site-banner error" role="alert">
                    {problem}
                  </p>
                )}
                <header className="site-head">
                  <h1>
                    {header?.color && (
                      <span className="site-dot" style={{ background: colorValue(header.color) }} />
                    )}
                    {header?.name}
                    <span className="site-head-count">{header?.count} 个站点</span>
                  </h1>
                  <span className="site-spacer" />
                  <button
                    type="button"
                    className="site-btn quiet"
                    aria-haspopup="menu"
                    aria-expanded={menu?.kind === 'sort'}
                    aria-label={`排序方式：${SORTS.find((item) => item.id === sort)?.label ?? '手动'}`}
                    onClick={(event) => {
                      const box = event.currentTarget.getBoundingClientRect();
                      setMenu({ kind: 'sort', x: box.right - 180, y: box.bottom + 6 });
                    }}
                  >
                    <Icon name="viewList" />
                    {sortLabel(sort)}
                    <Icon name="chevronDown" />
                  </button>
                  {/* biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons, not form controls. */}
                  <div className="site-seg" role="group" aria-label="显示方式">
                    {(['cards', 'list'] as const).map((view) => (
                      <button
                        key={view}
                        type="button"
                        aria-pressed={preferences.view === view}
                        onClick={() => onView(view)}
                      >
                        <Icon name={view === 'cards' ? 'viewCards' : 'viewList'} />
                        {view === 'cards' ? '卡片' : '列表'}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="site-btn primary"
                    onClick={() => setDialog({ kind: 'site', group: defaultGroup })}
                  >
                    <Icon name="add" />
                    添加站点
                  </button>
                </header>
                {sections.length ? (
                  <SiteSections
                    catalog={catalog}
                    sections={sections}
                    view={preferences.view}
                    actions={actions}
                  />
                ) : (
                  <div className="site-empty compact">
                    <h3>{emptyTitle(effective)}</h3>
                    {effective.kind === 'group' || effective.kind === 'none' ? (
                      <button
                        type="button"
                        className="site-btn primary"
                        onClick={() => setDialog({ kind: 'site', group: defaultGroup })}
                      >
                        <Icon name="add" />
                        添加站点
                      </button>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>
      {ghost &&
        createPortal(
          <div className="site-layer site-layer-menu" aria-hidden="true">
            <div className="site-drag-ghost" style={{ left: ghost.x + 14, top: ghost.y + 10 }}>
              {ghost.kind === 'group' ? (
                <span className="site-dot" style={{ background: colorValue(ghost.color) }} />
              ) : (
                <SiteMark title={ghost.label} color={ghost.color} size="sm" src={ghost.src} />
              )}
              <span>{ghost.label}</span>
            </div>
          </div>,
          document.body,
        )}
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          label={
            menu.kind === 'group'
              ? '分组操作'
              : menu.kind === 'move'
                ? '移动到'
                : menu.kind === 'sort'
                  ? '排序方式'
                  : '站点操作'
          }
          entries={
            menu.kind === 'site'
              ? siteMenu(menu)
              : menu.kind === 'move'
                ? moveMenu(menu)
                : menu.kind === 'sort'
                  ? SORTS.map((item) => ({
                      id: item.id,
                      label: sortLabel(item.id),
                      checked: sort === item.id,
                    }))
                  : groupMenu(menu)
          }
          onPick={pickMenu}
          onClose={() => setMenu(null)}
        />
      )}
      {dialog?.kind === 'site' && catalog && (
        <SiteDialog
          catalog={catalog}
          {...(editing ? { site: editing } : {})}
          iconSrc={editing?.icon ? (icons[editing.icon] ?? null) : null}
          fetching={!!editing && fetching.has(editing.id)}
          defaultGroup={dialog.group}
          mutate={store.mutate}
          problem={store.problem}
          workspaceId={workspace.id}
          fetchMetadata={preferences.fetchMetadata}
          thirdParty={preferences.thirdPartyIcons}
          onReveal={(existing) => {
            setDialog(null);
            setScope(existing.group ? { kind: 'group', id: existing.group } : { kind: 'none' });
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'group' && catalog && (
        <GroupDialog
          catalog={catalog}
          {...(dialog.group ? { group: dialog.group } : {})}
          {...(dialog.parent ? { parent: dialog.parent } : {})}
          mutate={store.mutate}
          problem={store.problem}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'remove' && catalog && (
        <RemoveGroupDialog
          group={dialog.group}
          count={catalog.count(dialog.group.id)}
          hasChildren={catalog.children(dialog.group.id).length > 0}
          onClose={() => setDialog(null)}
          onChoose={(items) =>
            void store.mutate({
              kind: 'removeGroup',
              id: dialog.group.id,
              revision: dialog.group.revision,
              items,
            })
          }
        />
      )}
    </div>
  );
}

const emptyTitle = (scope: Scope) =>
  scope.kind === 'pinned'
    ? '还没有常用站点'
    : scope.kind === 'recent'
      ? '还没有打开过站点'
      : '这个分组还没有站点';
