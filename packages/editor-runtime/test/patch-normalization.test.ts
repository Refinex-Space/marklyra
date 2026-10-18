import { describe, expect, it } from 'vitest';
import { SourceMirror } from '../../editor-core/src/source-mirror.js';
import { applyTransaction } from '../../editor-core/src/transaction.js';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';
import { normalizeTrackedPatches } from '../src/runtime/patch-normalization.js';
import { RuntimeSourceTracking } from '../src/runtime/source-tracking.js';

const build = (values: [string, string][]) => {
  let offset = 0;
  const blocks = values.map(([id, text]) => {
    const from = offset;
    offset += text.length;
    return { id, from, to: offset, text };
  });
  return { canonical: values.map(([, text]) => text).join(''), blocks };
};
function captured(before: ReturnType<typeof build>, after: ReturnType<typeof build>) {
  const tracker = new RuntimeSourceTracking({} as LegacyGlobals, () => false);
  Reflect.set(tracker, 'previous', before);
  Reflect.set(tracker, 'prepared', after);
  return tracker.capture(after.canonical).changes[0];
}

describe('ordered serializer insertion composition', () => {
  it.each([false, true])(
    'emits actual placement obligations for an existing empty cid (%s)',
    (empty) => {
      const prefix = 'Alpha\n\nKeep\n\n';
      const before = build([
        ['prefix', prefix],
        ['tail', '**Tail**\n'],
        ...(empty ? [['empty', ''] as [string, string]] : []),
      ]);
      const after = build([
        ['prefix', prefix],
        ['tail', '**Tail**\n\n'],
        [empty ? 'empty' : 'new', '**Bravo**\n'],
      ]);
      const change = captured(before, after);
      expect(change?.patches).toEqual([
        { from: before.canonical.length, to: before.canonical.length, insert: '\n**Bravo**\n' },
      ]);
      expect(change?.placementChecks).toHaveLength(2);
      expect(change?.placementChecks?.map((check) => check.patch.insert)).toEqual([
        '\n',
        '**Bravo**\n',
      ]);
      expect(change?.placementRanges).toEqual(change?.placementChecks?.map((check) => check.range));
      if (!change?.placementRanges || !change.placementChecks)
        throw Error('Missing emitted placement proof');
      const raw = '\uFEFFAlpha\r\n\r\nKeep\n\n**Tail**\n';
      const mirror = new SourceMirror(raw, before.canonical);
      const initial = mirror.stateId;
      const updated = mirror.update(after.canonical, {
        kind: 'edit',
        baseStateId: initial,
        baseCanonical: before.canonical,
        patches: change.patches,
        placementRanges: change.placementRanges,
        placementChecks: change.placementChecks,
      });
      expect(updated.source).toBe(raw + '\n**Bravo**\n');
      const edited = mirror.stateId;
      expect(
        mirror.update(before.canonical, {
          kind: 'history',
          baseStateId: edited,
          targetStateId: initial,
        }).source,
      ).toBe(raw);
      expect(
        mirror.update(after.canonical, {
          kind: 'history',
          baseStateId: initial,
          targetStateId: edited,
        }).source,
      ).toBe(updated.source);
    },
  );

  it('keeps original fragment order across three zero-length contributions', () => {
    const before = build([
      ['a', 'A'],
      ['b', ''],
      ['c', ''],
    ]);
    const after = build([
      ['a', 'AX'],
      ['b', '😀'],
      ['c', '尾'],
    ]);
    const change = captured(before, after);
    expect(change?.patches).toEqual([{ from: 1, to: 1, insert: 'X😀尾' }]);
    expect(change?.placementChecks?.map((check) => check.patch.insert)).toEqual(['X', '😀', '尾']);
    expect(change?.placementChecks?.map((check) => check.range)).toEqual([
      { from: 0, to: 1 },
      { from: 1, to: 1 },
      { from: 1, to: 1 },
    ]);
  });

  it('does not mutate caller patches or domains and keeps core distinct-start rejection', () => {
    const patches = Object.freeze([
      Object.freeze({ from: 1, to: 1, insert: 'X' }),
      Object.freeze({ from: 1, to: 1, insert: 'Y' }),
    ]);
    const ranges = Object.freeze([
      Object.freeze({ from: 0, to: 1 }),
      Object.freeze({ from: 1, to: 1 }),
    ]);
    expect(() =>
      applyTransaction(
        { source: 'A', revision: 0, selection: { anchor: 0, head: 0 } },
        { baseRevision: 0, patches },
      ),
    ).toThrow('distinct start positions');
    const value = normalizeTrackedPatches('A', 'AXY', patches, ranges);
    expect(value.patches).toEqual([{ from: 1, to: 1, insert: 'XY' }]);
    expect(value.ranges).toEqual(ranges);
    expect(patches.map((patch) => patch.insert)).toEqual(['X', 'Y']);
  });

  it.each(
    [
      [
        { from: 0, to: 0, insert: 'X' },
        { from: 0, to: 1, insert: 'Y' },
      ],
      [
        { from: 0, to: 2, insert: '' },
        { from: 1, to: 2, insert: '' },
      ],
      [
        { from: 1, to: 1, insert: 'X' },
        { from: 0, to: 0, insert: 'Y' },
      ],
    ].map((patches) => ({ patches })),
  )(
    'rejects unknown replacement/overlap/reordering rather than guessing a document diff',
    ({ patches }) => {
      expect(() =>
        normalizeTrackedPatches(
          'AB',
          'unknown',
          patches,
          patches.map(() => ({ from: 0, to: 2 })),
        ),
      ).toThrow(/Overlapping|Only coincident/);
    },
  );
  it('rejects mismatched actual next text, domains and split Unicode positions', () => {
    expect(() =>
      normalizeTrackedPatches(
        'A',
        'wrong',
        [{ from: 1, to: 1, insert: 'X' }],
        [{ from: 0, to: 1 }],
      ),
    ).toThrow('actual next text');
    expect(() =>
      normalizeTrackedPatches('A', 'AX', [{ from: 1, to: 1, insert: 'X' }], [{ from: 0, to: 0 }]),
    ).toThrow('placement domain');
    expect(() =>
      normalizeTrackedPatches(
        '😀',
        'unknown',
        [{ from: 1, to: 1, insert: 'X' }],
        [{ from: 0, to: 2 }],
      ),
    ).toThrow();
  });
});

describe('legacy snapshot prefix invariant', () => {
  it('does not grant reversed ranges when an unsupported warp removes a suffix', () => {
    const second = { cid: 'b', toMark: () => '', get: () => undefined };
    const first = {
      cid: 'a',
      toMark: () => 'A',
      getFirstBrother() {
        return this;
      },
      get: () => second,
    };
    const runtime = {
      editor: {
        sourceView: { inSourceMode: false },
        nodeMap: { blocks: { sortedFirst: () => first } },
        warpContentWithOption: (value: string) => value.replace(/\n$/, ''),
      },
      File: { useCRLF: false },
    } as unknown as LegacyGlobals;
    const tracker = new RuntimeSourceTracking(runtime, () => false);
    const snapshot = Reflect.get(tracker, 'snapshot') as (canonical: string) => { blocks: unknown };
    expect(snapshot.call(tracker, 'A').blocks).toBeNull();
  });
});
