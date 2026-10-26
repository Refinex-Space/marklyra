import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'acorn';
import { readableJavaScript } from './javascript-readability.mjs';

function result(source, input) {
  const trace = [];
  const context = {
    input,
    trace,
    record(value) {
      trace.push(value);
      return value;
    },
  };
  try {
    return { value: runInNewContext(source, context, { timeout: 1000 }), trace };
  } catch (error) {
    return { thrown: String(error), trace };
  }
}

test('expanded branches retain falsy values, coercions, return values and side-effect order', () => {
  const bodies = [
    'input && (record("yes"), record(input)); return record("end")',
    'input || (record("no"), record(input)); return record("end")',
    'input ? (record("yes"), record(1)) : (record("no"), record(2)); return 3',
    'return record("start"), input ? (record(1), input) : (record(2), input)',
    'if ((record("test"), input)) return record(1), input; else return record(2), input',
    'return input && (record(1), input)',
    'return input || (record(2), input)',
    'if(input) throw (record("throw"), Error("expected")); return !0',
  ];
  for (const body of bodies)
    for (const input of [undefined, null, false, 0, -0, NaN, '', true, 7, 'x']) {
      const source = `(function(){${body}})()`;
      assert.deepEqual(result(readableJavaScript(source), input), result(source, input), body);
    }
});

test('loops, labelled control flow, switch fallthrough, closures and receiver binding are preserved', () => {
  const fixtures = [
    '(function(){var total=0; for(var i=0;i<5;i++) i%2&&(total+=i,record(i));return total})()',
    '(function(){var i=0; outer:while(i<5){i++;if(i===2)continue outer;if(i===4)break outer;record(i)}return i})()',
    '(function(){var i=0;do i++,record(i);while(i<3);return i})()',
    '(function(){switch(input){case 1: record(1),record(2);case 2:record(3);break;default: record(4)}return input})()',
    '(function(){var x=2;return record("capture"),function(){return ++x}})()()',
    '(function(){var obj={value:7,read:function(){return this.value}};return record("read"),obj.read()})()',
    '(function(){"use strict";return record("strict"),this})()',
  ];
  for (const source of fixtures)
    for (const input of [0, 1, 2])
      assert.deepEqual(result(readableJavaScript(source), input), result(source, input), source);
});

test('the maintained module format and comments survive normalization', () => {
  const source =
    '// module contract\nexport default function initialize(){"use strict"; return !1;}';
  const output = readableJavaScript(source, { module: true });
  assert.match(output, /module contract/);
  assert.match(output, /export default function initialize/);
  assert.match(output, /return false/);
  assert.equal(readableJavaScript(output, { module: true }), output);
});

test('split string expressions cannot introduce a strict-mode directive', () => {
  const fixtures = [
    '(function(){("use strict", record("first")); return this === globalThis})()',
    '(function(){return "use strict", this === globalThis})()',
    '(function(){"use strict", record("first"); var assigned = 7; return this === globalThis})()',
    '(function(){("use strict", record("first")); return function(){return this === globalThis}})()()',
  ];
  for (const source of fixtures)
    assert.deepEqual(result(readableJavaScript(source)), result(source), source);
});

test('script completion values remain observable through direct and indirect eval', () => {
  const fixtures = [
    'input && record(7)',
    'input || record(7)',
    'input ? record(7) : record(8)',
    '{ record(1); input && record(2); }',
    'if (true) { input && record(2); } else { record(3); }',
    'switch (input) { case 0: false && record(1); break; default: record(2); }',
    'var index=0; while(index++<2) input && record(index);',
  ];
  for (const source of fixtures)
    for (const input of [false, 0, '', undefined, true, 7]) {
      const normalized = readableJavaScript(source);
      assert.deepEqual(result(normalized, input), result(source, input), source);
      assert.deepEqual(
        result(`eval(${JSON.stringify(normalized)})`, input),
        result(`eval(${JSON.stringify(source)})`, input),
      );
      assert.deepEqual(
        result(`(0,eval)(${JSON.stringify(normalized)})`, input),
        result(`(0,eval)(${JSON.stringify(source)})`, input),
      );
    }
});

test('factory fragments may explicitly discard script completion while preserving effects', () => {
  const source = 'var shared=1; input && (shared+=2, record(shared));';
  const normalized = readableJavaScript(source, { discardScriptCompletion: true });
  assert.match(normalized, /if \(input\)/);
  for (const input of [false, true]) {
    assert.deepEqual(
      result(`(function(){${normalized} return shared;})()`, input),
      result(`(function(){${source} return shared;})()`, input),
    );
  }
});

test('Annex B bare function declarations are rejected before blockification', () => {
  for (const source of [
    'if (input) function legacy() {}',
    '(function(){if (input) function legacy() {}; return typeof legacy})()',
    'legacy: function legacy() {}',
  ])
    assert.throws(() => readableJavaScript(source), /Annex B/);
});

test('function names, labels, finally completions and serialized callback execution survive expansion', () => {
  const fixtures = [
    '(function(){var callback; input && (callback = function(){return 7}); return callback && callback.name})()',
    '(function(){var callback = function original(){return record(1),input ? 7 : 8}; return eval("(" + callback.toString() + ")")()})()',
    '(function(){var callbacks={method(){return input ? 1 : 2}}; return record(callbacks.method.name), callbacks.method()})()',
    '(function(){try{return record(1), input}finally{input && record(2)}})()',
    '(function(){var n=0; outer:for(;n<3;n++) { inner: { if(input) break inner; record(n),record("body"); } if(n===1) continue outer; }return n})()',
    '(function(){var value=3; return eval("value"), value ? (record(1),value) : 0})()',
  ];
  for (const source of fixtures)
    for (const input of [0, false, true, 7])
      assert.deepEqual(result(readableJavaScript(source), input), result(source, input), source);
});

test('comments, regular expressions and strings remain intact without duplication', () => {
  const source = `(function(){
    /* first */ (record(1), /* between */ record(2));
    if ((record('test'), input)) return /* branch */ input ? /* yes */ (record(3), /* tail */ 7) : /* no */ 8;
    // preserve the next expression
    record(/https?:\\/\\/[^ ]+/.source), record('/* not a comment */');
    return (!/* boolean */0);
  })()`;
  const output = readableJavaScript(source);
  const commentValues = (text) => {
    const comments = [];
    parse(text, { ecmaVersion: 'latest', onComment: comments });
    return comments.map((comment) => [comment.type, comment.value]);
  };
  assert.deepEqual(commentValues(output), commentValues(source));
  assert.equal(readableJavaScript(output), output);
  for (const input of [0, 1]) assert.deepEqual(result(output, input), result(source, input));
});

test('value expressions split into statements retain expression grammar and inferred names', () => {
  const fixtures = [
    '(function(){return function(){return record(1)}(), 7})()',
    '(function(){return {run:function(){return record(1)}}.run(), 7})()',
    '(function(){return class Example{}.name, 7})()',
    '(function(){var let=[1];return let[0], 7})()',
    '(function(){return function named(){}.name, record("end")})()',
  ];
  for (const source of fixtures) {
    const output = readableJavaScript(source);
    assert.deepEqual(result(output), result(source), source);
    assert.equal(readableJavaScript(output), output);
  }
});
