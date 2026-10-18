import { describe, expect, it } from 'vitest';
import {
  projectTableCellDeletion,
  type TableCellDeletion,
} from '../src/runtime/table-cell-source.js';
import type { TableSourceRows } from '../src/runtime/table-row-source.js';

function table(words: readonly string[][], padding: number): TableSourceRows {
  const rows = words.map((values, index) => {
    const cells = values.map((text, column) => ({
      id: `${index}-${column}`,
      text,
      mark: text,
      left: ' '.repeat(padding),
      right: ' '.repeat(padding),
    }));
    return {
      id: String(index),
      cells,
      line: '|' + cells.map((c) => c.left + c.mark + c.right + '|').join(''),
    };
  });
  const delimiter = '| :--- | ---: |';
  return {
    id: 't',
    prefix: '',
    suffix: '\n',
    rows,
    delimiter,
    alignment: ['left', 'right'],
    mark: [rows[0]?.line, delimiter, ...rows.slice(1).map((r) => r.line)].join('\n') + '\n',
  };
}
const before = () =>
    table(
      [
        ['H1', 'H2'],
        ['R1A', 'R1B'],
        ['R2A', 'R2B'],
      ],
      1,
    ),
  after = () =>
    table(
      [
        ['H1', 'H2'],
        ['R', ''],
        ['', 'B'],
      ],
      3,
    ),
  action: TableCellDeletion = {
    kind: 'clear-cells',
    first: { id: '1-0', offset: 1 },
    last: { id: '2-1', offset: 2 },
  };
describe('identity-bound multicell plain deletion', () => {
  it('deletes just selected text, keeping the existing delimiter and every old padding fragment', () => {
    const a = before(),
      b = after(),
      proof = projectTableCellDeletion(a, b, action, 7, '\n');
    expect(proof?.patches).toHaveLength(4);
    expect(proof?.rows.mark).toBe('| H1 | H2 |\n| :--- | ---: |\n| R |  |\n|  | B |\n');
    let replay = a.mark;
    for (const p of [...(proof?.patches ?? [])].reverse())
      replay = replay.slice(0, p.from - 7) + p.insert + replay.slice(p.to - 7);
    expect(replay).toBe(proof?.rows.mark);
  });
  it('rejects foreign identities, changed unselected text, inline syntax, and mismatched text deltas', () => {
    for (const mutate of [
      (t: TableSourceRows) => {
        const c = t.rows[1]?.cells?.[0];
        if (c) c.id = 'foreign';
      },
      (t: TableSourceRows) => {
        const c = t.rows[0]?.cells?.[0];
        if (c) c.text = 'changed';
      },
      (t: TableSourceRows) => {
        const c = t.rows[1]?.cells?.[0];
        if (c) c.mark = '**R**';
      },
      (t: TableSourceRows) => {
        const c = t.rows[2]?.cells?.[1];
        if (c) c.text = 'not-selected-suffix';
      },
    ]) {
      const b = after();
      mutate(b);
      expect(projectTableCellDeletion(before(), b, action, 0, '\n')).toBeUndefined();
    }
    for (const offset of [-1, 1.1, 99])
      expect(
        projectTableCellDeletion(
          before(),
          after(),
          { ...action, first: { id: '1-0', offset } },
          0,
          '\n',
        ),
      ).toBeUndefined();
  });
  it('rejects deleting half of a supplementary Unicode character', () => {
    const a = table(
      [
        ['H1', 'H2'],
        ['😀A', 'R1B'],
        ['R2A', 'R2B'],
      ],
      1,
    );
    expect(projectTableCellDeletion(a, after(), action, 0, '\n')).toBeUndefined();
  });
});
