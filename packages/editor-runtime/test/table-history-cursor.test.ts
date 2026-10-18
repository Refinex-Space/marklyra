import { describe, expect, it } from 'vitest';
import { matchesTableSnapshot } from '../src/runtime/table-history-cursor.js';
import type { TableSourceRows } from '../src/runtime/table-row-source.js';

const table: TableSourceRows = {
  id: 'table',
  prefix: '',
  suffix: '',
  mark: '',
  delimiter: '| --- | --- |',
  rows: [
    {
      id: 'row',
      line: '| A | B |',
      cells: [
        { id: 'a', text: 'A', mark: 'A', left: ' ', right: ' ' },
        { id: 'b', text: 'B', mark: 'B', left: ' ', right: ' ' },
      ],
    },
  ],
};
const snapshot = () => ({
  id: 'table',
  content: { type: 'table' },
  relation: { parent_id: null, before_id: null, after_id: null },
  children: [
    {
      id: 'row',
      content: { type: 'table_row' },
      relation: { parent_id: 'table', before_id: null, after_id: null },
      children: [
        {
          id: 'b',
          content: { type: 'table_cell', text: 'B' },
          relation: { parent_id: 'row', before_id: 'a', after_id: null },
          children: [],
        },
        {
          id: 'a',
          content: { type: 'table_cell', text: 'A' },
          relation: { parent_id: 'row', before_id: null, after_id: 'b' },
          children: [],
        },
      ],
    },
  ],
});
describe('table redo snapshot ownership proof', () => {
  it('accepts correct membership and sibling relations independently of collection insertion order', () => {
    expect(matchesTableSnapshot(snapshot(), table)).toBe(true);
  });
  it('rejects wrong cell text, duplicate identities, foreign parent, wrong linked order and extra descendants', () => {
    const a = snapshot(),
      b = snapshot(),
      c = snapshot(),
      d = snapshot(),
      e = snapshot();
    const cell = (s: ReturnType<typeof snapshot>) => s.children[0]?.children[0];
    const aa = cell(a),
      cc = cell(c),
      dd = cell(d),
      ee = cell(e);
    if (!aa || !cc || !dd || !ee || !b.children[0]) throw Error('Missing authored snapshot');
    aa.content.text = 'foreign';
    b.children[0].children.push(b.children[0].children[0] ?? aa);
    cc.relation.parent_id = 'foreign';
    dd.relation.before_id = null;
    Reflect.set(ee, 'children', [{ id: 'foreign' }]);
    for (const s of [a, b, c, d, e, null, {}]) expect(matchesTableSnapshot(s, table)).toBe(false);
  });
});
