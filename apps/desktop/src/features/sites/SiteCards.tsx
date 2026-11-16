import type { PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../../components/Icon.js';
import type { Site, SiteGroup } from '../../services/sites.js';
import type { Scope, SiteCatalog } from './model/catalog.js';
import { colorValue } from './model/colors.js';
import { displayHost } from './model/url.js';
import { SiteMark } from './SiteMark.js';
import type { SitesView } from './sites-preferences.js';

export type SiteSort = 'manual' | 'name' | 'opened' | 'added';

export interface SiteActions {
  onOpen(site: Site): void;
  onMenu(site: Site, x: number, y: number): void;
  onPin(site: Site): void;
  onEdit(site: Site): void;
  iconOf?(site: Site): string | null;
  fetching?(site: Site): boolean;
  onDrag?(site: Site, event: ReactPointerEvent<HTMLElement>): void;
  /** The site is being dragged. */
  dragging?(site: Site): boolean;
}

interface Section {
  key: string;
  /** Shown above the sites; `null` when the page header already says it. */
  title: string | null;
  color: string | null;
  items: Site[];
}

/** The sections a scope shows, empty ones left out. */
export function sectionsOf(
  catalog: SiteCatalog,
  scope: Scope,
  recent: readonly string[],
  sort: SiteSort = 'manual',
): Section[] {
  const section = (group: SiteGroup, title: string | null, items: Site[]): Section => ({
    key: group.id,
    title,
    color: group.color,
    items,
  });
  let sections: Section[];
  if (scope.kind === 'all') {
    sections = [];
    for (const root of catalog.roots) {
      for (const { group, items } of catalog.tree(root.id))
        sections.push(section(group, catalog.pathOf(group.id), items));
    }
    sections.push({ key: 'none', title: '未分组', color: 'gray', items: catalog.ungrouped });
  } else if (scope.kind === 'group') {
    const tree = catalog.tree(scope.id);
    sections = tree.map(({ group, items }, index) =>
      section(group, index === 0 ? null : group.name, items),
    );
  } else {
    sections = [{ key: scope.kind, title: null, color: null, items: catalog.of(scope, recent) }];
  }
  return sections
    .map((section) => ({ ...section, items: sortSites(section.items, sort, recent) }))
    .filter((s) => s.items.length > 0);
}

export function sortSites(
  items: readonly Site[],
  sort: SiteSort,
  recent: readonly string[],
): Site[] {
  if (sort === 'manual') return [...items];
  const copy = [...items];
  const byName = (a: Site, b: Site) => a.title.localeCompare(b.title, 'zh');
  if (sort === 'name') return copy.sort(byName);
  if (sort === 'added') {
    return copy.sort((a, b) => b.created.localeCompare(a.created) || byName(a, b));
  }
  const rank = new Map(recent.map((id, index) => [id, index]));
  return copy.sort(
    (a, b) => (rank.get(a.id) ?? 1_000_000) - (rank.get(b.id) ?? 1_000_000) || byName(a, b),
  );
}

function Card({ site, color, actions }: { site: Site; color: string; actions: SiteActions }) {
  return (
    <article
      className={`site-card${actions.dragging?.(site) ? ' dragging' : ''}`}
      data-site={site.id}
      onPointerDown={(event) => actions.onDrag?.(site, event)}
      onContextMenu={(event) => {
        event.preventDefault();
        actions.onMenu(site, event.clientX, event.clientY);
      }}
    >
      <button
        type="button"
        className="site-card-main"
        title={site.url}
        aria-label={`${site.title}，${displayHost(site.url)}`}
        onClick={() => actions.onOpen(site)}
        onKeyDown={(event) => {
          if (event.key === 'F10' && event.shiftKey) {
            event.preventDefault();
            const box = event.currentTarget.getBoundingClientRect();
            actions.onMenu(site, box.left + 24, box.bottom - 24);
          }
        }}
      >
        <span className="site-card-top">
          <SiteMark
            title={site.title}
            color={color}
            size="lg"
            src={actions.iconOf?.(site) ?? null}
            fetching={actions.fetching?.(site) ?? false}
          />
          <span className="site-card-titles">
            <span className="site-card-title">
              {site.title}
              {site.pinned && (
                <span className="site-pinned" role="img" aria-label="常用">
                  <Icon name="star" />
                </span>
              )}
            </span>
            <span className="site-card-host">{displayHost(site.url)}</span>
          </span>
        </span>
        <span className="site-card-desc">{site.description}</span>
      </button>
      <span className="site-card-actions">
        <button
          type="button"
          className="site-icon-btn small"
          aria-pressed={site.pinned}
          aria-label={site.pinned ? `取消常用：${site.title}` : `设为常用：${site.title}`}
          title={site.pinned ? '取消常用' : '设为常用'}
          onClick={() => actions.onPin(site)}
        >
          <Icon name="star" />
        </button>
        <button
          type="button"
          className="site-icon-btn small"
          aria-label={`编辑：${site.title}`}
          title="编辑"
          onClick={() => actions.onEdit(site)}
        >
          <Icon name="rename" />
        </button>
        <button
          type="button"
          className="site-icon-btn small"
          aria-label={`更多：${site.title}`}
          title="更多"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            actions.onMenu(site, box.left, box.bottom + 4);
          }}
        >
          <Icon name="more" />
        </button>
      </span>
    </article>
  );
}

function Row({ site, color, actions }: { site: Site; color: string; actions: SiteActions }) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the context menu is a pointer shortcut; each row has a 更多 button.
    <div
      className={`site-row${actions.dragging?.(site) ? ' dragging' : ''}`}
      data-site={site.id}
      onPointerDown={(event) => actions.onDrag?.(site, event)}
      onContextMenu={(event) => {
        event.preventDefault();
        actions.onMenu(site, event.clientX, event.clientY);
      }}
    >
      <button
        type="button"
        className="site-row-main"
        title={site.url}
        onClick={() => actions.onOpen(site)}
      >
        <SiteMark
          title={site.title}
          color={color}
          size="sm"
          src={actions.iconOf?.(site) ?? null}
          fetching={actions.fetching?.(site) ?? false}
        />
        <span className="site-row-title">{site.title}</span>
        <span className="site-row-host">{displayHost(site.url)}</span>
        <span className="site-row-desc">{site.description}</span>
      </button>
      <button
        type="button"
        className="site-icon-btn small"
        aria-label={`更多：${site.title}`}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          actions.onMenu(site, box.left, box.bottom + 4);
        }}
      >
        <Icon name="more" />
      </button>
    </div>
  );
}

/** Sites as cards or as compact rows, under their section titles. */
export function SiteSections({
  catalog,
  sections,
  view,
  actions,
}: {
  catalog: SiteCatalog;
  sections: readonly Section[];
  view: SitesView;
  actions: SiteActions;
}) {
  const colorOf = (site: Site) =>
    (site.group && catalog.groupById.get(site.group)?.color) || 'gray';
  return (
    <>
      {sections.map((section) => (
        <section key={section.key} className="site-section" aria-label={section.title ?? undefined}>
          {section.title && (
            <h3 className="site-section-title">
              {section.color && (
                <span className="site-bar" style={{ background: colorValue(section.color) }} />
              )}
              {section.title}
              <span className="site-section-count">{section.items.length}</span>
            </h3>
          )}
          {view === 'cards' ? (
            <div className="site-grid">
              {section.items.map((site) => (
                <Card key={site.id} site={site} color={colorOf(site)} actions={actions} />
              ))}
            </div>
          ) : (
            <div className="site-list">
              {section.items.map((site) => (
                <Row key={site.id} site={site} color={colorOf(site)} actions={actions} />
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  );
}
