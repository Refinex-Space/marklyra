import type { Site, SiteGroup, SiteSnapshot } from '../../../services/sites.js';
import { displayHost } from './url.js';

export type Scope =
  | { kind: 'all' }
  | { kind: 'pinned' }
  | { kind: 'recent' }
  | { kind: 'none' }
  | { kind: 'group'; id: string };

export const scopeKey = (scope: Scope) => (scope.kind === 'group' ? `g:${scope.id}` : scope.kind);

/** Read-only views over one snapshot: the group tree, counts and what each scope shows. */
export class SiteCatalog {
  readonly groupById = new Map<string, SiteGroup>();
  readonly itemById = new Map<string, Site>();
  readonly roots: SiteGroup[];
  private readonly kids = new Map<string, SiteGroup[]>();

  constructor(readonly snapshot: SiteSnapshot) {
    this.roots = [];
    for (const group of snapshot.groups) this.groupById.set(group.id, group);
    for (const group of snapshot.groups) {
      const parent = group.parent && this.groupById.get(group.parent);
      if (parent) {
        const list = this.kids.get(parent.id) ?? [];
        list.push(group);
        this.kids.set(parent.id, list);
      } else this.roots.push(group);
    }
    for (const item of snapshot.items) this.itemById.set(item.id, item);
  }

  get items() {
    return this.snapshot.items;
  }
  children(id: string): SiteGroup[] {
    return this.kids.get(id) ?? [];
  }
  /** The group and its children. */
  groupIds(id: string): string[] {
    return [id, ...this.children(id).map((g) => g.id)];
  }
  count(id: string): number {
    const ids = new Set(this.groupIds(id));
    return this.items.filter((s) => s.group !== null && ids.has(s.group)).length;
  }
  get ungrouped(): Site[] {
    return this.items.filter((s) => s.group === null);
  }
  get pinned(): Site[] {
    return this.items.filter((s) => s.pinned);
  }
  /** The sites a scope lists, `recent` being ids newest first. */
  of(scope: Scope, recent: readonly string[]): Site[] {
    switch (scope.kind) {
      case 'all':
        return this.items;
      case 'pinned':
        return this.pinned;
      case 'none':
        return this.ungrouped;
      case 'recent':
        return recent.flatMap((id) => this.itemById.get(id) ?? []);
      case 'group':
        return this.items.filter((s) => s.group === scope.id);
    }
  }
  /** A group's own sites, then each child group's, for the group page. */
  tree(id: string): { group: SiteGroup; items: Site[] }[] {
    const group = this.groupById.get(id);
    if (!group) return [];
    return [group, ...this.children(id)].map((g) => ({
      group: g,
      items: this.items.filter((s) => s.group === g.id),
    }));
  }
  /** Where a site sits, as `Parent / Child` for display. */
  pathOf(groupId: string | null): string {
    const group = groupId ? this.groupById.get(groupId) : undefined;
    if (!group) return '未分组';
    const parent = group.parent ? this.groupById.get(group.parent) : undefined;
    return parent ? `${parent.name} / ${group.name}` : group.name;
  }
}

/** Sites matching every word of the query, best matches first (title, then host, then text). */
export function searchSites(items: readonly Site[], query: string, limit = 5): Site[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { site: Site; score: number }[] = [];
  for (const site of items) {
    const title = site.title.toLowerCase();
    const host = displayHost(site.url).toLowerCase();
    const text = `${site.description} ${site.url}`.toLowerCase();
    let score = 0;
    for (const word of words) {
      const part = title.startsWith(word)
        ? 4
        : title.includes(word)
          ? 3
          : host.includes(word)
            ? 2
            : text.includes(word)
              ? 1
              : 0;
      if (!part) {
        score = 0;
        break;
      }
      score += part;
    }
    if (score) scored.push({ site, score });
  }
  scored.sort((a, b) => b.score - a.score || a.site.order - b.site.order);
  return scored.slice(0, limit).map((s) => s.site);
}
