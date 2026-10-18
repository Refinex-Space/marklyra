import { describe, expect, it } from 'vitest';
import { outlineTree, visibleCurrentHeading } from '../src/features/outline/outline-tree.js';

describe('visible current heading', () => {
  const entries = [
    { id: 'root', level: 1, text: 'Repeated' },
    { id: 'child', level: 3, text: 'Skipped level' },
    { id: 'deep', level: 5, text: 'Repeated' },
    { id: 'sibling', level: 2, text: 'Other branch' },
    { id: 'next', level: 1, text: 'Repeated' },
    { id: 'last', level: 2, text: 'Last' },
  ];
  it.each([
    [[], 'deep', 'deep'],
    [['child'], 'deep', 'child'],
    [['root'], 'deep', 'root'],
    [['root', 'child'], 'deep', 'root'],
    [['sibling'], 'deep', 'deep'],
    [['root'], 'last', 'last'],
    [['next'], 'last', 'next'],
    [['root'], 'root', 'root'],
    [['unknown'], 'missing', null],
    [[], null, null],
  ] as const)(
    'maps %j and %s to the visible source identity %s',
    (collapsed, current, expected) => {
      const tree = outlineTree(entries),
        before = JSON.stringify(tree);
      expect(visibleCurrentHeading(tree, new Set(collapsed), current)).toBe(expected);
      expect(JSON.stringify(tree)).toBe(before);
    },
  );
});
