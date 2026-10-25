import { describe, expect, it } from 'vitest';
import { coarseLayout, expandGroups } from '../src/features/knowledge-graph/coarse-layout.js';
import { defaultQuery, seedPosition, validView } from '../src/features/knowledge-graph/model.js';

describe('bounded graph layout', () => {
  it('covers every visible node once without adding or changing relationship data', () => {
    const nodes = Array.from({ length: 5000 }, (_, i) => ({
      id: `n${i}`,
      ...seedPosition(`n${i}`, i),
    }));
    const edges = nodes.slice(1).map((n, i) => ({ source: `n${i}`, target: n.id })),
      before = JSON.stringify(edges);
    const result = coarseLayout(nodes, edges);
    expect(result.groups.length).toBeLessThanOrEqual(256);
    expect(new Set(result.groups.flatMap((g) => g.members.map((n) => n.id))).size).toBe(5000);
    expandGroups(result.groups);
    expect(nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
    expect(JSON.stringify(edges)).toBe(before);
  });
  it('keeps pinned coordinates and is deterministic for disconnected graphs', () => {
    const create = () =>
      Array.from({ length: 1500 }, (_, i) => ({ id: `n${i}`, x: i, y: -i, pinned: i === 27 }));
    const a = create(),
      b = create();
    expandGroups(coarseLayout(a, []).groups);
    expandGroups(coarseLayout(b, []).groups);
    expect(a).toEqual(b);
    expect(a[27]).toMatchObject({ x: 27, y: -27, pinned: true });
  });
  it('rejects imported invalid geometry and unbounded views', () => {
    const view = {
      version: 1,
      query: defaultQuery,
      positions: { 'note.md': { x: 1, y: 2, pinned: false } },
      camera: null,
      particles: false,
    };
    expect(validView(view)).toBe(true);
    expect(
      validView({ ...view, positions: { 'note.md': { x: Infinity, y: 0, pinned: false } } }),
    ).toBe(false);
    expect(validView({ ...view, query: { ...defaultQuery, limit: 1e9 } })).toBe(false);
    expect(validView({ ...view, camera: { x: 0, y: 0, ratio: 1e-300 } })).toBe(false);
  });
});
