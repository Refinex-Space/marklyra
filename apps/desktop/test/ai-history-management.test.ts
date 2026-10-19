import { expect, it, vi } from 'vitest';
import { removeHistory } from '../src/features/ai/history-management.js';

it('archives regular sessions before deletion and reports progress per item', async () => {
  const manage = vi.fn(async () => {});
  const progress = vi.fn();
  const result = await removeHistory(
    [
      { id: 'a', title: 'A', archived: false },
      { id: 'b', title: 'B', archived: true },
    ],
    manage,
    progress,
  );
  expect(manage.mock.calls).toEqual([
    ['a', 'archive'],
    ['a', 'delete'],
    ['b', 'delete'],
  ]);
  expect(result).toEqual({ removed: ['a', 'b'], failed: [] });
  expect(progress.mock.calls).toEqual([[1], [2]]);
});
it('continues after individual errors and retries a newly archived item as archived', async () => {
  const calls: string[] = [];
  const result = await removeHistory(
    [
      { id: 'a', title: 'A', archived: false },
      { id: 'b', title: 'B', archived: true },
      { id: 'c', title: 'C', archived: false },
    ],
    async (id, action) => {
      calls.push(`${id}:${action}`);
      if (id === 'a' && action === 'delete') throw Error('Locked');
      if (id === 'c') throw Error('Archive refused');
    },
    () => {},
  );
  expect(result.removed).toEqual(['b']);
  expect(result.failed.map(({ item }) => item)).toEqual([
    { id: 'a', title: 'A', archived: true },
    { id: 'c', title: 'C', archived: false },
  ]);
  expect(calls).toEqual(['a:archive', 'a:delete', 'b:delete', 'c:archive']);
  const retry = vi.fn(async () => {});
  await removeHistory(
    result.failed.map(({ item }) => item),
    retry,
    () => {},
  );
  expect(retry.mock.calls).toEqual([
    ['a', 'delete'],
    ['c', 'archive'],
    ['c', 'delete'],
  ]);
});
