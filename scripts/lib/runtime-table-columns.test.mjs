import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Script } from 'node:vm';
import { transformRuntimeTableColumns } from './runtime-table-columns.mjs';

const path = new URL('../../private/vendor/TypeMark/appsrc/main.js', import.meta.url);
const original = await readFile(path, 'utf8');
const digest = (value) => createHash('sha256').update(value).digest('hex');
test('table column repair requires exact provenance and unchanged module identity', () => {
  for (const value of ['', null, 42, original + '\n'])
    assert.throws(() => transformRuntimeTableColumns(value), /unknown original main/);
  assert.throws(() => transformRuntimeTableColumns(original, null), /Expected generated/);
  const result = transformRuntimeTableColumns(original),
    edit = result.metadata.edits[0],
    [from, to] = result.metadata.originalModuleRange;
  assert.throws(() => transformRuntimeTableColumns(original, result.code), /unknown module/);
  assert.throws(
    () => transformRuntimeTableColumns(original, original + '\n' + original.slice(from, to)),
    /ambiguous module/,
  );
  assert.throws(
    () =>
      transformRuntimeTableColumns(
        original,
        original.slice(0, edit.start) + ' ' + original.slice(edit.start),
      ),
    /unknown module/,
  );
});
test('one field literal changes; restoring the edit restores all input bytes', async () => {
  // Earlier adapters affect other modules. Read their real composed output.
  const { transformRuntimeSerialization } = await import('./runtime-serialization.mjs');
  const { transformRuntimePairing } = await import('./runtime-pairing.mjs');
  const { transformRuntimeFocus } = await import('./runtime-focus.mjs');
  const { transformRuntimeContextCursor } = await import('./runtime-context-cursor.mjs');
  const { transformRuntimeLiteral } = await import('./runtime-literal.mjs');
  const prior = transformRuntimeLiteral(
    original,
    transformRuntimeContextCursor(
      original,
      transformRuntimeFocus(
        original,
        transformRuntimePairing(original, transformRuntimeSerialization(original).code).code,
      ).code,
    ).code,
  ).code;
  const { code, metadata } = transformRuntimeTableColumns(original, prior),
    [edit] = metadata.edits;
  assert.equal(metadata.edits.length, 1);
  assert.equal(metadata.inputSha256, digest(prior));
  assert.equal(metadata.transformedSha256, digest(code));
  assert.equal(
    code.slice(0, edit.start) +
      prior.slice(edit.start, edit.end) +
      code.slice(edit.start + edit.text.length),
    prior,
  );
  assert.doesNotThrow(() => new Script(code));
  assert.equal(digest(await readFile(path)), metadata.originalSha256);
});
