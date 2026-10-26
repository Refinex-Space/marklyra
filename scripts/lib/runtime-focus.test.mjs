import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import { engineModule, expressionOf, hasHook, nodes, unique } from './runtime-test-source.mjs';

const wrappers = nodes(
  engineModule('render/brush-queue'),
  (node) =>
    node.type === 'CallExpression' &&
    node.callee.type === 'FunctionExpression' &&
    node.callee.params[0]?.name === '__marklyraBrushEditor' &&
    hasHook(node.callee, '__MARKLYRA_RESTORE_BRUSH_CURSOR__'),
);
const focusSites = wrappers.map((node) => ({
  role:
    node.arguments[0].type === 'Identifier'
      ? 'inline'
      : node.arguments[0].object.type === 'ThisExpression'
        ? 'brushNode'
        : 'brushQueue',
  editorBinding:
    node.arguments[0].type === 'Identifier'
      ? node.arguments[0].name
      : node.arguments[0].object.name,
  bookmarkBinding: unique(
    nodes(
      node,
      (child) =>
        child.type === 'CallExpression' &&
        child.callee.type === 'FunctionExpression' &&
        child.callee.params[1]?.name === '__marklyraBrushBookmark',
    ),
    'captured brush bookmark',
  ).arguments[1].name,
  text: expressionOf(node),
}));
test('the checked-in engine exposes exactly the three cursor ownership boundaries', () => {
  assert.deepEqual(
    focusSites.map((site) => site.role),
    ['brushNode', 'brushQueue', 'inline'],
  );
  for (const site of focusSites) assert.doesNotThrow(() => new Script(site.text));
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
  Object.defineProperty(editorObject, edit.role === 'inline' ? edit.editorBinding : 'editor', {
    get() {
      calls.push('editor');
      return editor;
    },
  });
  if (edit.role === 'brushQueue') context[edit.editorBinding] = editorObject;
  else if (edit.role === 'brushNode')
    Object.defineProperty(
      context,
      'editor',
      Object.getOwnPropertyDescriptor(editorObject, 'editor'),
    );
  const argument = edit.bookmarkBinding;
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

for (const edit of focusSites) {
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
