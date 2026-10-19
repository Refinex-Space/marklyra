import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import { transformRuntimeFocus } from './runtime-focus.mjs';
import { transformRuntimePairing } from './runtime-pairing.mjs';
import { transformRuntimeSerialization } from './runtime-serialization.mjs';

const sourcePath = new URL('../../resources/editor/appsrc/main.js', import.meta.url);
const original = await readFile(sourcePath, 'utf8');
const digest = (value) => createHash('sha256').update(value).digest('hex');

test('brush focus capability requires exact artifact, unique module and unchanged AST', () => {
  for (const input of ['', null, 42, `${original}\n`])
    assert.throws(() => transformRuntimeFocus(input), /unknown original main.js SHA-256/);
  assert.throws(() => transformRuntimeFocus(original, null), /Expected generated runtime source/);
  const { metadata, code } = transformRuntimeFocus(original);
  const [start, end] = metadata.moduleRange;
  const [changedAt] = metadata.originalCallRanges[0];
  assert.throws(
    () =>
      transformRuntimeFocus(
        original,
        `${original.slice(0, changedAt)} ${original.slice(changedAt)}`,
      ),
    /unknown module 2b AST\/SHA-256/,
  );
  assert.throws(
    () => transformRuntimeFocus(original, `${original}\n${original.slice(start, end)}`),
    /ambiguous module 2b/,
  );
  assert.throws(
    () => transformRuntimeFocus(original, `var __MARKLYRA_RESTORE_BRUSH_CURSOR__;${original}`),
    /duplicate focus capability/,
  );
  assert.throws(() => transformRuntimeFocus(original, code), /duplicate focus capability/);
});

test('three exact edits compose with existing transforms; every other byte remains unchanged', async () => {
  const serialized = transformRuntimeSerialization(original).code;
  const paired = transformRuntimePairing(original, serialized).code;
  const transformed = transformRuntimeFocus(original, paired);
  const { metadata, code } = transformed;
  assert.equal(metadata.inputSha256, digest(paired));
  assert.equal(metadata.transformedSha256, digest(code));
  assert.equal(metadata.edits.length, 3);
  assert.deepEqual(
    metadata.edits.map((edit) => edit.role),
    ['brushNode', 'brushQueue', 'inline'],
  );
  assert.equal(metadata.untouchedCallRanges.length, 1);
  assert.deepEqual(metadata.originalCallRanges, [
    [119212, 119242],
    [120189, 120216],
    [131536, 131556],
  ]);
  let offset = 0;
  let cursor = 0;
  for (const edit of metadata.edits) {
    assert.equal(
      code.slice(cursor + offset, edit.start + offset),
      paired.slice(cursor, edit.start),
    );
    assert.equal(
      code.slice(edit.start + offset, edit.start + offset + edit.text.length),
      edit.text,
    );
    offset += edit.text.length - (edit.end - edit.start);
    cursor = edit.end;
  }
  assert.equal(code.slice(cursor + offset), paired.slice(cursor));
  const reverseEdits = metadata.edits.map((edit, index) => ({
    ...edit,
    outputStart:
      edit.start +
      metadata.edits
        .slice(0, index)
        .reduce((sum, previous) => sum + previous.text.length - (previous.end - previous.start), 0),
  }));
  let restored = code;
  for (const edit of reverseEdits.toReversed())
    restored =
      restored.slice(0, edit.outputStart) +
      paired.slice(edit.start, edit.end) +
      restored.slice(edit.outputStart + edit.text.length);
  assert.equal(restored, paired);
  assert.doesNotThrow(() => new Script(code));
  assert.equal(digest(await readFile(sourcePath)), metadata.originalSha256);
});

function invocation(edit, hook, options = {}) {
  const calls = [];
  const bookmark = { type: 'cursor', id: 'fixture', start: 2, end: 5 };
  const undo = {};
  const originalResult = Object.hasOwn(options, 'result') ? options.result : {};
  const original = function (...args) {
    calls.push('execute');
    assert.equal(this, undo);
    assert.equal(args.length, 1);
    assert.equal(args[0], options.expectedBookmark ?? bookmark);
    options.onExecute?.();
    if (options.failure) throw options.failure;
    return originalResult;
  };
  Object.defineProperty(undo, 'exeCommand', {
    get() {
      calls.push('command');
      return original;
    },
  });
  const editor = {};
  Object.defineProperty(editor, 'undo', {
    get() {
      calls.push('undo');
      return undo;
    },
  });
  const context = createContext({ window: {}, Reflect });
  const editorObject = edit.role === 'inline' ? context : {};
  Object.defineProperty(editorObject, edit.role === 'inline' ? 'r' : 'editor', {
    get() {
      calls.push('editor');
      return editor;
    },
  });
  if (edit.role === 'brushQueue') context.e = editorObject;
  else if (edit.role === 'brushNode')
    Object.defineProperty(
      context,
      'editor',
      Object.getOwnPropertyDescriptor(editorObject, 'editor'),
    );
  const argument = edit.role === 'brushNode' ? 't' : edit.role === 'brushQueue' ? 'o' : 'e';
  Object.defineProperty(context, argument, {
    get() {
      calls.push('bookmark');
      return bookmark;
    },
  });
  Object.defineProperty(context.window, '__MARKLYRA_RESTORE_BRUSH_CURSOR__', {
    get() {
      calls.push('hook');
      return typeof hook === 'function'
        ? (...args) => {
            calls.push('restore');
            return hook(editor, bookmark, args);
          }
        : hook;
    },
  });
  return { result: new Script(edit.text).runInContext(context), calls, originalResult };
}

for (const edit of transformRuntimeFocus(original).metadata.edits) {
  test(`${edit.role} absent/non-function hook preserves receiver, arguments, return and evaluation order`, () => {
    for (const value of [undefined, null, false, 1, {}]) {
      const result = invocation(edit, value);
      assert.equal(result.result, result.originalResult);
      assert.deepEqual(result.calls, ['editor', 'undo', 'command', 'bookmark', 'hook', 'execute']);
    }
  });

  test(`${edit.role} host receives exact objects once and can return any value without fallback`, () => {
    for (const expected of [undefined, null, false, true, 0, 'deferred', Promise.resolve(3)]) {
      const result = invocation(edit, (editor, bookmark, args) => {
        assert.equal(args.length, 3);
        assert.equal(args[0], editor);
        assert.equal(args[1], bookmark);
        assert.equal(typeof args[2], 'function');
        return expected;
      });
      assert.equal(result.result, expected);
      assert.deepEqual(result.calls, ['editor', 'undo', 'command', 'bookmark', 'hook', 'restore']);
    }
  });

  test(`${edit.role} host executor uses the captured method and receiver without reading getters again`, () => {
    for (const value of [undefined, false, 0, {}, Promise.resolve('native')]) {
      const result = invocation(
        edit,
        (editor, bookmark, args) => {
          assert.equal(args[0], editor);
          assert.equal(args[1], bookmark);
          return args[2](bookmark);
        },
        { result: value },
      );
      assert.equal(result.result, value);
      assert.deepEqual(result.calls, [
        'editor',
        'undo',
        'command',
        'bookmark',
        'hook',
        'restore',
        'execute',
      ]);
    }
  });

  test(`${edit.role} deferred executor accepts a new bookmark and retains its original receiver`, () => {
    const next = { type: 'cursor', id: 'replacement', start: 4, end: 8 };
    let execute;
    const result = invocation(
      edit,
      (_editor, _bookmark, args) => {
        execute = args[2];
        return false;
      },
      { expectedBookmark: next },
    );
    assert.equal(result.result, false);
    assert.deepEqual(result.calls, ['editor', 'undo', 'command', 'bookmark', 'hook', 'restore']);
    assert.equal(execute(next), result.originalResult);
    assert.deepEqual(result.calls, [
      'editor',
      'undo',
      'command',
      'bookmark',
      'hook',
      'restore',
      'execute',
    ]);
  });

  test(`${edit.role} host executor propagates the original failure once without retry`, () => {
    const failure = new Error('original cursor rejected');
    let attempts = 0;
    assert.throws(
      () =>
        invocation(edit, (_editor, bookmark, args) => args[2](bookmark), {
          failure,
          onExecute: () => attempts++,
        }),
      (error) => error === failure,
    );
    assert.equal(attempts, 1);
  });

  test(`${edit.role} propagates host failure without retrying the original command`, () => {
    const failure = new Error('fixture rejected');
    assert.throws(
      () =>
        invocation(edit, () => {
          throw failure;
        }),
      (error) => error === failure,
    );
  });
}
