import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/** Mirrors `site_store::Group`. */
export interface SiteGroup {
  id: string;
  name: string;
  /** A preset colour name or `#rrggbb`. */
  color: string;
  /** Groups nest one level: a parent never has a parent. */
  parent: string | null;
  order: number;
  collapsed: boolean;
  created: string;
  revision: string;
}
/** Mirrors `site_store::Site`. */
export interface Site {
  id: string;
  url: string;
  title: string;
  description: string;
  /** `null` is ungrouped; the host also reports sites of a missing group that way. */
  group: string | null;
  order: number;
  pinned: boolean;
  /** `icons/<name>` below the store; `null` shows the letter mark. */
  icon: string | null;
  manual: string[];
  created: string;
  fetched: string | null;
  revision: string;
}
export interface SiteSnapshot {
  generation: number;
  /** `.marklyra/sites` exists; reading a folder without one never creates it. */
  present: boolean;
  groups: SiteGroup[];
  items: Site[];
  invalid: { path: string; error: string }[];
  truncated: boolean;
}
export interface SiteMutationResult {
  generation: number;
  applied: string[];
  conflicts: string[];
  created: string[];
}
export type SiteMutation =
  | { kind: 'addGroup'; name: string; color?: string; parent?: string | null }
  | { kind: 'updateGroup'; id: string; revision: string; set: Record<string, unknown> }
  | { kind: 'removeGroup'; id: string; revision: string; items: 'ungroup' | 'delete' }
  | { kind: 'reorderGroups'; ids: string[]; parent?: string | null }
  | {
      kind: 'addItem';
      url: string;
      group?: string | null;
      title?: string;
      description?: string;
      pinned?: boolean;
      manual?: string[];
    }
  | { kind: 'updateItem'; id: string; revision: string; set: Record<string, unknown> }
  | {
      kind: 'moveItems';
      ids: string[];
      revisions: string[];
      group: string | null;
      before?: string | null;
    }
  | { kind: 'removeItems'; ids: string[]; revisions: string[] };

/** Errors arrive as `[code] message`; the code drives the follow-up in the UI. */
export const siteErrorCode = (error: unknown) => /^\[([a-z-]+)\]/.exec(String(error))?.[1] ?? 'io';
export const siteErrorMessage = (error: unknown) => String(error).replace(/^\[[a-z-]+\]\s*/, '');

export interface SitePreview {
  title: string;
  description: string;
  iconDataUrl: string | null;
}
export interface SiteIcon {
  mime: string;
  base64: string;
}
export interface SiteRecent {
  id: string;
  at: string;
}
export type IconSource =
  | { kind: 'auto' }
  | { kind: 'letter' }
  | { kind: 'upload'; bytes: number[]; mime: string };

export const sites = {
  snapshot: (workspaceId: string) => invoke<SiteSnapshot>('sites_snapshot', { workspaceId }),
  mutate: (workspaceId: string, mutation: SiteMutation) =>
    invoke<SiteMutationResult>('sites_mutate', { workspaceId, mutation }),
  /** `fresh` skips the few minutes the host keeps a previous preview. */
  preview: (workspaceId: string, url: string, thirdParty: string, fresh = false) =>
    invoke<SitePreview>('sites_preview', { workspaceId, url, thirdParty, fresh }),
  enrich: (workspaceId: string, id: string, thirdParty: string) =>
    invoke<void>('sites_enrich', { workspaceId, id, thirdParty }),
  refetch: (workspaceId: string, ids: string[], thirdParty: string, force: boolean) =>
    invoke<void>('sites_refetch', { workspaceId, ids, thirdParty, force }),
  setIcon: (workspaceId: string, id: string, revision: string, source: IconSource) =>
    invoke<SiteMutationResult>('sites_set_icon', { workspaceId, id, revision, source }),
  icon: (workspaceId: string, name: string) =>
    invoke<SiteIcon>('sites_icon', { workspaceId, name }),
  recent: (workspaceId: string) => invoke<SiteRecent[]>('sites_recent', { workspaceId }),
  recordOpen: (workspaceId: string, id: string) =>
    invoke<SiteRecent[]>('sites_record_open', { workspaceId, id }),
  engineIcon: (workspaceId: string, template: string) =>
    invoke<SiteIcon>('sites_engine_icon', { workspaceId, template }),
};

/** Hands a web address to the system's default browser; the host validates it again. */
export const openInBrowser = (url: string) => invoke<void>('open_external_link', { url });

export const onSitesChanged = (handler: (generation: number) => void): Promise<UnlistenFn> =>
  listen<{ generation: number }>('marklyra:sites-changed', (event) =>
    handler(event.payload.generation),
  );

export const onSitesFetching = (
  handler: (id: string, active: boolean) => void,
): Promise<UnlistenFn> =>
  listen<{ id: string; active: boolean }>('marklyra:sites-fetching', (event) =>
    handler(event.payload.id, event.payload.active),
  );
