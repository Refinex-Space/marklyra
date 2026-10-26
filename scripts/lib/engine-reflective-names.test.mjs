import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { compileReflectiveNames } from './engine-reflective-names.mjs';

function compare(source) {
  const compiled = compileReflectiveNames(source);
  const run = (code) => JSON.stringify(runInNewContext(code));
  assert.equal(run(compiled.code), run(source));
  return compiled;
}

test('function hoisting, recursive calls, classes and their name descriptors survive lowering', () => {
  const result = compare(`(function(){
    Object.defineProperty(factorial, 'name', {value:'f', configurable:true});
    var early = factorial(5);
    function factorial(n) { return n ? n * factorial(n - 1) : 1; }
    class DocumentNode { value() { return 7; } }
    Object.defineProperty(DocumentNode, 'name', {value:'d', configurable:true});
    return [early,factorial.name,DocumentNode.name,new DocumentNode().value(),Object.getOwnPropertyDescriptor(factorial,'name')];
  })()`);
  assert.equal(result.eliminated, 2);
  assert.equal(result.retained, 0);
});

test('anonymous inferred names, arrow assignments and named expression recursion stay intact', () => {
  const result = compare(`(function(){
    var callback = Object.defineProperty(function(){ return 4 }, 'name', {value:'c', configurable:true});
    var arrow; arrow = Object.defineProperty(() => 6, 'name', {value:'a', configurable:true});
    var recurse = Object.defineProperty(function sum(n){return n ? n + sum(n-1) : 0}, 'name', {value:'s', configurable:true});
    return [callback.name,callback(),arrow.name,arrow(),recurse.name,recurse(4),{callback}];
  })()`);
  assert.equal(result.eliminated, 3);
});

test('a named callback IIFE remains an invoked expression in a statement position', () => {
  const result = compare(`(function(){
    var callbacks = [];
    Object.defineProperty(function register(values) {
      for (var index = 0; index < values.length; index++) callbacks.push(values[index]);
    }, 'name', {value:'t', configurable:true})([1,2,3]);
    return [callbacks, typeof t];
  })()`);
  assert.equal(result.eliminated, 1);
});

test('removing a declaration descriptor cannot enable a following strict-mode string', () => {
  const result = compare(`(function(){
    Object.defineProperty(callback,'name',{value:'f',configurable:true});
    'use strict';
    function callback(){return this === undefined;}
    return [callback.name,callback()];
  })()`);
  assert.equal(result.eliminated, 1);
});

test('optional name-descriptor calls preserve short-circuit behavior', () => {
  const source = `(function(){
    Object.defineProperty = undefined;
    var callback = Object.defineProperty?.(function(){return 1}, 'name', {value:'f',configurable:true});
    return typeof callback;
  })()`;
  const result = compare(source);
  assert.equal(result.code, source);
  assert.equal(result.eliminated, 0);
});

test('name collisions, dynamic scopes and unrelated property descriptors retain explicit behavior', () => {
  const result = compare(`(function(){
    Object.defineProperty(readValue, 'name', {value:'x', configurable:true});
    function readValue(x){return x ? readValue(x - 1) + 1 : 0}
    return [readValue.name,readValue(8)];
  })()`);
  assert.equal(result.retained, 1);
  const dynamic = `function value(){return eval('value.name')} Object.defineProperty(value,'name',{value:'x',configurable:true}); value()`;
  assert.equal(compare(dynamic).eliminated, 0);
  const unrelated = `var value={};Object.defineProperty(value,'name',{value:'hello world',configurable:true});value.name`;
  assert.equal(compare(unrelated).code, unrelated);
});

test('a function name observed before its descriptor is not rewritten early', () => {
  const result = compare(`(function(){
    function readValue(){return 4}
    var previousName = readValue.name;
    Object.defineProperty(readValue, 'name', {value:'f', configurable:true});
    return [previousName,readValue.name,readValue()];
  })()`);
  assert.equal(result.eliminated, 0);
});

test('class static fields and blocks retain names observed during initialization', () => {
  for (const member of [
    'static initialName = DocumentNode.name;',
    'static { this.initialName = this.name; }',
  ]) {
    const result = compare(`(function(){
      class DocumentNode { ${member} }
      Object.defineProperty(DocumentNode, 'name', {value:'d', configurable:true});
      return [DocumentNode.initialName,DocumentNode.name];
    })()`);
    assert.equal(result.eliminated, 0);
  }
});

test('computed class member names are kept outside reflective-name lowering', () => {
  const result = compare(`(function(){
    class DocumentNode { ['field'](){return 4} }
    Object.defineProperty(DocumentNode, 'name', {value:'d', configurable:true});
    return [DocumentNode.name,new DocumentNode().field()];
  })()`);
  assert.equal(result.eliminated, 0);
});

test('named class expressions preserve their initialization-time name', () => {
  const result = compare(`(function(){
    var Node = Object.defineProperty(class DocumentNode {
      static initialName = DocumentNode.name;
    }, 'name', {value:'d', configurable:true});
    return [Node.initialName,Node.name];
  })()`);
  assert.equal(result.eliminated, 0);
});

test('unwrapped anonymous initializers retain their inferred names on a reassigned binding', () => {
  const result = compare(`(function(){
    var callback = function(){return 1};
    var previousName = callback.name;
    callback = Object.defineProperty(() => 2, 'name', {value:'c', configurable:true});
    return [previousName,callback.name,callback()];
  })()`);
  assert.equal(result.eliminated, 0);
});

test('an outer direct eval keeps a hoisted declaration accessible by its lexical name', () => {
  const result = compare(`(function(){
    Object.defineProperty(readValue, 'name', {value:'f', configurable:true});
    function readValue(){return 4}
    return [eval('readValue()'),readValue.name];
  })()`);
  assert.equal(result.eliminated, 0);
});

test('static name methods and accessors keep the explicit class-name restoration', () => {
  for (const member of [
    'static name(){return "method"}',
    'static get name(){return "getter"}',
    'static "name"(){return "quoted method"}',
  ]) {
    const result = compare(`(function(){
      class DocumentNode { ${member} }
      Object.defineProperty(DocumentNode, 'name', {value:'d', configurable:true});
      return [typeof DocumentNode.name,DocumentNode.name];
    })()`);
    assert.equal(result.eliminated, 0);
  }
});

test('top-level script names remain available through the global object', () => {
  const result = compare(`
    Object.defineProperty(readValue, 'name', {value:'f', configurable:true});
    function readValue(){return 7}
    [globalThis.readValue.name,globalThis.readValue()];
  `);
  assert.equal(result.eliminated, 0);
  const variable = compare(`
    var callback = Object.defineProperty(function(){return 8}, 'name', {value:'c', configurable:true});
    [globalThis.callback.name,globalThis.callback()];
  `);
  assert.equal(variable.eliminated, 0);
});

test('named module exports keep their public binding names', () => {
  for (const source of [
    `Object.defineProperty(readValue, 'name', {value:'f', configurable:true});
     export function readValue(){return 7}`,
    `Object.defineProperty(readValue, 'name', {value:'f', configurable:true});
     function readValue(){return 7}
     export {readValue};`,
    `export const callback = Object.defineProperty(function(){return 8}, 'name', {value:'c', configurable:true});`,
  ]) {
    const result = compileReflectiveNames(source, 'exports.mjs');
    assert.equal(result.code, source);
    assert.equal(result.eliminated, 0);
  }
});
