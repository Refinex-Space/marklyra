import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import { parse } from 'acorn';
import { transformRuntimeFocus } from './runtime-focus.mjs';

const original = await readFile(
  new URL('../../resources/editor/appsrc/main.js', import.meta.url),
  'utf8',
);
const transformed = transformRuntimeFocus(original);
function walk(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  for (const value of Object.values(node))
    for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child === 'object' && typeof child.type === 'string')
        walk(child, predicate, found);
  return found;
}
const member = (node, name) =>
  node?.type === 'MemberExpression' && !node.computed && node.property.name === name;
const root = parse(original, { ecmaVersion: 'latest' });
const module = walk(
  root,
  (node) =>
    node.type === 'CallExpression' &&
    member(node.callee, 'registerDynamic') &&
    node.arguments[0]?.value === '2b',
)[0];
const expand = walk(
  module.arguments[3],
  (node) => node.type === 'Property' && node.key.name === 'expand',
)[0].value;

test('fourth cursor remains original; the three ownership rewrites do not modify expand', () => {
  const [range] = transformed.metadata.untouchedCallRanges;
  assert.deepEqual(range, [123989, 124014]);
  assert.equal(transformed.metadata.untouchedCallRanges.length, 1);
  for (const edit of transformed.metadata.edits)
    assert.ok(edit.end <= expand.start || edit.start >= expand.end);
  const shift = transformed.metadata.edits
    .filter((edit) => edit.end <= expand.start)
    .reduce((sum, edit) => sum + edit.text.length - (edit.end - edit.start), 0);
  assert.equal(
    transformed.code.slice(expand.start + shift, expand.end + shift),
    original.slice(expand.start, expand.end),
  );
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
  const evaluate = (bookmark) =>
    new Script(original.slice(guard.start, guard.end)).runInContext(
      createContext({ r: { cid: 'fixture' }, o: bookmark }),
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
