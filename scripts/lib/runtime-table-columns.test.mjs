import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { engineModule, expressionOf, member, nodes, unique } from './runtime-test-source.mjs';

const method = unique(
  nodes(
    engineModule('58'),
    (node) => node.type === 'AssignmentExpression' && member(node.left, 'addCol'),
  ),
  'addCol method',
).right;

test('column insertion updates separate semantic and raw delimiter arrays', () => {
  const splices = nodes(
    method,
    (node) => node.type === 'CallExpression' && member(node.callee, 'splice'),
  );
  assert.deepEqual(
    splices.map((node) => node.callee.object.arguments[0].value),
    ['align', 'alignText'],
  );
});

for (const before of [true, false])
  test(`the real addCol ${before ? 'before' : 'after'} path keeps delimiter text and undo registration`, () => {
    const fields = { align: ['left', 'right'], alignText: [':---', '---:'] };
    const effects = { inserted: [], replaced: 0, history: 0, shown: 0 };
    const cell = {
      get: () => 1,
      addBefore: (value) => effects.inserted.push({ before: true, value }),
      addAfter: (value) => effects.inserted.push({ before: false, value }),
    };
    const table = {
      id: 'table',
      get: (name) =>
        name === 'children'
          ? { toArray: () => [{ getNthChild: () => cell }, { getNthChild: () => cell }] }
          : fields[name],
      toHTML: () => '<table></table>',
    };
    const element = {
      length: 1,
      closest() {
        return this;
      },
      find: () => ({ attr: () => 'cell' }),
      children: () => ({}),
      prevAll: () => ({ length: 0 }),
      prev: () => 'before-cell',
      next: () => 'after-cell',
      replaceWith: () => effects.replaced++,
    };
    const Node = function (value) {
      Object.assign(this, value);
    };
    Object.assign(Node, {
      TYPE: { table_cell: 'table_cell' },
      tryResetTable() {},
      adjustAlignText: () => '---',
    });
    const command = { undo: [], redo: [] };
    const editor = {
      undo: {
        endSnap() {},
        UndoManager: { makeEmptyCommand: () => command, buildReplaceUndo: () => ({}) },
        register: (value) => {
          assert.equal(value, command);
          effects.history++;
        },
      },
      selection: {
        buildUndo: () => ({}),
        jumpIntoElemBegin: (value) => assert.equal(value, before ? 'before-cell' : 'after-cell'),
      },
      getMarkElem: () => element,
      findNodeByElem: () => ({ get: () => ({ get: () => table }) }),
      findElemById: () => element,
      tableEdit: { showTableEdit: () => effects.shown++ },
    };
    const addCol = runInNewContext(expressionOf(method), {
      i: () => ({ hide() {} }),
      a: Node,
      window: { getSelection: () => ({ anchorNode: {} }) },
    });
    addCol(editor, before);
    assert.deepEqual(fields.align, before ? [null, 'left', 'right'] : ['left', null, 'right']);
    assert.deepEqual(fields.alignText, before ? ['---', ':---', '---:'] : [':---', '---', '---:']);
    assert.equal(effects.inserted.length, 2);
    assert.ok(effects.inserted.every((entry) => entry.before === before));
    assert.equal(effects.replaced, 1);
    assert.equal(effects.history, 1);
    assert.equal(effects.shown, 1);
    assert.equal(command.undo.length, 2);
    assert.equal(command.redo.length, 1);
  });
