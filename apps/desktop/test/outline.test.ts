import { describe, expect, it } from 'vitest';
import { outlineMatch, outlineTree, visibleOutline } from '../src/features/outline/outline-tree.js';

describe('outline hierarchy', () => {
  const entries = [
    { id: 'a', level: 2, text: 'Start' },
    { id: 'b', level: 4, text: 'Skipped level' },
    { id: 'c', level: 3, text: 'Sibling' },
    { id: 'd', level: 1, text: 'New root' },
    { id: 'e', level: 2, text: 'Start' },
  ];
  it('retains source order and identity across skipped levels and duplicate headings', () => {
    const tree = outlineTree(entries);
    expect(tree.map((node) => node.id)).toEqual(['a', 'd']);
    expect(tree[0]?.children.map((node) => node.id)).toEqual(['b', 'c']);
    expect(tree[1]?.children.map((node) => node.id)).toEqual(['e']);
    expect(visibleOutline(tree, new Set()).map((node) => node.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(entries[0]).toEqual({ id: 'a', level: 2, text: 'Start' });
  });
  it('only hides descendants of collapsed headings, retaining later roots', () => {
    const tree = outlineTree(entries);
    expect(visibleOutline(tree, new Set(['a', 'unknown'])).map((node) => node.id)).toEqual([
      'a',
      'd',
      'e',
    ]);
    expect(visibleOutline(tree, new Set(['b'])).map((node) => node.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });
});

describe('outline literal filter', () => {
  it('keeps UTF-16 bounds for emoji, combining text and metacharacters', () => {
    expect(outlineMatch('前🙂 Café e\u0301 [Topic].*', '🙂 CAFÉ')).toEqual({ from: 1, to: 8 });
    expect(outlineMatch('前🙂 Café e\u0301 [Topic].*', 'e\u0301')).toEqual({ from: 9, to: 11 });
    expect(outlineMatch('前🙂 Café e\u0301 [Topic].*', '[topic].*')).toEqual({ from: 12, to: 21 });
    expect(outlineMatch('Café', 'cafe\u0301')).toBeNull();
    expect(outlineMatch('Title', '   ')).toBeNull();
  });
});
