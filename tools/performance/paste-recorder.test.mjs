import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { installPasteRecorder } from './paste-recorder.mjs';

function fixture({ queue = [], brushQueue, missing = false } = {}) {
  let now = 0,
    nextId = 1;
  const timers = new Map();
  const brush = {
    queue,
    brushQueue: brushQueue ?? (() => Promise.resolve()),
    scheduleNext() {
      this.timerID = context.setTimeout(async () => {
        await this.brushQueue();
        this.scheduleNext();
      }, 500);
    },
  };
  if (missing) delete brush.brushQueue;
  const context = vm.createContext({
    location: { origin: 'http://fixture' },
    performance: { now: () => now },
    document: { addEventListener() {} },
    Promise,
    setTimeout(callback, delay = 0, ...args) {
      const id = nextId++;
      timers.set(id, { callback, at: now + Number(delay), args });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    editor: { brush, selection: { scrollAdjust() {} }, getMarkdown() {} },
    File: { sync() {} },
  });
  context.window = context;
  vm.runInContext(`(${installPasteRecorder.toString()})({origin:'http://fixture'})`, context);
  const state = context.__pasteBench;
  state.installMethods();
  const microtasks = async () => {
    for (let count = 0; count < 8; count++) await Promise.resolve();
  };
  const advance = async (until) => {
    for (;;) {
      const due = [...timers]
        .filter(([, item]) => item.at <= until)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, item] = due;
      timers.delete(id);
      now = item.at;
      const result = Reflect.apply(item.callback, context, item.args);
      // Model the native scheduler ignoring a callback's return. Rejections are
      // observed here only to keep deliberate failure cases local to this test.
      if (result instanceof Promise) result.catch(() => {});
      await microtasks();
    }
    now = until;
    await microtasks();
  };
  const drain = (options = {}) => {
    const result = { settled: false, error: undefined, value: undefined };
    result.promise = state
      .drain({
        causes: ['paste', 'typing'],
        anchor: 0,
        minimumMs: 2600,
        quietMs: 250,
        maximumMs: 15000,
        ...options,
      })
      .then(
        (value) => Object.assign(result, { settled: true, value }),
        (error) => Object.assign(result, { settled: true, error }),
      );
    return result;
  };
  return { context, state, brush, advance, microtasks, drain, timers };
}

test('drain waits for queued work and an unresolved native brush Promise, then its quiet period', async () => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const queue = [{ cid: 'edited' }];
  const f = fixture({
    queue,
    brushQueue() {
      return held.then(() => {
        this.queue.length = 0;
      });
    },
  });
  f.state.phaseTo('paste');
  f.brush.scheduleNext();
  await f.advance(2600);
  const drain = f.drain();
  await f.microtasks();
  assert.equal(drain.settled, false, 'in-flight native work was prematurely reported complete');
  assert.equal(f.state.snapshot().brush.inFlight.length, 1);
  assert.equal(f.state.snapshot().brush.queueLength, 1);
  await f.advance(2700);
  release();
  await f.microtasks();
  await f.advance(2949);
  assert.equal(drain.settled, false);
  await f.advance(2975);
  assert.equal(drain.settled, true);
  assert.equal(drain.error, undefined);
  assert.equal(f.state.snapshot().brush.inFlight.length, 0);
});

test('an empty perpetual brush timer does not prevent convergence', async () => {
  const f = fixture();
  f.state.phaseTo('paste');
  f.brush.scheduleNext();
  await f.advance(2600);
  const drain = f.drain();
  await drain.promise;
  assert.equal(drain.error, undefined);
  assert.equal(drain.value.excludedBackground.length, 1);
  assert.equal(f.state.snapshot().brush.queueLength, 0);
});

test('a nonempty queue blocks convergence even before its perpetual timer fires', async () => {
  const f = fixture({ queue: [{ cid: 'waiting' }] });
  await f.advance(2600);
  const drain = f.drain();
  await f.microtasks();
  assert.equal(drain.settled, false);
  await f.advance(17625);
  assert.match(drain.error?.message ?? '', /brush.*queue|queue.*brush/i);
});

test('the brush receiver, arguments and returned Promise identity remain original', async () => {
  let receiver, args, release;
  const original = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture({
    brushQueue(...values) {
      receiver = this;
      args = values;
      return original;
    },
  });
  const result = f.brush.brushQueue('first', 2);
  assert.equal(result, original);
  assert.equal(receiver, f.brush);
  assert.deepEqual(args, ['first', 2]);
  const dispatched = f.state.snapshot().brush.calls[0];
  assert.equal(dispatched.dispatchEndedAt, 0);
  assert.equal(dispatched.asyncSettledAt, undefined);
  release('unchanged');
  assert.equal(await result, 'unchanged');
  await f.microtasks();
  assert.equal(f.state.snapshot().brush.calls[0].asyncSettledAt, 0);
});

test('brush rejection preserves the original rejection and fails drain instead of hiding it', async () => {
  const failure = new Error('native brush rejected');
  let reject;
  const original = new Promise((_, fail) => {
    reject = fail;
  });
  const f = fixture({
    brushQueue() {
      return original;
    },
  });
  const result = f.brush.brushQueue();
  assert.equal(result, original);
  reject(failure);
  await assert.rejects(result, (error) => error === failure);
  await f.advance(2600);
  const drain = f.drain();
  await drain.promise;
  assert.match(drain.error?.message ?? '', /native brush rejected/);
  assert.equal(f.state.snapshot().brush.calls[0].status, 'rejected');
});

test('an undefined brush rejection is still a failure', async () => {
  const original = Promise.reject(undefined);
  const f = fixture({
    brushQueue() {
      return original;
    },
  });
  assert.equal(f.brush.brushQueue(), original);
  await f.advance(2600);
  const drain = f.drain();
  await drain.promise;
  assert.match(drain.error?.message ?? '', /Native brush failed/);
});

test('unknown, replaced or missing native brush ABI fails validation', async () => {
  for (const kind of ['missing', 'queue', 'owner']) {
    const f = fixture({ missing: kind === 'missing' });
    if (kind === 'queue') f.brush.queue = {};
    if (kind === 'owner') f.context.editor.brush = { ...f.brush };
    await f.advance(2600);
    const drain = f.drain();
    await drain.promise;
    assert.match(drain.error?.message ?? '', /brush.*unavailable/i, kind);
  }
});

test('a prior typing timer remains part of the paste completion window', async () => {
  const f = fixture();
  let ran = false;
  f.state.phaseTo('typing');
  f.context.setTimeout(() => {
    ran = true;
  }, 3000);
  f.state.phaseTo('paste');
  await f.advance(2600);
  const drain = f.drain();
  await f.microtasks();
  assert.equal(drain.settled, false);
  await f.advance(3249);
  assert.equal(ran, true);
  assert.equal(drain.settled, false);
  await f.advance(3275);
  assert.equal(drain.settled, true);
  assert.equal(drain.error, undefined);
});

test('allCauses waits for unlisted pending work and its later quiet period', async () => {
  for (const cause of ['startup', 'typing-drain', 'unattributed']) {
    const f = fixture();
    f.state.phaseTo(cause);
    f.context.setTimeout(() => {}, 3000);
    f.state.phaseTo('paste');
    await f.advance(2600);
    const selectedOnly = f.drain();
    await selectedOnly.promise;
    assert.equal(selectedOnly.error, undefined, 'default still uses the selected causes');
    const all = f.drain({ allCauses: true });
    await f.microtasks();
    assert.equal(all.settled, false, `${cause} pending work was omitted`);
    await f.advance(3249);
    assert.equal(all.settled, false, `${cause} activity was omitted from the quiet period`);
    await f.advance(3275);
    assert.equal(all.settled, true);
    assert.equal(all.error, undefined);
    assert.equal(all.value.allCauses, true);
  }
});

test('timer dispatch retains its delay, arguments, receiver and Promise without claiming settlement', () => {
  const f = fixture();
  const promise = new Promise(() => {});
  let receiver, values;
  const id = f.context.setTimeout(
    function (...args) {
      receiver = this;
      values = args;
      return promise;
    },
    123,
    'one',
    2,
  );
  const timer = f.timers.get(id);
  assert.equal(timer.at, 123);
  assert.equal(Reflect.apply(timer.callback, f.context, timer.args), promise);
  assert.equal(receiver, f.context);
  assert.deepEqual(values, ['one', 2]);
  assert.equal(f.state.timers[0].status, 'dispatch-completed');
  assert.equal(f.state.timers[0].dispatchEndedAt, 0);
  assert.equal(f.state.timers[0].asyncSettledAt, undefined);
});

test('recorder decoration never changes native serializer prototype bindings', () => {
  const f = fixture();
  const nodeToMark = () => 'node',
    mapToMark = () => 'map';
  const nodePrototype = { toMark: nodeToMark },
    mapPrototype = { toMark: mapToMark };
  f.context.__MARKLYRA_NATIVE_SERIALIZATION__ = {
    nodePrototype,
    mapPrototype,
    nodeToMark,
    mapToMark,
  };
  assert.equal(f.state.snapshot().binding.node, true);
  assert.equal(f.state.snapshot().binding.map, true);
  assert.equal(nodePrototype.toMark, nodeToMark);
  assert.equal(mapPrototype.toMark, mapToMark);
});
