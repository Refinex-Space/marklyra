import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext, Script } from 'node:vm';
import { parse } from 'acorn';
import { transformRuntimeBrushQueue } from './runtime-brush-queue.mjs';
import { transformRuntimeFocus } from './runtime-focus.mjs';

const sourcePath = new URL('../../resources/editor/appsrc/main.js', import.meta.url),
  original = await readFile(sourcePath, 'utf8'),
  result = transformRuntimeBrushQueue(original),
  digest = (value) => createHash('sha256').update(value).digest('hex');

function methods(code) {
  const found = {};
  function walk(node) {
    if (
      node.type === 'Property' &&
      ['brushQueue', 'addToQueue', 'restart'].includes(node.key?.name) &&
      node.value.type === 'FunctionExpression'
    )
      found[node.key.name] = code.slice(node.value.start, node.value.end);
    for (const value of Object.values(node))
      for (const child of Array.isArray(value) ? value : [value]) if (child?.type) walk(child);
  }
  walk(parse(code, { ecmaVersion: 'latest' }));
  return found;
}
const corrected = methods(result.code);
function fixture(work = async () => false, sources = corrected) {
  const effects = { expanded: 0, autocomplete: 0, restored: 0, ran: 0, cids: [] };
  const context = {
    File: { isLocked: false },
    console: { debug() {} },
    i: { isNullOrEmpty: (value) => value === null || value === undefined || value === '' },
    g: function (cid, ...args) {
      effects.cids.push(cid);
      return Reflect.apply(work, this, [cid, ...args]);
    },
    window: {},
    Set,
  };
  const brush = {
    queue: [],
    editor: {
      isIME: false,
      isMousePressed: false,
      selection: { getRangy: () => null, buildUndo: () => ({ id: 'cursor' }) },
      undo: { exeCommand: () => effects.restored++ },
    },
    expand: () => effects.expanded++,
    triggerAutoComplete: () => effects.autocomplete++,
    run: () => effects.ran++,
  };
  for (const [name, source] of Object.entries(sources))
    brush[name] = runInNewContext(`(${source})`, context);
  return { brush, effects, context };
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

test('new tasks added during the original await remain queued for the next batch', async () => {
  const wait = deferred(),
    { brush, effects } = fixture(() => wait.promise);
  brush.addToQueue('first');
  const running = brush.brushQueue();
  brush.addToQueue('next');
  const next = brush.queue[1];
  wait.resolve(false);
  await running;
  assert.equal(brush.queue.length, 1);
  assert.equal(brush.queue[0], next);
  assert.deepEqual(effects.cids, ['first']);
  await brush.brushQueue();
  assert.equal(brush.queue.length, 0);
  assert.deepEqual(effects.cids, ['first', 'next']);
});

test('same cid input receives a fresh task and is not removed with the earlier task', async () => {
  const wait = deferred(),
    { brush, effects } = fixture(() => wait.promise);
  brush.addToQueue('same', true);
  brush.addToQueue('same', false);
  assert.notEqual(brush.queue[0], brush.queue[1]);
  const running = brush.brushQueue();
  brush.addToQueue('same', false);
  const next = brush.queue[2];
  wait.resolve(true);
  await running;
  assert.equal(brush.queue.length, 1);
  assert.equal(brush.queue[0], next);
  assert.equal(next.inlineOnly, false);
  assert.deepEqual(effects.cids, ['same'], 'the original per-batch cid deduplication is retained');
  await brush.brushQueue();
  assert.deepEqual(effects.cids, ['same', 'same']);
});

test('restart during await preserves replacement-queue tasks including the same cid', async () => {
  const wait = deferred(),
    { brush, effects } = fixture(() => wait.promise);
  brush.addToQueue('same');
  const oldQueue = brush.queue,
    running = brush.brushQueue();
  brush.restart();
  brush.addToQueue('same');
  brush.addToQueue('new-document');
  const tasks = [...brush.queue];
  wait.resolve(false);
  await running;
  assert.notEqual(brush.queue, oldQueue);
  assert.equal(brush.queue.length, 2);
  assert.equal(brush.queue[0], tasks[0]);
  assert.equal(brush.queue[1], tasks[1]);
  assert.equal(effects.ran, 1);
});

test('rejection preserves the original queue and new work without consuming a failed batch', async () => {
  const wait = deferred(),
    { brush, effects } = fixture(() => wait.promise),
    failure = new Error('controlled brush failure');
  brush.addToQueue('first');
  const queue = brush.queue,
    running = brush.brushQueue();
  brush.addToQueue('next');
  wait.reject(failure);
  await assert.rejects(running, (error) => error === failure);
  assert.equal(brush.queue, queue);
  assert.equal(brush.queue.length, 2);
  assert.equal(effects.expanded, 0);
  assert.equal(effects.restored, 0);
});

test('IME, pressed mouse and locked-file deferrals retain all tasks', async () => {
  for (const kind of ['ime', 'mouse', 'locked']) {
    const { brush, context, effects } = fixture();
    brush.addToQueue('waiting');
    const queue = brush.queue;
    if (kind === 'ime') brush.editor.isIME = true;
    if (kind === 'mouse') brush.editor.isMousePressed = true;
    if (kind === 'locked') context.File.isLocked = true;
    await brush.brushQueue();
    assert.equal(brush.queue, queue);
    assert.equal(brush.queue.length, 1);
    assert.deepEqual(effects.cids, []);
  }
});

test('the transform composes with the proven focus hook without changing its behavior', async () => {
  const focused = transformRuntimeFocus(original).code,
    transformed = transformRuntimeBrushQueue(original, focused),
    { brush, effects } = fixture(async () => true, methods(transformed.code));
  brush.addToQueue('first');
  await brush.brushQueue();
  assert.equal(effects.restored, 1);
  assert.equal(effects.expanded, 1);
  assert.equal(brush.queue.length, 0);
  assert.doesNotThrow(() => new Script(transformed.code));
});

test('only guarded batch edits change generated bytes and raw resources remain unchanged', async () => {
  const { code, metadata } = result;
  assert.equal(metadata.edits.length, 3);
  assert.equal(metadata.originalSha256, digest(original));
  assert.equal(metadata.inputSha256, digest(original));
  assert.equal(metadata.transformedSha256, digest(code));
  let restored = code,
    shift = 0;
  const positions = metadata.edits.map((edit) => {
    const position = edit.start + shift;
    shift += edit.text.length - (edit.end - edit.start);
    return { edit, position };
  });
  for (const { edit, position } of positions.reverse())
    restored =
      restored.slice(0, position) +
      original.slice(edit.start, edit.end) +
      restored.slice(position + edit.text.length);
  assert.equal(restored, original);
  assert.equal(digest(await readFile(sourcePath)), metadata.originalSha256);
  assert.doesNotThrow(() => new Script(code));
});

test('unknown provenance, altered methods and duplicate application fail closed', () => {
  for (const value of [null, 42, '', `${original}\n`])
    assert.throws(() => transformRuntimeBrushQueue(value), /unknown original/);
  assert.throws(() => transformRuntimeBrushQueue(original, null), /Expected generated/);
  assert.throws(() => transformRuntimeBrushQueue(original, result.code), /duplicate batch/);
  for (const code of [
    original.replace(
      'this.queue.push({cid:e,inlineOnly:t})',
      'this.queue.push({cid:e,inlineOnly:!t})',
    ),
    original.replace('await Promise.all(e.queue.map', 'await Promise.all(e.queue.filter'),
    original.replace(
      'e.queue=[],i&&o&&e.editor.undo.exeCommand',
      'e.queue.splice(0),i&&o&&e.editor.undo.exeCommand',
    ),
  ])
    assert.throws(() => transformRuntimeBrushQueue(original, code), /unknown module/);
});
