import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import { engineModule, expressionOf, hasHook, nodes, unique } from './runtime-test-source.mjs';

const handler = unique(
  nodes(
    engineModule('editing/source-mode'),
    (node) =>
      node.type === 'FunctionExpression' &&
      node.params.length === 2 &&
      hasHook(node, '__MARKLYRA_REPLAY_SOURCE_CONTEXT__'),
  ),
  'source context handler',
);
const handlerSource = expressionOf(handler);
const sourceState = unique(
  nodes(
    handler,
    (node) => node.type === 'MemberExpression' && node.property.name === 'inSourceMode',
  ),
  'source mode state',
).object.name;

function fixture({ hook, failure, sourceMode = true } = {}) {
  const events = [],
    timers = [];
  const from = { line: 0, ch: 1 },
    to = { line: 0, ch: 4 },
    event = { marker: 'same native event' };
  const result = {};
  let executions = 0;
  const cm = {
    getCursor(edge) {
      events.push(`cursor:${edge}`);
      return edge === 'from' ? from : to;
    },
  };
  Object.defineProperty(cm, 'setSelection', {
    get() {
      events.push('setter');
      return function (...args) {
        events.push('execute');
        executions++;
        assert.equal(this, cm);
        assert.equal(args.length, 3);
        assert.equal(args[0], from);
        assert.equal(args[1], to);
        assert.deepEqual(Object.keys(args[2]), ['scroll']);
        assert.equal(args[2].scroll, false);
        if (failure) throw failure;
        return result;
      };
    },
  });
  const window = {};
  Object.defineProperty(window, '__MARKLYRA_REPLAY_SOURCE_CONTEXT__', {
    get() {
      events.push('hook');
      return typeof hook === 'function'
        ? (...args) => {
            events.push('host');
            return hook({ cm, event, from, to, args });
          }
        : hook;
    },
  });
  const context = createContext({
    window,
    Reflect,
    [sourceState]: { inSourceMode: sourceMode },
    File: { isNodeHtml: false },
    setTimeout(callback, delay) {
      events.push('schedule');
      timers.push({ callback, delay });
      return 19;
    },
  });
  const handler = new Script(handlerSource).runInContext(context);
  assert.equal(Reflect.apply(handler, undefined, [cm, event]), undefined);
  return {
    events,
    timers,
    run: () => Reflect.apply(timers[0].callback, window, []),
    executions: () => executions,
    result,
  };
}

test('unclaimed source context preserves original scheduling, receiver, endpoints and options', () => {
  for (const hook of [undefined, null, false, 1, {}]) {
    const f = fixture({ hook });
    assert.deepEqual(f.events, ['cursor:from', 'cursor:to', 'schedule']);
    assert.equal(f.timers.length, 1);
    assert.equal(f.timers[0].delay, 180);
    assert.equal(f.run(), undefined);
    assert.deepEqual(f.events, [
      'cursor:from',
      'cursor:to',
      'schedule',
      'setter',
      'hook',
      'execute',
    ]);
    assert.equal(f.executions(), 1);
  }
});

test('source-mode guard still schedules nothing outside source mode', () => {
  const f = fixture({ sourceMode: false });
  assert.deepEqual(f.events, []);
  assert.equal(f.timers.length, 0);
});

test('host gets the original event and CM at callback time and can suppress only that replay', () => {
  for (const value of [undefined, false, 0, Promise.resolve('owned')]) {
    const f = fixture({
      hook: ({ cm, event, args }) => {
        assert.equal(args.length, 3);
        assert.equal(args[0], cm);
        assert.equal(args[1], event);
        assert.equal(typeof args[2], 'function');
        return value;
      },
    });
    assert.deepEqual(f.events, ['cursor:from', 'cursor:to', 'schedule']);
    assert.equal(f.run(), undefined);
    assert.deepEqual(f.events, ['cursor:from', 'cursor:to', 'schedule', 'setter', 'hook', 'host']);
    assert.equal(f.executions(), 0);
  }
});

test('a delegated executor reuses one captured setter/receiver and original arguments', () => {
  let execute;
  const f = fixture({
    hook: ({ args }) => {
      execute = args[2];
      return false;
    },
  });
  f.run();
  assert.equal(f.executions(), 0);
  assert.equal(execute(), f.result);
  assert.deepEqual(f.events, [
    'cursor:from',
    'cursor:to',
    'schedule',
    'setter',
    'hook',
    'host',
    'execute',
  ]);
  assert.equal(f.executions(), 1);
});

test('fallback and host executor preserve the original exception once', () => {
  for (const delegated of [false, true]) {
    const failure = new Error('original selection failed');
    const f = fixture({ failure, hook: delegated ? ({ args }) => args[2]() : undefined });
    assert.throws(
      () => f.run(),
      (error) => error === failure,
    );
    assert.equal(f.executions(), 1);
    assert.equal(f.events.filter((x) => x === 'setter').length, 1);
  }
});

test('host failure never falls back to an additional original selection write', () => {
  const failure = new Error('host rejected');
  const f = fixture({
    hook: () => {
      throw failure;
    },
  });
  assert.throws(
    () => f.run(),
    (error) => error === failure,
  );
  assert.equal(f.executions(), 0);
});
