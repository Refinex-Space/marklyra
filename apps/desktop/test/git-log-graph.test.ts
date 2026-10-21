import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type GraphRow, layoutGraph } from '../src/features/git/model/log-graph.js';

type Commit = { oid: string; parents: string[] };
const c = (oid: string, ...parents: string[]): Commit => ({ oid, parents });

/** Rows join up: each row's bottom columns are the next row's top columns, colors included. */
function assertConnected(rows: readonly GraphRow[]): void {
  rows.forEach((row, index) => {
    const columns = [row.lane, ...row.up.flatMap((e) => [e.from, e.to])];
    columns.push(...row.down.flatMap((e) => [e.from, e.to]));
    expect(row.width).toBe(Math.max(...columns) + 1);
    // At node height, pass-through lanes continue; everything else touches the node.
    const middleUp = new Set(row.up.map((e) => e.to).filter((col) => col !== row.lane));
    const middleDown = new Set(row.down.map((e) => e.from).filter((col) => col !== row.lane));
    expect([...middleDown].sort()).toEqual([...middleUp].sort());
    const next = rows[index + 1];
    if (!next) return;
    const bottom = new Map(row.down.map((e) => [e.to, e.color]));
    const top = new Map(next.up.map((e) => [e.from, e.color]));
    expect([...top.entries()].sort()).toEqual([...bottom.entries()].sort());
  });
}

describe('layoutGraph', () => {
  it('returns no rows for no commits', () => {
    expect(layoutGraph([])).toEqual([]);
  });

  it('draws linear history in one lane and color', () => {
    const rows = layoutGraph([c('c', 'b'), c('b', 'a'), c('a')]);
    expect(rows).toEqual([
      { lane: 0, color: 0, up: [], down: [{ from: 0, to: 0, color: 0 }], width: 1, merge: false },
      {
        lane: 0,
        color: 0,
        up: [{ from: 0, to: 0, color: 0 }],
        down: [{ from: 0, to: 0, color: 0 }],
        width: 1,
        merge: false,
      },
      { lane: 0, color: 0, up: [{ from: 0, to: 0, color: 0 }], down: [], width: 1, merge: false },
    ]);
  });

  it('opens a lane for a merged branch and converges it at the fork point', () => {
    const rows = layoutGraph([c('m', 'a', 'b'), c('a', 'base'), c('b', 'base'), c('base')]);
    assertConnected(rows);
    expect(rows[0]).toEqual({
      lane: 0,
      color: 0,
      up: [],
      down: [
        { from: 0, to: 0, color: 0 },
        { from: 0, to: 1, color: 1 },
      ],
      width: 2,
      merge: true,
    });
    expect(rows.map((row) => [row.lane, row.color])).toEqual([
      [0, 0],
      [0, 0],
      [1, 1],
      [0, 0],
    ]);
    expect(rows[3]?.up).toEqual([
      { from: 0, to: 0, color: 0 },
      { from: 1, to: 0, color: 1 },
    ]);
    expect(rows[3]?.down).toEqual([]);
  });

  it('merges into an existing lane that already waits for the parent', () => {
    // feature tip f is listed first; the merge on main then points at f's lane.
    const rows = layoutGraph([c('f', 'f0'), c('m', 'm0', 'f0'), c('f0', 'm0'), c('m0')]);
    assertConnected(rows);
    expect(rows[1]).toMatchObject({ lane: 1, color: 1, merge: true });
    expect(rows[1]?.down).toEqual([
      { from: 0, to: 0, color: 0 },
      { from: 1, to: 1, color: 1 },
      { from: 1, to: 0, color: 0 },
    ]);
    expect(rows.every((row) => row.width <= 2)).toBe(true);
  });

  it('lays out an octopus merge', () => {
    const rows = layoutGraph([
      c('o', 'a', 'b', 'c'),
      c('a', 'r'),
      c('b', 'r'),
      c('c', 'r'),
      c('r'),
    ]);
    assertConnected(rows);
    expect(rows[0]?.down).toEqual([
      { from: 0, to: 0, color: 0 },
      { from: 0, to: 1, color: 1 },
      { from: 0, to: 2, color: 2 },
    ]);
    expect(rows[0]).toMatchObject({ width: 3, merge: true });
    expect(rows.slice(1, 4).map((row) => [row.lane, row.color])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    expect(rows[4]?.up).toEqual([
      { from: 0, to: 0, color: 0 },
      { from: 1, to: 0, color: 1 },
      { from: 2, to: 0, color: 2 },
    ]);
  });

  it('keeps lanes of parents missing from the list running to the end', () => {
    const rows = layoutGraph([c('x', 'p'), c('y', 'q')]);
    assertConnected(rows);
    expect(rows[1]).toEqual({
      lane: 1,
      color: 1,
      up: [{ from: 0, to: 0, color: 0 }],
      down: [
        { from: 0, to: 0, color: 0 },
        { from: 1, to: 1, color: 1 },
      ],
      width: 2,
      merge: false,
    });
  });

  it('shifts lanes left over a freed column and keeps their colors', () => {
    const rows = layoutGraph([c('a', 'a1'), c('b', 'b1'), c('c', 'c1'), c('a1'), c('b1'), c('c1')]);
    assertConnected(rows);
    expect(rows[3]).toMatchObject({ lane: 0, color: 0 });
    expect(rows[3]?.down).toEqual([
      { from: 1, to: 0, color: 1 },
      { from: 2, to: 1, color: 2 },
    ]);
    expect(rows.slice(4).map((row) => [row.lane, row.color])).toEqual([
      [0, 1],
      [0, 2],
    ]);
  });

  it('reuses freed columns so short-lived branches do not widen the graph', () => {
    const commits: Commit[] = [];
    for (let i = 0; i < 200; i++) {
      commits.push(c(`m${i}`, `m${i + 1}`, `t${i}`));
      commits.push(c(`t${i}`));
    }
    const rows = layoutGraph(commits);
    assertConnected(rows);
    expect(Math.max(...rows.map((row) => row.width))).toBe(2);
    expect(rows.filter((row) => row.lane === 0).every((row) => row.color === 0)).toBe(true);
    // Every merged branch gets its own color.
    expect(new Set(rows.filter((row) => row.lane === 1).map((row) => row.color)).size).toBe(200);
  });

  it('ignores duplicate parents', () => {
    const rows = layoutGraph([c('m', 'a', 'a'), c('a')]);
    expect(rows[0]).toMatchObject({ merge: true, down: [{ from: 0, to: 0, color: 0 }] });
  });

  it('stays connected for random histories (property)', () => {
    const history = fc
      .array(
        fc.record({
          parents: fc.array(fc.nat({ max: 6 }), { maxLength: 3 }),
          missing: fc.boolean(),
        }),
        { maxLength: 40 },
      )
      .map((specs) =>
        specs.map(({ parents, missing }, i) =>
          c(
            `c${i}`,
            ...parents.map((offset) =>
              missing && offset === 0
                ? `gone${i}`
                : `c${Math.min(i + 1 + offset, specs.length + 2)}`,
            ),
          ),
        ),
      );
    fc.assert(
      fc.property(history, (commits) => {
        const rows = layoutGraph(commits);
        expect(rows).toHaveLength(commits.length);
        assertConnected(rows);
      }),
      { numRuns: 400 },
    );
  });

  it('lays out 5k commits quickly', () => {
    const commits: Commit[] = [];
    for (let i = 0; i < 5_000; i++) {
      const parents = [`c${i + 1}`];
      if (i % 25 === 0) parents.push(`c${i + 7}`);
      if (i % 40 === 0) parents.push(`c${i + 13}`);
      commits.push(c(`c${i}`, ...parents));
    }
    const started = performance.now();
    const rows = layoutGraph(commits);
    const elapsed = performance.now() - started;
    expect(rows).toHaveLength(5_000);
    expect(Math.max(...rows.map((row) => row.width))).toBeLessThan(10);
    expect(elapsed).toBeLessThan(500);
  });
});
