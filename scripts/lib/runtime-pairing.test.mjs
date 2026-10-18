import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import { transformRuntimePairing } from './runtime-pairing.mjs';
import { transformRuntimeSerialization } from './runtime-serialization.mjs';

const sourcePath = new URL('../../private/vendor/TypeMark/appsrc/main.js', import.meta.url);
const original = await readFile(sourcePath, 'utf8');
const digest = (value) => createHash('sha256').update(value).digest('hex');

test('reset capability requires exact original provenance and unchanged unique module 56', () => {
  for (const input of ['', null, 42, `${original}\n`])
    assert.throws(() => transformRuntimePairing(input), /unknown original main.js SHA-256/);
  const { metadata } = transformRuntimePairing(original);
  const [start] = metadata.moduleRange;
  const changed = `${original.slice(0, start + 80)} ${original.slice(start + 80)}`;
  assert.throws(() => transformRuntimePairing(original, changed), /unknown module 56 AST\/SHA-256/);
  assert.throws(
    () =>
      transformRuntimePairing(original, `${original}\n${original.slice(...metadata.moduleRange)}`),
    /ambiguous module 56/,
  );
  assert.throws(
    () => transformRuntimePairing(original, `var __MARKLYRA_RESET_PAIRING__;\n${original}`),
    /duplicate reset capability/,
  );
});

test('one insertion preserves original bodies and composes after serializer offsets move', async () => {
  const serialized = transformRuntimeSerialization(original);
  const transformed = transformRuntimePairing(original, serialized.code);
  const { metadata, code } = transformed;
  assert.equal(
    metadata.moduleSha256,
    'aadb0afb139ae45cef5b45c1e7625866c05692ab60ffb0614b7347d2dc2b0f40',
  );
  assert.equal(
    metadata.factorySha256,
    '96bdb643b8f5299c2f3283b32938fbfba9627c5c25bfa30021e1e9d715677969',
  );
  assert.equal(metadata.inputSha256, digest(serialized.code));
  assert.equal(metadata.transformedSha256, digest(code));
  assert.equal(metadata.originalInsertionUtf16Offset, 649646);
  assert.equal(
    metadata.insertionUtf16Offset - metadata.originalInsertionUtf16Offset,
    serialized.code.length - original.length,
  );
  const [edit] = metadata.edits;
  assert.ok(code.slice(0, edit.start) === serialized.code.slice(0, edit.start));
  assert.ok(code.slice(edit.start + edit.text.length) === serialized.code.slice(edit.start));
  assert.equal(metadata.insertedBytes, Buffer.byteLength(edit.text));
  assert.deepEqual(metadata.references, {
    handlePair: { cache: 'c', test: 1, assign: 1, returned: 1 },
    surroundPair: { cache: 's', test: 1, assign: 1, returned: 1 },
    tryRemovePairStart: { cache: 'l', test: 1, assign: 1, returned: 1 },
  });
  assert.doesNotThrow(() => new Script(code));
  assert.throws(() => transformRuntimePairing(original, code), /unknown module 56 AST\/SHA-256/);
  assert.equal(digest(await readFile(sourcePath)), metadata.originalSha256);
});

function executeModule(transformed = true) {
  const { code, metadata } = transformRuntimePairing(original);
  const patterns = [],
    exports = {};
  const element = {
    0: {},
    length: 1,
    find: () => ({ length: 0 }),
    closest: (selector) => (selector.includes('md-def-content') ? { length: 0 } : element),
    rawText: () => '**',
  };
  const options = { noPairingMatch: false, autoPairExtendSymbol: true, enableInlineMath: true };
  const context = createContext({
    File: { option: options },
    $: () => element,
    self: {},
    console: { debug() {} },
    RegExp: class extends RegExp {
      constructor(pattern, flags) {
        super(pattern, flags);
        patterns.push(pattern);
      }
    },
  });
  let factory;
  context.$__System = {
    registerDynamic(_id, _dependencies, _esm, callback) {
      factory = callback;
    },
  };
  const [start, end] = metadata.moduleRange;
  new Script(
    transformed
      ? code.slice(start, end + metadata.edits[0].text.length)
      : original.slice(...metadata.originalModuleRange),
  ).runInContext(context);
  const require = (id) =>
    id === '13'
      ? { Node: {}, TYPE: {} }
      : id === '1b'
        ? { SnapFlag: { REPLACE: 2 } }
        : id === '1e'
          ? {
              userQuote: (index) => (index === 0 ? '"' : "'"),
              shouldTriggerReplaceQuote: () => false,
            }
          : {};
  factory.call(context, require, exports, {});
  const editor = {
    undo: { endSnap() {}, addSnap() {} },
    findElemById: () => element,
    findNodeByElem: () => {
      throw new Error('surround-branch-reached');
    },
  };
  const range = {
    toString: () => 'x',
    commonAncestorContainer: {},
    endOffset: 0,
    getBookmark: () => ({ start: 0, end: 1 }),
    moveToBookmark(value) {
      this.lastBookmark = value;
    },
  };
  return { context, options, patterns, exports, editor, range };
}

test('read-only capability resets all three real caches without modifying options', () => {
  const { context, options, patterns, exports, editor, range } = executeModule();
  const warm = () => {
    exports.handlePair(editor, 'x', { cid: '1' }, { start: 0, end: 0 });
    exports.surroundPair(editor, 'x', range);
    exports.tryRemovePairStart(editor, range);
  };
  const before = JSON.stringify(options);
  warm();
  assert.equal(patterns.length, 3);
  warm();
  assert.equal(patterns.length, 3);
  const capability = context.__MARKLYRA_RESET_PAIRING__;
  assert.equal(typeof capability, 'function');
  assert.ok(Object.isFrozen(capability));
  const descriptor = Object.getOwnPropertyDescriptor(context, '__MARKLYRA_RESET_PAIRING__');
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.configurable, false);
  assert.equal(descriptor.enumerable, false);
  capability();
  warm();
  assert.equal(patterns.length, 6);
  assert.equal(JSON.stringify(options), before);
  assert.throws(() =>
    new Script('"use strict";__MARKLYRA_RESET_PAIRING__=null').runInContext(context),
  );
});

test('the real surround factory retains its original two snapshots and filters only the empty trailing one', () => {
  const results = [];
  for (const transformed of [false, true]) {
    const { context, exports, editor, range } = executeModule(transformed);
    let text = 'Alpha beta',
      selected = { start: 0, end: 5 },
      pending;
    const model = (value) => ({
      id: 'n0',
      content: { type: 'paragraph', text: value },
      relation: {},
      children: [],
    });
    const cursor = (value) => ({ type: 'cursor', id: 'n0', ...value });
    const stack = [];
    Object.assign(editor.undo, {
      commandStack: stack,
      index: -1,
      setIndex(value) {
        this.index = value;
      },
      addSnap(_id, flag) {
        if (flag === 0) {
          pending = { text, cursor: { ...selected } };
          return;
        }
        if (stack.length)
          Object.assign(stack.at(-1), { source: null, date: null, incomplete: null });
        stack.push({
          undo: [cursor(pending.cursor), { type: 'replace', id: 'n0', json: model(pending.text) }],
          redo: [{ type: 'replace', id: 'n0', json: model(text) }, cursor(selected)],
          source: `n0#${flag}`,
        });
        pending = { text, cursor: { ...selected } };
        this.index = stack.length - 1;
      },
    });
    editor.findNodeByElem = () => ({ cid: 'n0' });
    context.document = { createTextNode: (value) => ({ textContent: value }) };
    range.getBookmark = () => ({ start: 0, end: 5 });
    editor.selection = {
      deRange() {},
      rangy: {
        createRange() {
          let bookmark;
          return {
            moveToBookmark(value) {
              bookmark = { ...value };
            },
            insertNode(node) {
              text = text.slice(0, bookmark.start) + node.textContent + text.slice(bookmark.start);
            },
            insertNodeAtEnd(node) {
              text = text.slice(0, bookmark.end) + node.textContent + text.slice(bookmark.end);
            },
            select() {
              selected = { ...bookmark };
            },
          };
        },
      },
    };
    assert.equal(exports.surroundPair(editor, '*', range), true);
    assert.equal(text, '*Alpha* beta');
    results.push(stack.length);
    assert.equal(editor.undo.index, stack.length - 1);
    assert.equal(stack[0].undo[1].json.content.text, 'Alpha beta');
    assert.equal(stack[0].redo[0].json.content.text, '*Alpha* beta');
    assert.deepEqual(stack[0].redo[1], cursor({ start: 1, end: 6 }));
  }
  assert.deepEqual(results, [2, 1]);
});

test('warming ordinary pairing before enabling Markdown reproduces stale caches until reset', () => {
  const { context, options, exports, editor, range } = executeModule();
  options.autoPairExtendSymbol = false;
  exports.surroundPair(editor, 'x', range);
  exports.tryRemovePairStart(editor, range);
  options.autoPairExtendSymbol = true;
  range.toString = () => '*';
  assert.equal(exports.surroundPair(editor, '*', range), undefined);
  assert.equal(exports.tryRemovePairStart(editor, range), undefined);
  context.__MARKLYRA_RESET_PAIRING__();
  assert.throws(() => exports.surroundPair(editor, '*', range), /surround-branch-reached/);
  assert.equal(exports.tryRemovePairStart(editor, range), range);
  assert.equal(range.lastBookmark.end, 2);
});
