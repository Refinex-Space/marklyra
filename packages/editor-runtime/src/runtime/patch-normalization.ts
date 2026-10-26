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
 * Join only those insertions, retain their individual placement obligations, and
 * prove the complete next text. Never reorder edits or rediff the document. */
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
    if (previous && (patch.from < previous.to || patch.from < previous.from))
      throw new Error('Overlapping serializer patches cannot be combined');
    if (
      previous &&
      previous.from === patch.from &&
      (previous.from !== previous.to || patch.from !== patch.to)
    )
      throw new Error('Only coincident serializer insertions can be combined');
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
      let insert = '';
      for (let part = index; part < end; part++) {
        const patch = patches[part],
          range = ranges[part];
        if (!patch || !range || !patch.insert.length)
          throw new Error('Empty coincident serializer insertion');
        insert += patch.insert;
        checks.push({ patch: { ...patch }, range: { ...range } });
      }
      merged.push({ from: first.from, to: first.to, insert });
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
