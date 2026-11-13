import {
  applyTransaction,
  assertPosition,
  assertWellFormedText,
  type Patch,
} from '@marklyra/editor-core';

interface Range {
  from: number;
  to: number;
}
export interface PlacementCheck {
  patch: Patch;
  range: Range;
}

/** Adjacent serializer partitions can insert at the same input boundary.
 * Join those insertions, retain their individual placement obligations, and
 * prove the complete next text. Never reorder edits or rediff the document.
 *
 * A block recreated in front of a surviving block whose text also changed from its first
 * character (an Undo whose history entry was never journaled, e.g. one made mid-IME) yields
 * insertions followed by one replacement at the same boundary. In that order they are exactly
 * one replacement; it stays inside the replacement's own domain, which starts at the boundary,
 * so the source mirror still proves its placement there. */
export function normalizeTrackedPatches(
  before: string,
  after: string,
  patches: readonly Patch[],
  ranges: readonly Range[],
): { patches: Patch[]; ranges: Range[]; placementChecks?: PlacementCheck[] } {
  if (patches.length !== ranges.length) throw new Error('Missing serializer placement domain');
  let previous: Patch | undefined;
  for (let index = 0; index < patches.length; index++) {
    const patch = patches[index],
      range = ranges[index];
    if (!patch || !range) throw new Error('Missing serializer patch');
    assertPosition(before, patch.from);
    assertPosition(before, patch.to);
    assertPosition(before, range.from);
    assertPosition(before, range.to);
    assertWellFormedText(patch.insert);
    if (patch.to < patch.from || range.from > patch.from || range.to < patch.to)
      throw new Error('Invalid serializer placement domain');
    // A replacement ends its boundary group: anything after it starting at the same offset
    // overlaps it, so every coincident patch before the last is an insertion.
    if (previous && (patch.from < previous.to || patch.from < previous.from))
      throw new Error('Overlapping serializer patches cannot be combined');
    previous = patch;
  }
  const merged: Patch[] = [],
    checks: PlacementCheck[] = [];
  for (let index = 0; index < patches.length; ) {
    const first = patches[index];
    if (!first) throw new Error('Missing serializer patch');
    let end = index + 1;
    while (end < patches.length && patches[end]?.from === first.from) end++;
    if (end - index === 1) merged.push({ ...first });
    else {
      const last = patches[end - 1];
      if (!last) throw new Error('Missing serializer patch');
      const replaced = last.to !== last.from;
      let insert = '';
      for (let part = index; part < end; part++) {
        const patch = patches[part],
          range = ranges[part];
        if (!patch || !range) throw new Error('Missing serializer patch');
        const insertion = !(replaced && part === end - 1);
        if (insertion && !patch.insert.length)
          throw new Error('Empty coincident serializer insertion');
        insert += patch.insert;
        // Individual insertion proofs exist only for a pure insertion group (the mirror checks
        // them against one joined insertion); a replacement group is proved as one replacement.
        if (!replaced) checks.push({ patch: { ...patch }, range: { ...range } });
      }
      merged.push({ from: first.from, to: last.to, insert });
    }
    index = end;
  }
  const actual = applyTransaction(
    { source: before, revision: 0, selection: { anchor: 0, head: 0 } },
    { baseRevision: 0, patches: merged, selection: { anchor: 0, head: 0 } },
  ).source;
  if (actual !== after) throw new Error('Serializer patches do not reproduce the actual next text');
  return {
    patches: merged,
    ranges: ranges.map((range) => ({ ...range })),
    ...(checks.length ? { placementChecks: checks } : {}),
  };
}
