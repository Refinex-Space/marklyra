import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import { capability, engineModule, sourceOf } from './runtime-test-source.mjs';

const module = engineModule('56');
const moduleSource = sourceOf(module);
test('pairing module contains one cache-reset capability and executable source', () => {
  capability('__MARKLYRA_RESET_PAIRING__', module);
  assert.doesNotThrow(() => new Script(moduleSource));
});

function executeModule() {
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
  context.engineModules = {
    define(_id, _dependencies, _esm, callback) {
      factory = callback;
    },
  };
  new Script(moduleSource).runInContext(context);
  const require = (id) =>
    id === 'model/document-model'
      ? { Node: {}, TYPE: {} }
      : id === 'editing/undo-manager'
        ? { SnapFlag: { REPLACE: 2 } }
        : id === 'editing/smart-quotes'
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

test('the real surround factory records one content snapshot and filters the empty trailing one', () => {
  const { context, exports, editor, range } = executeModule();
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
      if (stack.length) Object.assign(stack.at(-1), { source: null, date: null, incomplete: null });
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
  assert.equal(stack.length, 1);
  assert.equal(editor.undo.index, stack.length - 1);
  assert.equal(stack[0].undo[1].json.content.text, 'Alpha beta');
  assert.equal(stack[0].redo[0].json.content.text, '*Alpha* beta');
  assert.deepEqual(stack[0].redo[1], cursor({ start: 1, end: 6 }));
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
