import { expect, it } from 'vitest';
import {
  projectTableCellFormat,
  type TableCellFormat,
} from '../src/runtime/table-format-source.js';
import type { TableSourceRows } from '../src/runtime/table-row-source.js';

function table(values: string[][], padding: string): TableSourceRows {
  const rows = values.map((values, row) => {
    const cells = values.map((text, column) => ({
      id: `${row}-${column}`,
      text,
      mark: text,
      left: padding,
      right: padding,
    }));
    return {
      id: String(row),
      cells,
      line: '|' + cells.map((cell) => padding + cell.text + padding + '|').join(''),
    };
  });
  const delimiter = '| :---- | ----: |';
  return {
    id: 'table',
    prefix: '\r\n',
    suffix: '\r\n',
    delimiter,
    alignment: ['left', 'right'],
    rows,
    mark:
      '\r\n' +
      [rows[0]?.line, delimiter, ...rows.slice(1).map((row) => row.line)].join('\r\n') +
      '\r\n',
  };
}
const source = () =>
  table(
    [
      ['H1', 'H2'],
      ['中文😀', 'a\\|b'],
      ['**已有**', '`code`'],
    ],
    '\t',
  );
const formatted = () =>
  table(
    [
      ['H1', 'H2'],
      ['**中文😀**', '**a\\|b**'],
      ['**已有**', '`code`'],
    ],
    '   ',
  );
const action: TableCellFormat = {
  kind: 'format-cells',
  cells: [
    { id: '1-0', before: '中文😀', after: '**中文😀**' },
    { id: '1-1', before: 'a\\|b', after: '**a\\|b**' },
  ],
};

it('projects only the named cell bodies while retaining old margins, delimiters and Unicode', () => {
  const before = source(),
    result = projectTableCellFormat(before, formatted(), action, 13, '\r\n');
  expect(result?.patches).toHaveLength(2);
  expect(result?.rows.mark).toBe(
    before.mark.replace('中文😀', '**中文😀**').replace('a\\|b', '**a\\|b**'),
  );
  let replay = before.mark;
  for (const patch of [...(result?.patches ?? [])].reverse())
    replay = replay.slice(0, patch.from - 13) + patch.insert + replay.slice(patch.to - 13);
  expect(replay).toBe(result?.rows.mark);
});

it('rejects changed structure, alignment, untouched cells and unproved body edits', () => {
  for (const mutate of [
    (value: TableSourceRows) => {
      value.rows.pop();
    },
    (value: TableSourceRows) => {
      value.alignment = ['right', 'right'];
    },
    (value: TableSourceRows) => {
      const cell = value.rows[0]?.cells?.[0];
      if (cell) cell.text = 'changed';
    },
    (value: TableSourceRows) => {
      const cell = value.rows[1]?.cells?.[0];
      if (cell) cell.id = 'foreign';
    },
    (value: TableSourceRows) => {
      const cell = value.rows[1]?.cells?.[0];
      if (cell) cell.mark = 'unexpected';
    },
  ]) {
    const after = formatted();
    mutate(after);
    expect(projectTableCellFormat(source(), after, action, 0, '\r\n')).toBeUndefined();
  }
  for (const cells of [
    [...action.cells, ...action.cells],
    [...action.cells, { id: 'missing', before: 'x', after: '**x**' }],
    [{ id: '1-0', before: 'wrong', after: '**中文😀**' }],
  ])
    expect(
      projectTableCellFormat(source(), formatted(), { kind: 'format-cells', cells }, 0, '\r\n'),
    ).toBeUndefined();
});
