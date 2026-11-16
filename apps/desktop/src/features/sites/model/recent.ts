import { sites } from '../../../services/sites.js';

const KEY = 'marklyra-sites-recent-v1';
const MAX = 20;

type Store = Record<string, string[]>;
function read(): Store {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Store) : {};
  } catch {
    return {};
  }
}

/** Sites opened most recently, newest first, kept on this device per folder path. */
export function readRecent(folder: string): string[] {
  const list = read()[folder];
  return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
}
export function pushRecent(folder: string, id: string): string[] {
  const next = [id, ...readRecent(folder).filter((x) => x !== id)].slice(0, MAX);
  try {
    const store = read();
    store[folder] = next;
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Without storage the list lasts for this view only.
  }
  return next;
}

/** The host keeps the list. A folder that only has the older local list is copied across once. */
export async function loadRecent(workspaceId: string, folder: string): Promise<string[]> {
  try {
    const remote = await sites.recent(workspaceId);
    if (remote.length) return remote.map((entry) => entry.id).slice(0, MAX);
  } catch {
    return readRecent(folder);
  }
  const local = readRecent(folder);
  if (!local.length) return [];
  let ids = local;
  for (const id of [...local].reverse()) {
    try {
      ids = (await sites.recordOpen(workspaceId, id)).map((entry) => entry.id);
    } catch {
      return local;
    }
  }
  // Only this folder moved to the host; other folders keep their local lists until opened.
  try {
    const store = read();
    delete store[folder];
    if (Object.keys(store).length) localStorage.setItem(KEY, JSON.stringify(store));
    else localStorage.removeItem(KEY);
  } catch {
    // The host copy is already written.
  }
  return ids.slice(0, MAX);
}
