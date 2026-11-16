import { beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ recent: [] as { id: string; at: string }[] }));
vi.mock('../src/services/sites.js', () => ({
  sites: {
    recent: async () => host.recent,
    recordOpen: async (_workspace: string, id: string) => {
      host.recent = [{ id, at: '' }, ...host.recent.filter((entry) => entry.id !== id)];
      return host.recent;
    },
  },
}));
const { loadRecent, readRecent } = await import('../src/features/sites/model/recent.js');

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('recently opened sites', () => {
  beforeEach(() => {
    host.recent = [];
    vi.stubGlobal('localStorage', new MemoryStorage());
    localStorage.setItem(
      'marklyra-sites-recent-v1',
      JSON.stringify({ '/notes/a': ['site-a1', 'site-a2'], '/notes/b': ['site-b1'] }),
    );
  });

  it('moves one folder’s local list to the host and keeps the other folders’ lists', async () => {
    expect(await loadRecent('workspace-a', '/notes/a')).toEqual(['site-a1', 'site-a2']);
    expect(readRecent('/notes/a')).toEqual([]);
    expect(readRecent('/notes/b')).toEqual(['site-b1']);
  });

  it('prefers the host list once it exists', async () => {
    host.recent = [{ id: 'host-1', at: '' }];
    expect(await loadRecent('workspace-a', '/notes/a')).toEqual(['host-1']);
    expect(readRecent('/notes/a')).toEqual(['site-a1', 'site-a2']);
  });
});
