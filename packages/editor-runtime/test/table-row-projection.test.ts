import { describe, expect, it } from 'vitest';
import { diffText, SourceMirror } from '../../editor-core/src/index.js';
import { projectTableRowChange } from '../src/runtime/table-row-projection.js';
import type { TableSourceCell, TableSourceRows } from '../src/runtime/table-row-source.js';

const ending = '\n';
function row(id: string, words: readonly string[], padding: number) {
  const cells: TableSourceCell[] = words.map((text, index) => ({
    id: id + index,
    text,
    mark: text,
    left: ' '.repeat(padding),
    right: ' '.repeat(padding),
  }));
  return {
    id,
    line: '|' + cells.map((cell) => cell.left + cell.mark + cell.right + '|').join(''),
    cells,
  };
}
function table(rows: TableSourceRows['rows'], delimiter: string): TableSourceRows {
  return {
    id: 'table',
    prefix: '',
    suffix: '\n',
    rows,
    delimiter,
    alignment: ['left', 'right'],
    mark: [rows[0]?.line, delimiter, ...rows.slice(1).map((row) => row.line)].join(ending) + '\n',
  };
}
const before = () =>
  table(
    [
      row('h', ['H1', 'H2'], 8),
      row('long', ['much-longer', 'long-content'], 1),
      row('s', ['short', 'small'], 8),
      row('t', ['tail', 'last'], 8),
    ],
    '| :---------------- | ----------------: |',
  );
const after = () =>
  table(
    [row('h', ['H1', 'H2'], 1), row('s', ['short', 'small'], 1), row('t', ['tail', 'last'], 1)],
    '| :--- | ---: |',
  );
describe('identity-bound table padding projection', () => {
  it('removes only the selected row while canonical padding and dash widths shrink', () => {
    const a = before(),
      b = after(),
      edit = projectTableRowChange(a, b, 'long', 'delete', 0, ending);
    expect(edit).toBeDefined();
    if (!edit) throw Error('Missing row projection');
    const raw =
      '\ufeff' +
      [a.rows[0]?.line, a.delimiter, a.rows[1]?.line, a.rows[2]?.line, a.rows[3]?.line]
        .map((line, index) => line + (['\r\n', '\n', '\r\n', '\n', '\r\n'][index] ?? ''))
        .join('');
    const removed = a.rows[1]?.line + '\r\n',
      expected = raw.replace(removed, '');
    const mirror = new SourceMirror(raw, a.mark),
      initial = mirror.stateId;
    const projection = () => ({
      baseProjectionEpoch: mirror.projectionEpoch,
      baseCanonical: edit.rows.mark,
      patches: diffText(edit.rows.mark, b.mark),
    });
    expect(
      mirror.update(b.mark, {
        kind: 'edit',
        baseStateId: initial,
        baseCanonical: a.mark,
        patches: edit.patches,
        canonicalProjection: projection(),
      }).source,
    ).toBe(expected);
    const next = mirror.stateId;
    expect(
      mirror.update(a.mark, {
        kind: 'history',
        baseStateId: mirror.stateId,
        targetStateId: initial,
        baseProjectionEpoch: mirror.projectionEpoch,
      }).source,
    ).toBe(raw);
    expect(
      mirror.update(b.mark, {
        kind: 'history',
        baseStateId: mirror.stateId,
        targetStateId: next,
        baseProjectionEpoch: mirror.projectionEpoch,
      }).source,
    ).toBe(expected);
  });
  it('rejects changed text, inline marks, cell identities, alignment and unproved padding', () => {
    const a = before(),
      original = after();
    const mutated = (change: (value: TableSourceRows) => void) => {
      const value = structuredClone(original);
      change(value);
      return value;
    };
    const cases = [
      mutated((t) => {
        const c = t.rows[1]?.cells?.[0];
        if (c) c.text = 'changed';
      }),
      mutated((t) => {
        const c = t.rows[1]?.cells?.[0];
        if (c) c.mark = '**short**';
      }),
      mutated((t) => {
        const c = t.rows[1]?.cells?.[0];
        if (c) c.id = 'foreign';
      }),
      mutated((t) => {
        t.alignment = ['center', 'right'];
      }),
      mutated((t) => {
        const c = t.rows[1]?.cells?.[0];
        if (c) c.left = 'not padding';
      }),
      mutated((t) => {
        const r = t.rows[1];
        if (r) delete r.cells;
      }),
    ];
    for (const b of cases)
      expect(projectTableRowChange(a, b, 'long', 'delete', 0, ending)).toBeUndefined();
  });
  it('does not treat identical serialized lines with changed cell identity as unchanged rows', () => {
    const a = before(),
      b = table(
        a.rows.filter((r) => r.id !== 'long'),
        a.delimiter,
      ),
      cell = b.rows[1]?.cells?.[0];
    const changed = structuredClone(b),
      c = changed.rows[1]?.cells?.[0];
    if (!cell || !c) throw Error('Missing authored cell');
    c.id = 'foreign';
    expect(projectTableRowChange(a, changed, 'long', 'delete', 0, ending)).toBeUndefined();
  });
});
