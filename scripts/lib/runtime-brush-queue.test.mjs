import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext, Script } from 'node:vm';
import {
  engineImportBinding,
  engineModule,
  member,
  nodes,
  sourceOf,
  unique,
} from './runtime-test-source.mjs';

const module = engineModule('render/brush-queue');
const queueMethod = unique(
  nodes(module, (node) => node.type === 'Property' && node.key?.name === 'brushQueue'),
  'brushQueue method',
).value;
const runnerBinding = unique(
  nodes(
    queueMethod,
    (node) => node.type === 'AwaitExpression' && member(node.argument?.callee, 'call'),
  ),
  'awaited brush runner',
).argument.callee.object.name;
const corrected = Object.fromEntries(
  ['brushQueue', 'addToQueue', 'restart'].map((name) => {
    const method = unique(
      nodes(
        module,
        (node) =>
          node.type === 'Property' &&
          node.key?.name === name &&
          node.value.type === 'FunctionExpression',
      ),
      name,
    ).value;
    return [name, sourceOf(method)];
  }),
);
function fixture(work = async () => false, sources = corrected) {
  const effects = { expanded: 0, autocomplete: 0, restored: 0, ran: 0, cids: [] };
  const context = {
    File: { isLocked: false },
    console: { debug() {} },
    [engineImportBinding('render/brush-queue', 'shared/utilities')]: {
      isNullOrEmpty: (value) => value === null || value === undefined || value === '',
    },
    [runnerBinding]: function (cid, ...args) {
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

test('the integrated queue keeps cursor restoration and expansion after a consumed batch', async () => {
  const { brush, effects } = fixture(async () => true);
  brush.addToQueue('first');
  await brush.brushQueue();
  assert.equal(effects.restored, 1);
  assert.equal(effects.expanded, 1);
  assert.equal(brush.queue.length, 0);
  for (const source of Object.values(corrected))
    assert.doesNotThrow(() => new Script(`(${source})`));
});
