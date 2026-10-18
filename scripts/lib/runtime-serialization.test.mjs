import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Script } from 'node:vm';
import { transformRuntimeSerialization } from './runtime-serialization.mjs';

const sourcePath = new URL('../../private/vendor/TypeMark/appsrc/main.js', import.meta.url);
const hash = (value) => createHash('sha256').update(value).digest('hex');

test('only the verified runtime artifact can grant the native line capability', () => {
  for (const source of ['', 'console.log("unrelated");', null, 12])
    assert.throws(() => transformRuntimeSerialization(source), /unknown original main.js SHA-256/);
});

test('one AST-verified insertion preserves every original byte and its executable syntax', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const before = hash(source);
  const result = transformRuntimeSerialization(source);
  const { metadata, code } = result;
  assert.equal(metadata.originalSha256, before);
  assert.equal(
    metadata.moduleSha256,
    'd7402487d948173fb41732f84f601ecbc409cc22cfd3b54cbc1df8b1caffa5eb',
  );
  assert.equal(metadata.transformedSha256, hash(code));
  assert.equal(metadata.version, 1);
  const offset = metadata.insertionUtf16Offset;
  const addedLength = code.length - source.length;
  assert.equal(code.slice(0, offset), source.slice(0, offset));
  assert.equal(code.slice(offset + addedLength), source.slice(offset));
  assert.equal((code.match(/__MARKLYRA_NATIVE_SERIALIZATION__/g) ?? []).length, 1);
  assert.equal(Buffer.byteLength(code) - Buffer.byteLength(source), metadata.insertedBytes);
  assert.doesNotThrow(() => new Script(code));
  assert.equal(hash(await readFile(sourcePath)), before);
  assert.deepEqual(transformRuntimeSerialization(source), result);
  assert.throws(() => transformRuntimeSerialization(code), /unknown original main.js SHA-256/);
  assert.throws(
    () => transformRuntimeSerialization(source + '\n'),
    /unknown original main.js SHA-256/,
  );
});
