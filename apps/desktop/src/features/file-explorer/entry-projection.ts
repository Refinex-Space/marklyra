import type { WorkspaceEntry } from '../../services/workspaces.js';

export const NO_RENAMES: readonly RelativeEntryRename[] = [];
export interface RelativeEntryRename {
  sequence: number;
  from: string;
  to: string;
}
export function relocatedPath(path: string, from: string, to: string): string {
  return path === from ? to : path.startsWith(`${from}/`) ? to + path.slice(from.length) : path;
}
export function projectedPath(
  path: string,
  epoch: number,
  renames: readonly RelativeEntryRename[],
): string {
  for (const rename of renames)
    if (rename.sequence > epoch) path = relocatedPath(path, rename.from, rename.to);
  return path;
}
export function projectedEntry<T extends Pick<WorkspaceEntry, 'name' | 'relativePath'>>(
  entry: T,
  epoch: number,
  renames: readonly RelativeEntryRename[],
): T {
  const relativePath = projectedPath(entry.relativePath, epoch, renames);
  return relativePath === entry.relativePath
    ? entry
    : { ...entry, relativePath, name: relativePath.split('/').at(-1) ?? entry.name };
}
/** Rendering identities only. This map grants no filesystem authority. */
export class EntryIdentities {
  private readonly ids = new Map<string, string>();
  private next = 0;
  constructor(private readonly scope = 'workspace') {}
  key = (path: string): string => {
    const prior = this.ids.get(path);
    if (prior) return prior;
    const id = `${this.scope}:entry-${++this.next}`;
    this.ids.set(path, id);
    return id;
  };
  retire(path: string): void {
    for (const key of this.ids.keys())
      if (key === path || key.startsWith(path + '/')) this.ids.delete(key);
  }
  relocate(from: string, to: string): void {
    const moved = [...this.ids].filter(([path]) => path === from || path.startsWith(`${from}/`));
    for (const [path] of moved) this.ids.delete(path);
    for (const [path, id] of moved) this.ids.set(relocatedPath(path, from, to), id);
  }
}
/** Absolute event paths are display hints, never new grants. */
export function relativeEventPath(
  root: string,
  absolute: string,
  windows: boolean,
): string | undefined {
  if (windows) {
    root = root.replaceAll('\\', '/');
    absolute = absolute.replaceAll('\\', '/');
  }
  root = root.replace(/\/+$/, '');
  const prefix = `${root}/`;
  return (
    windows
      ? absolute.toLowerCase().startsWith(prefix.toLowerCase())
      : absolute.startsWith(prefix)
  )
    ? absolute.slice(prefix.length)
    : undefined;
}

export interface RelativeEntryPresence {
  sequence: number;
  path: string;
  state: 'trashed' | 'restored';
}
export const NO_PRESENCE: readonly RelativeEntryPresence[] = [];
export function projectionEpoch(
  renames: readonly RelativeEntryRename[],
  presence: readonly RelativeEntryPresence[],
): number {
  return Math.max(renames.at(-1)?.sequence ?? 0, presence.at(-1)?.sequence ?? 0);
}
export function entryIsPresent(
  path: string,
  epoch: number,
  presence: readonly RelativeEntryPresence[],
  renames: readonly RelativeEntryRename[],
): boolean {
  let visible = true;
  for (const change of presence) {
    if (change.sequence <= epoch) continue;
    const target = projectedPath(change.path, change.sequence, renames);
    if (path === target || path.startsWith(target + '/')) visible = change.state === 'restored';
  }
  return visible;
}
