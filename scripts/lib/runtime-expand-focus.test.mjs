import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import {
  engineModule,
  hasHook,
  member,
  sourceOf,
  unique,
  nodes as walk,
} from './runtime-test-source.mjs';

const expand = unique(
  walk(
    engineModule('render/brush-queue'),
    (node) => node.type === 'Property' && node.key.name === 'expand',
  ),
  'expand method',
).value;

test('expand retains its synchronous restore outside the deferred ownership hook', () => {
  assert.equal(hasHook(expand, '__MARKLYRA_RESTORE_BRUSH_CURSOR__'), false);
  assert.doesNotThrow(() => new Script(`(${sourceOf(expand)})`));
});

test('the shipped fourth guard distinguishes same-block id from cross-block endId', () => {
  const guards = walk(
    expand,
    (node) =>
      node.type === 'BinaryExpression' &&
      node.operator === '!=' &&
      member(node.left, 'cid') &&
      member(node.right, 'endId'),
  );
  assert.equal(guards.length, 1);
  const guard = guards[0];
  assert.equal(guard.left.object.type, 'Identifier');
  assert.equal(guard.right.object.type, 'Identifier');
  const evaluate = (bookmark) =>
    new Script(sourceOf(guard)).runInContext(
      createContext({
        [guard.left.object.name]: { cid: 'fixture' },
        [guard.right.object.name]: bookmark,
      }),
    );
  // Evaluating this exact predicate does not establish that the complete expand
  // path accepts any fabricated bookmark. Browser tests record actual readers.
  assert.equal(evaluate({ type: 'cursor', id: 'fixture', start: 1, end: 3 }), true);
  assert.equal(
    evaluate({ type: 'cursor', startId: 'other', endId: 'fixture', start: 1, end: 3 }),
    false,
  );
  const readers = walk(
    expand,
    (node) => node.type === 'CallExpression' && member(node.callee, 'buildUndo'),
  );
  assert.equal(readers.length, 2);
  assert.equal(readers[0].arguments.length, 1);
  assert.ok(readers[0].start < guard.start);
  assert.equal(readers[1].arguments.length, 0);
});

test('the original synchronous fourth restore precedes its history reader and register', () => {
  const calls = walk(expand, (node) => node.type === 'CallExpression');
  const positions = (name) => calls.filter((node) => member(node.callee, name));
  const [parse] = positions('simpleParse'),
    [restore] = positions('exeCommand'),
    [, after] = positions('buildUndo'),
    [register] = positions('register');
  assert.equal(positions('simpleParse').length, 1);
  assert.equal(positions('exeCommand').length, 1);
  assert.equal(positions('register').length, 1);
  assert.ok(parse.start < restore.start);
  assert.ok(restore.start < after.start);
  assert.ok(after.start < register.start);
  assert.equal(positions('setRange').length, 2);
});
