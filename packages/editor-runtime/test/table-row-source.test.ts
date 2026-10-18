import { SourceMirror } from '@marklyra/editor-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type TableSourceRows,
  tableRowPatches,
  tableRowSplice,
} from '../src/runtime/table-row-source.js';

const ending = '\r\n';
function snapshot(rows: { id: string; line: string }[]): TableSourceRows {
  const delimiter = '| --- | --- |',
    mark = [rows[0]?.line, delimiter, ...rows.slice(1).map((row) => row.line)].join(ending);
  return { id: 'table', mark, prefix: '', suffix: '', delimiter, rows };
}
const header = { id: 'header', line: '| A | B |' },
  one = { id: 'one', line: '| same | same |' },
  two = { id: 'two', line: '| same | same |' };
describe('table row identity splice proof', () => {
  it.each(['up', 'down'] as const)(
    'swaps only two physical row bodies for %s, keeping delimiter and EOL',
    (action) => {
      const first = { id: 'first', line: '| First | 第一 |' },
        before = snapshot([header, first, two]),
        after = snapshot([first, header, two]),
        patches = tableRowPatches(
          before,
          after,
          action === 'up' ? first.id : header.id,
          action,
          0,
          ending,
        );
      expect(patches).toHaveLength(2);
      if (!patches) throw Error('Missing swap proof');
      const raw = '\ufeff| A | B |\r\n| --- | --- |\n| First | 第一 |\r\n| same | same |',
        mirror = new SourceMirror(raw, before.mark);
      expect(
        mirror.update(after.mark, {
          kind: 'edit',
          baseStateId: mirror.stateId,
          baseCanonical: before.mark,
          patches,
        }).source,
      ).toBe('\ufeff| First | 第一 |\r\n| --- | --- |\n| A | B |\r\n| same | same |');
      for (const invalid of [
        snapshot([first, two, header]),
        { ...after, delimiter: '| :--- | --- |' },
        snapshot([first, { ...header, id: 'foreign' }, two]),
      ])
        expect(
          tableRowPatches(
            before,
            invalid,
            action === 'up' ? first.id : header.id,
            action,
            0,
            ending,
          ),
        ).toBeUndefined();
      expect(tableRowPatches(before, before, header.id, 'up', 0, ending)).toBeUndefined();
      expect(tableRowPatches(before, before, two.id, 'down', 0, ending)).toBeUndefined();
    },
  );
  it.each([false, true])(
    'promotes a new header with disjoint edits and untouched delimiter, header-only=%s',
    (headerOnly) => {
      const before = snapshot(headerOnly ? [header] : [header, one, two]);
      const inserted = { id: 'new-header', line: '|  |  |' },
        after = snapshot([inserted, ...before.rows]);
      const patches = tableRowPatches(before, after, header.id, 'before', 0, ending);
      expect(patches).toHaveLength(2);
      if (!patches) throw Error('Missing header proof');
      let replay = before.mark;
      for (const patch of [...patches].reverse())
        replay = replay.slice(0, patch.from) + patch.insert + replay.slice(patch.to);
      expect(replay).toBe(after.mark);
      const raw = headerOnly
        ? '\ufeff| A | B |\r\n| --- | --- |'
        : '\ufeff| A | B |\r\n| --- | --- |\n| same | same |\r\n| same | same |';
      const expected = headerOnly
        ? '\ufeff|  |  |\r\n| --- | --- |\r\n| A | B |'
        : '\ufeff|  |  |\r\n| --- | --- |\n| A | B |\r\n| same | same |\r\n| same | same |';
      const mirror = new SourceMirror(raw, before.mark),
        initial = mirror.stateId;
      expect(
        mirror.update(after.mark, {
          kind: 'edit',
          baseStateId: initial,
          baseCanonical: before.mark,
          patches,
        }).source,
      ).toBe(expected);
      expect(
        mirror.update(before.mark, {
          kind: 'history',
          baseStateId: mirror.stateId,
          targetStateId: initial,
        }).source,
      ).toBe(raw);
      for (const changed of [
        snapshot([{ ...inserted, id: header.id }, ...before.rows]),
        snapshot([{ ...inserted, line: '| other | body |' }, ...before.rows]),
        { ...after, delimiter: '| :-- | --: |' },
        snapshot([inserted, ...[...before.rows].reverse()]),
      ]) {
        if (changed.mark === after.mark && changed.rows.every((r, i) => r.id === after.rows[i]?.id))
          continue;
        expect(tableRowPatches(before, changed, header.id, 'before', 0, ending)).toBeUndefined();
      }
    },
  );
  it.each([1, 2])(
    'deletes repeated row %i while preserving the surviving raw row terminator',
    (index) => {
      const before = snapshot([header, one, two]),
        after = snapshot(before.rows.filter((_, i) => i !== index)),
        raw = '| A | B |\r\n| --- | --- |\r\n| same | same |\n| same | same |';
      const patch = tableRowSplice(
        before,
        after,
        before.rows[index]?.id ?? '',
        'delete',
        0,
        ending,
      );
      expect(patch).toBeDefined();
      if (!patch) throw Error('Missing proof');
      expect(before.mark.slice(0, patch.from) + patch.insert + before.mark.slice(patch.to)).toBe(
        after.mark,
      );
      const mirror = new SourceMirror(raw, before.mark),
        initial = mirror.stateId;
      expect(
        mirror.update(after.mark, {
          kind: 'edit',
          baseStateId: initial,
          baseCanonical: before.mark,
          patches: [patch],
        }).source,
      ).toBe('| A | B |\r\n| --- | --- |\r\n| same | same |');
      expect(
        mirror.update(before.mark, {
          kind: 'history',
          baseStateId: mirror.stateId,
          targetStateId: initial,
        }).source,
      ).toBe(raw);
    },
  );
  it('inserts before a repeated row using its actual cid, not first matching text', () => {
    const before = snapshot([header, one, two]),
      inserted = { id: 'new', line: '|  |  |' },
      after = snapshot([header, one, inserted, two]);
    const patch = tableRowSplice(before, after, 'two', 'before', 5, ending);
    expect(patch).toEqual({
      from: 5 + before.mark.lastIndexOf(two.line),
      to: 5 + before.mark.lastIndexOf(two.line),
      insert: '|  |  |\r\n',
    });
  });
  it('rejects changed neighbors, separator, prefix, identity order and header insertion', () => {
    const before = snapshot([header, one, two]),
      after = snapshot([header, two]);
    for (const changed of [
      { ...after, delimiter: '| :-- | --: |' },
      snapshot([{ ...header, line: '| A    | B    |' }, two]),
      { ...after, prefix: '\r\n' },
      snapshot([two, header]),
    ])
      expect(tableRowSplice(before, changed, 'one', 'delete', 0, ending)).toBeUndefined();
    expect(
      tableRowSplice(
        before,
        snapshot([{ id: 'new', line: '|  |  |' }, header, one, two]),
        'header',
        'before',
        0,
        ending,
      ),
    ).toBeUndefined();
  });
  it('composes insertion/deletion patches over arbitrary repeated simple rows', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('same', '中😀', 'different'), { minLength: 1, maxLength: 25 }),
        fc.nat(),
        (words, pick) => {
          const rows = [
              header,
              ...words.map((word, index) => ({ id: String(index), line: `| ${word} | ${word} |` })),
            ],
            before = snapshot(rows),
            index = 1 + (pick % words.length),
            row = rows[index];
          if (!row) throw Error('Missing row');
          const after = snapshot(rows.filter((_, i) => i !== index)),
            patch = tableRowSplice(before, after, row.id, 'delete', 0, ending);
          expect(patch).toBeDefined();
          if (patch)
            expect(
              before.mark.slice(0, patch.from) + patch.insert + before.mark.slice(patch.to),
            ).toBe(after.mark);
          const inserted = { id: 'new', line: '|  |  |' },
            add = snapshot([...rows.slice(0, index + 1), inserted, ...rows.slice(index + 1)]),
            append = tableRowSplice(before, add, row.id, 'after', 0, ending);
          expect(append).toBeDefined();
          if (append)
            expect(
              before.mark.slice(0, append.from) + append.insert + before.mark.slice(append.to),
            ).toBe(add.mark);
        },
      ),
      { numRuns: 150 },
    );
  });
});
