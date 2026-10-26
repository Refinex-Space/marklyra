import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { capability, engineModule, expressionOf, hasHook, nodes } from './runtime-test-source.mjs';

const module = engineModule('model/markdown-parser');
const patterns = nodes(
  module,
  (node) =>
    node.type === 'ConditionalExpression' &&
    node.consequent.type === 'CallExpression' &&
    hasHook(node.test, '__MARKLYRA_LITERAL_RULE__'),
);
test('the native parser exposes its two literal-rule boundaries and one capability', () => {
  assert.equal(patterns.length, 2);
  capability('__MARKLYRA_NATIVE_LITERAL__', module);
});

for (const [index, name] of ['remapped-rule', 'ordinary-rule'].entries()) {
  test(`the ${name} expression passes its exact native line and default pattern once`, () => {
    const expression = expressionOf(patterns[index]);
    const argument = patterns[index].consequent.arguments[0];
    assert.equal(argument.type, 'Identifier');
    const identifier = argument.name;
    const line = '\uFEFF  * * *  ';
    assert.equal(runInNewContext(expression, { [identifier]: line }), line.trim());
    let calls = 0;
    const result = runInNewContext(expression, {
      [identifier]: line,
      __MARKLYRA_LITERAL_RULE__: (source, pattern) => {
        calls++;
        assert.equal(source, line);
        assert.equal(pattern, line.trim());
        return source;
      },
    });
    assert.equal(calls, 1);
    assert.equal(result, line);
    const failure = new Error('host rejected ABI');
    assert.throws(
      () =>
        runInNewContext(expression, {
          [identifier]: line,
          __MARKLYRA_LITERAL_RULE__: () => {
            throw failure;
          },
        }),
      (error) => error === failure,
    );
  });
}
