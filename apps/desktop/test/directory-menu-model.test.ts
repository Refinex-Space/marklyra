import { describe, expect, it } from 'vitest';
import {
  directoryMenuLimit,
  directoryMenuRows,
} from '../src/features/file-explorer/directory-menu-model.js';
import type {
  DirectoryHistoryCatalog,
  DirectoryHistoryEntry,
} from '../src/services/directory-history.js';

const entry = (id: string, pinned = false, current = false): DirectoryHistoryEntry => ({
  target: { kind: 'history', id },
  name: id,
  path: `/${id}`,
  pinned,
  current,
  reopenable: true,
});
const catalog = (
  entries: DirectoryHistoryEntry[],
  noRecentFiles = false,
): DirectoryHistoryCatalog => ({ revision: 3, noRecentFiles, entries });
describe('directory menu display contract', () => {
  it('groups stably by pin without sorting and appends current outside six slots', () => {
    const rows = directoryMenuRows(
      catalog([
        entry('R1'),
        entry('P1', true),
        entry('Current', true, true),
        entry('R2'),
        entry('P2', true),
        ...Array.from({ length: 5 }, (_, i) => entry(`T${i}`)),
      ]),
      null,
      6,
    );
    expect(rows.map((row) => row.name)).toEqual(['P1', 'P2', 'R1', 'R2', 'T0', 'T1', 'Current']);
  });
  it('synthesizes a current host workspace target rather than authorizing its path', () => {
    expect(
      directoryMenuRows(catalog([]), { id: 'current', name: 'Current', path: '/display-only' }, 0),
    ).toEqual([
      {
        target: { kind: 'workspace', workspaceId: 'current' },
        name: 'Current',
        path: '/display-only',
        pinned: false,
        current: true,
        reopenable: true,
      },
    ]);
  });
  it('preserves pinned/current when history is disabled without deleting records', () => {
    const state = catalog([entry('R'), entry('P', true), entry('Current', false, true)], true);
    expect(directoryMenuRows(state, null, 6).map((row) => row.name)).toEqual(['P', 'Current']);
    expect(state.entries).toHaveLength(3);
  });
  it('never fabricates an openable replacement for a legacy record', () => {
    const legacy = { ...entry('legacy'), reopenable: false };
    expect(directoryMenuRows(catalog([legacy]), null, 6)).toEqual([legacy]);
  });
  it('rejects contradictory current entries', () =>
    expect(() =>
      directoryMenuRows(catalog([entry('A', false, true), entry('B', false, true)]), null, 6),
    ).toThrow());
  it.each([
    [686, 203, 24, 6],
    [326, 203, 24, 4],
    [226, 203, 24, 0],
    [1000, 203, 24, 6],
    [100, 54, 0, 6],
    [50, 54, 0, 0],
    [203, 203, 24, 0],
    [NaN, 203, 24, 0],
  ])('uses original height budget %j', (height, base, row, count) =>
    expect(directoryMenuLimit(height, base, row)).toBe(count),
  );
});
