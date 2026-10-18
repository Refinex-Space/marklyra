import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext, Script } from 'node:vm';
import { transformRuntimeContextCursor } from './runtime-context-cursor.mjs';
import { transformRuntimeFocus } from './runtime-focus.mjs';
import { transformRuntimeLiteral } from './runtime-literal.mjs';
import { transformRuntimePairing } from './runtime-pairing.mjs';
import { transformRuntimeSerialization } from './runtime-serialization.mjs';

const sourcePath = new URL('../../private/vendor/TypeMark/appsrc/main.js', import.meta.url);
const original = await readFile(sourcePath, 'utf8');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const transformed = transformRuntimeLiteral(original);

test('literal transform requires original provenance, unique unchanged parser and exact sites', () => {
  for (const value of ['', null, 42, `${original}\n`])
    assert.throws(() => transformRuntimeLiteral(value), /unknown original main.js SHA-256/);
  assert.throws(() => transformRuntimeLiteral(original, null), /Expected generated runtime source/);
  const { metadata, code } = transformed;
  const [start, end] = metadata.originalModuleRange;
  const [at] = metadata.originalPatternRanges[0];
  assert.throws(
    () => transformRuntimeLiteral(original, `${original.slice(0, at)} ${original.slice(at)}`),
    /unknown module 19 AST\/SHA-256/,
  );
  assert.throws(
    () => transformRuntimeLiteral(original, `${original}\n${original.slice(start, end)}`),
    /ambiguous module 19/,
  );
  assert.throws(
    () => transformRuntimeLiteral(original, `var __MARKLYRA_LITERAL_RULE__;${original}`),
    /duplicate literal capability/,
  );
  assert.throws(() => transformRuntimeLiteral(original, code), /duplicate literal capability/);
});

test('only two HR pattern expressions and the capability insertion change after composition', async () => {
  const prior = transformRuntimeContextCursor(
    original,
    transformRuntimeFocus(
      original,
      transformRuntimePairing(original, transformRuntimeSerialization(original).code).code,
    ).code,
  ).code;
  const { code, metadata } = transformRuntimeLiteral(original, prior);
  assert.equal(metadata.inputSha256, digest(prior));
  assert.equal(metadata.transformedSha256, digest(code));
  assert.equal(metadata.edits.length, 3);
  assert.deepEqual(metadata.originalPatternRanges, [
    [891856, 891865],
    [891999, 892007],
  ]);
  let restored = code,
    shift = 0;
  const actual = metadata.edits.map((edit) => {
    const result = { ...edit, outputStart: edit.start + shift };
    shift += edit.text.length - (edit.end - edit.start);
    return result;
  });
  for (const edit of [...actual].reverse()) {
    assert.equal(restored.slice(edit.outputStart, edit.outputStart + edit.text.length), edit.text);
    restored =
      restored.slice(0, edit.outputStart) +
      prior.slice(edit.start, edit.end) +
      restored.slice(edit.outputStart + edit.text.length);
  }
  assert.equal(restored, prior);
  assert.doesNotThrow(() => new Script(code));
  assert.equal(digest(await readFile(sourcePath)), metadata.originalSha256);
});

for (const [index, name] of ['remapped-rule', 'ordinary-rule'].entries()) {
  test(`the ${name} expression passes its exact native line and default pattern once`, () => {
    const expression = transformed.metadata.edits[index].text;
    const identifier = index === 0 ? 'te' : 'e';
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
