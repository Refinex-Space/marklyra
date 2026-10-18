import { describe, expect, it } from 'vitest';
import {
  EntryIdentities,
  entryIsPresent,
  projectedEntry,
  projectedPath,
  projectionEpoch,
  relativeEventPath,
  relocatedPath,
} from '../src/features/file-explorer/entry-projection.js';

describe('rename view projection does not authorize paths', () => {
  it('relocates exact entries and descendants, preserving similarly named siblings', () => {
    expect(relocatedPath('Folder/child.md', 'Folder', 'Moved')).toBe('Moved/child.md');
    expect(relocatedPath('Folder2/child.md', 'Folder', 'Moved')).toBe('Folder2/child.md');
    expect(
      projectedPath('A/child.md', 1, [
        { sequence: 1, from: 'Old', to: 'A' },
        { sequence: 2, from: 'A', to: 'B' },
      ]),
    ).toBe('B/child.md');
  });
  it('keeps row identities across rename and allocates a fresh identity if the old name is reused', () => {
    const ids = new EntryIdentities('ws'),
      a = ids.key('A'),
      child = ids.key('A/child');
    ids.relocate('A', 'B');
    expect(ids.key('B')).toBe(a);
    expect(ids.key('B/child')).toBe(child);
    expect(ids.key('A')).not.toBe(a);
  });
  it('does not replay acknowledged events or mutate the original report entry', () => {
    const entry = { name: 'A.md', relativePath: 'A.md', summary: 'raw' };
    expect(projectedEntry(entry, 2, [{ sequence: 2, from: 'A.md', to: 'B.md' }])).toBe(entry);
    expect(projectedEntry(entry, 1, [{ sequence: 2, from: 'A.md', to: 'B.md' }])).toEqual({
      ...entry,
      name: 'B.md',
      relativePath: 'B.md',
    });
  });
  it('rejects outside-root display hints and handles only the known separator convention', () => {
    expect(relativeEventPath('/safe', '/safety/a', false)).toBeUndefined();
    expect(relativeEventPath('/safe', '/safe/a/b', false)).toBe('a/b');
    expect(relativeEventPath('C:\\safe', 'c:\\SAFE\\a.md', true)).toBe('a.md');
  });
});

// Presence events remove only older cached views, never rewrite the document.
describe('Trash/restore view epochs', () => {
  it('hides an old subtree while retaining a similarly named sibling', () => {
    const changes = [{ sequence: 2, path: 'Folder', state: 'trashed' as const }];
    expect(entryIsPresent('Folder/child.md', 1, changes, [])).toBe(false);
    expect(entryIsPresent('Folder2/child.md', 1, changes, [])).toBe(true);
  });
  it('trusts a later Native snapshot if a new entity reused an old trashed path', () => {
    expect(entryIsPresent('A.md', 2, [{ sequence: 2, path: 'A.md', state: 'trashed' }], [])).toBe(
      true,
    );
  });
  it('projects the removed prefix across a later ancestor rename', () => {
    expect(
      entryIsPresent(
        'Moved/child.md',
        0,
        [{ sequence: 1, path: 'Folder/child.md', state: 'trashed' }],
        [{ sequence: 2, from: 'Folder', to: 'Moved' }],
      ),
    ).toBe(false);
  });
  it('restore and later descendant removal are applied in real event order', () => {
    const changes = [
      { sequence: 1, path: 'Folder', state: 'trashed' as const },
      { sequence: 2, path: 'Folder', state: 'restored' as const },
      { sequence: 3, path: 'Folder/child.md', state: 'trashed' as const },
    ];
    expect(entryIsPresent('Folder/other.md', 0, changes, [])).toBe(true);
    expect(entryIsPresent('Folder/child.md', 0, changes, [])).toBe(false);
    expect(projectionEpoch([{ sequence: 2, from: 'A', to: 'B' }], changes)).toBe(3);
  });
  it('does not reuse retired rendering identities as naming capabilities', () => {
    const ids = new EntryIdentities('ws'),
      before = ids.key('Folder/child.md');
    ids.retire('Folder');
    expect(ids.key('Folder/child.md')).not.toBe(before);
  });
});
