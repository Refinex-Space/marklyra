import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { verifyBindingRenames } from './javascript-bindings.mjs';

const verify = (before, after) => verifyBindingRenames('fixture.js', before, after);

test('renaming nested bindings preserves closures and shorthand property names', () => {
  const before = '(function(e){var t=2; return {e, run:function(n){return e+t+n}}})(3)';
  const after =
    '(function(initial){var increment=2; return {e:initial, run:function(value){return initial+increment+value}}})(3)';
  assert.equal(verify(before, after), 3);
  for (const code of [before, after]) {
    const value = runInNewContext(code);
    assert.deepEqual(Object.keys(value), ['e', 'run']);
    assert.equal(value.run(4), 9);
  }
});

test('a local rename cannot capture an outer reference or free host name', () => {
  assert.throws(
    () =>
      verify(
        'function f(e){return function(t){return e+t}}',
        'function f(value){return function(value){return value+value}}',
      ),
    /Binding|binding/,
  );
  assert.throws(
    () => verify('function f(e){return e+host}', 'function f(host){return host+host}'),
    /binding/,
  );
});

test('property keys, module identifiers and execution order stay part of the contract', () => {
  for (const after of [
    '(function(value){return {value:value}})(1)',
    '(function(value){return {e:value}})(2)',
  ])
    assert.throws(() => verify('(function(e){return {e:e}})(1)', after), /structure/);
  assert.throws(() => verify('first(); second();', 'second(); first();'), /structure/);
});

test('direct eval and reflected or inferred function names are preserved', () => {
  for (const [before, after] of [
    ['function f(e){return eval("e")}', 'function f(value){return eval("e")}'],
    ['function e(){return 1} e()', 'function readValue(){return 1} readValue()'],
    ['var e=function(){}; e.name', 'var callback=function(){}; callback.name'],
    ['var e; e=()=>1; e.name', 'var callback; callback=()=>1; callback.name'],
    ['class e{}; e.name', 'class Model{}; Model.name'],
  ])
    assert.throws(() => verify(before, after), /Observable/);
});

test('a catch parameter can be renamed independently of an outer namesake', () => {
  assert.equal(
    verify(
      'function f(e){try{throw 2}catch(e){return e}}',
      'function f(input){try{throw 2}catch(error){return error}}',
    ),
    2,
  );
});

test('an object field cannot become an invalid reserved-word binding', () => {
  assert.throws(() => verify('function f(e){return {new:e}}', 'function f(new){return {new:new}}'));
});

test('with scopes and parenthesized direct eval keep their visible bindings', () => {
  assert.throws(
    () => verify('function f(e){with({}){return e}}', 'function f(value){with({}){return e}}'),
    /Observable/,
  );
  assert.throws(
    () => verify('function f(e){return (eval)("e")}', 'function f(value){return (eval)("e")}'),
    /Observable/,
  );
});
