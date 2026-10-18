import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import { transformRuntimeContextCursor } from './runtime-context-cursor.mjs';
import { transformRuntimeFocus } from './runtime-focus.mjs';
import { transformRuntimePairing } from './runtime-pairing.mjs';
import { transformRuntimeSerialization } from './runtime-serialization.mjs';

const sourcePath = new URL('../../private/vendor/TypeMark/appsrc/main.js', import.meta.url);
const original = await readFile(sourcePath, 'utf8');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const transformed = transformRuntimeContextCursor(original);

test('source context replay requires exact provenance, unique unchanged module and callback', () => {
  for (const value of ['', null, 42, `${original}\n`])
    assert.throws(() => transformRuntimeContextCursor(value), /unknown original main.js SHA-256/);
  assert.throws(
    () => transformRuntimeContextCursor(original, null),
    /Expected generated runtime source/,
  );
  const { metadata, code } = transformed;
  const [start, end] = metadata.moduleRange;
  const [at] = metadata.originalCallRange;
  assert.throws(
    () => transformRuntimeContextCursor(original, `${original.slice(0, at)} ${original.slice(at)}`),
    /unknown module 49 AST\/SHA-256/,
  );
  assert.throws(
    () => transformRuntimeContextCursor(original, `${original}\n${original.slice(start, end)}`),
    /ambiguous module 49/,
  );
  assert.throws(
    () =>
      transformRuntimeContextCursor(original, `var __MARKLYRA_REPLAY_SOURCE_CONTEXT__;${original}`),
    /duplicate replay capability/,
  );
  assert.throws(() => transformRuntimeContextCursor(original, code), /duplicate replay capability/);
});

test('one expression replacement composes with serializer/pairing/brush and preserves every other byte', async () => {
  const prior = transformRuntimeFocus(
    original,
    transformRuntimePairing(original, transformRuntimeSerialization(original).code).code,
  ).code;
  const { code, metadata } = transformRuntimeContextCursor(original, prior);
  assert.equal(metadata.inputSha256, digest(prior));
  assert.equal(metadata.transformedSha256, digest(code));
  assert.equal(metadata.delay, 180);
  assert.deepEqual(metadata.originalCallRange, [401420, 401451]);
  assert.equal(metadata.edits.length, 1);
  const [edit] = metadata.edits;
  assert.equal(code.slice(0, edit.start), prior.slice(0, edit.start));
  assert.equal(code.slice(edit.start, edit.start + edit.text.length), edit.text);
  assert.equal(code.slice(edit.start + edit.text.length), prior.slice(edit.end));
  assert.equal(
    code.slice(0, edit.start) +
      prior.slice(edit.start, edit.end) +
      code.slice(edit.start + edit.text.length),
    prior,
  );
  assert.doesNotThrow(() => new Script(code));
  assert.equal(digest(await readFile(sourcePath)), metadata.originalSha256);
});

function fixture({ hook, failure, sourceMode = true, adapted = true } = {}) {
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
    e: { inSourceMode: sourceMode },
    File: { isNodeHtml: false },
    setTimeout(callback, delay) {
      events.push('schedule');
      timers.push({ callback, delay });
      return 19;
    },
  });
  const { code, metadata } = transformed;
  const [edit] = metadata.edits;
  const [start, end] = adapted ? metadata.handlerRange : metadata.originalHandlerRange;
  const text = adapted
    ? code.slice(start, end + edit.text.length - (edit.end - edit.start))
    : original.slice(start, end);
  const handler = new Script(`(${text})`).runInContext(context);
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
  const original = fixture({ adapted: false });
  assert.equal(original.timers[0].delay, 180);
  original.run();
  assert.deepEqual(original.events, ['cursor:from', 'cursor:to', 'schedule', 'setter', 'execute']);
});

test('source-mode guard still schedules nothing outside source mode', () => {
  for (const adapted of [false, true]) {
    const f = fixture({ sourceMode: false, adapted });
    assert.deepEqual(f.events, []);
    assert.equal(f.timers.length, 0);
  }
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
