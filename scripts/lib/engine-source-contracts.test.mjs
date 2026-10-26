import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyFactoryDependencies } from './engine-source-contracts.mjs';

const verify = (body) =>
  verifyFactoryDependencies(
    'factory.js',
    `export default function initializeExample(requireModule, exports, module) { ${body} }`,
    { dependencies: ['model/document-model'] },
  );

test('declared dependencies are available to the factory and its owned closures', () => {
  assert.doesNotThrow(() =>
    verify(
      "const model = requireModule('model/document-model'); exports.read = () => requireModule('model/document-model');",
    ),
  );
  assert.doesNotThrow(() =>
    verify(
      "function local(requireModule) { return requireModule('unrelated-local-value'); } exports.local = local;",
    ),
  );
});

test('missing, dynamic, aliased or reflected dependency reads fail the source boundary', () => {
  for (const body of [
    "requireModule('model/missing');",
    'requireModule(exports.name);',
    "const load = requireModule; load('model/missing');",
    "requireModule.call(null, 'model/missing');",
    "requireModule.apply(null, ['model/document-model']);",
    'exports.reader = requireModule;',
    'exports.readers = { requireModule };',
    "requireModule?.('model/document-model');",
  ])
    assert.throws(() => verify(body), /engine dependency/, body);
});
