import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import {
  capability,
  engineModule,
  engineSource,
  expressionOf,
  identifierRoot,
  nodes,
  unique,
} from './runtime-test-source.mjs';

test('the complete internal engine is valid JavaScript with one native serialization capability', () => {
  assert.doesNotThrow(() => new Script(engineSource));
  capability('__MARKLYRA_NATIVE_SERIALIZATION__', engineModule('model/markdown-serializer'));
});

test('the native serialization capability exposes the actual bindings as an immutable value', () => {
  class Node {
    toMark() {
      return 'node';
    }
  }
  class NodeMap {
    toMark() {
      return 'map';
    }
  }
  const lines = () => 'lines';
  const declaration = capability(
    '__MARKLYRA_NATIVE_SERIALIZATION__',
    engineModule('model/markdown-serializer'),
  );
  const binding = (key) =>
    identifierRoot(
      unique(
        nodes(declaration, (node) => node.type === 'Property' && node.key.name === key),
        `serialization ${key}`,
      ).value,
    );
  const context = createContext({
    [binding('nodePrototype')]: Node,
    [binding('mapPrototype')]: NodeMap,
    [binding('lines')]: lines,
  });
  new Script(
    expressionOf(
      capability('__MARKLYRA_NATIVE_SERIALIZATION__', engineModule('model/markdown-serializer')),
    ),
  ).runInContext(context);
  const value = context.__MARKLYRA_NATIVE_SERIALIZATION__;
  assert.equal(value.version, 1);
  assert.equal(value.nodePrototype, Node.prototype);
  assert.equal(value.mapPrototype, NodeMap.prototype);
  assert.equal(value.nodeToMark, Node.prototype.toMark);
  assert.equal(value.mapToMark, NodeMap.prototype.toMark);
  assert.equal(value.lines, lines);
  assert.equal(value.array, new Script('Array').runInContext(context));
  assert.ok(Object.isFrozen(value));
  const descriptor = Object.getOwnPropertyDescriptor(context, '__MARKLYRA_NATIVE_SERIALIZATION__');
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.configurable, false);
  assert.equal(descriptor.enumerable, false);
});
