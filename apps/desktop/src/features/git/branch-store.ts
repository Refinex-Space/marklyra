// Per-repository branch favorites and recent checkouts. View conveniences only: they live in this
// browser profile and are never required for a Git operation.

const key = (kind: 'favorites' | 'recent', root: string) => `marklyra-git-${kind}:${root}`;
function read(kind: 'favorites' | 'recent', root: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key(kind, root)) ?? '[]');
    return Array.isArray(value)
      ? value.filter((item) => typeof item === 'string').slice(0, 50)
      : [];
  } catch {
    return [];
  }
}
function write(kind: 'favorites' | 'recent', root: string, value: string[]) {
  try {
    localStorage.setItem(key(kind, root), JSON.stringify(value.slice(0, 50)));
  } catch {
    // Storage may be unavailable; the popup still works without favorites.
  }
}
export const branchStore = {
  favorites: (root: string) => new Set(read('favorites', root)),
  toggleFavorite(root: string, name: string): Set<string> {
    const list = read('favorites', root);
    const next = list.includes(name) ? list.filter((item) => item !== name) : [...list, name];
    write('favorites', root, next);
    return new Set(next);
  },
  recent: (root: string) => read('recent', root),
  /** Remembers a checked-out branch, newest first. */
  visit(root: string, name: string) {
    write(
      'recent',
      root,
      [name, ...read('recent', root).filter((item) => item !== name)].slice(0, 8),
    );
  },
  rename(root: string, from: string, to: string) {
    write(
      'recent',
      root,
      read('recent', root).map((item) => (item === from ? to : item)),
    );
    write(
      'favorites',
      root,
      read('favorites', root).map((item) => (item === from ? to : item)),
    );
  },
};

export interface BranchFolder<T> {
  name: string;
  path: string;
  folders: BranchFolder<T>[];
  items: { label: string; value: T }[];
}
/** Groups `a/b/c` names into folders the way IDEA shows `feature/…` branches. */
export function branchTree<T>(entries: readonly { name: string; value: T }[]): BranchFolder<T> {
  const root: BranchFolder<T> = { name: '', path: '', folders: [], items: [] };
  for (const entry of entries) {
    const parts = entry.name.split('/');
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      const path = folder.path ? `${folder.path}/${part}` : part;
      let next = folder.folders.find((item) => item.name === part);
      if (!next) {
        next = { name: part, path, folders: [], items: [] };
        folder.folders.push(next);
      }
      folder = next;
    }
    folder.items.push({ label: parts.at(-1) ?? entry.name, value: entry.value });
  }
  return root;
}
