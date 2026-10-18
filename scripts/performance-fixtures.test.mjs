import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createPerformanceFixture } from './performance-fixtures.mjs';

const catalog = JSON.parse(
  await readFile(new URL('../tests/performance/fixtures-v2.json', import.meta.url), 'utf8'),
);
const digest = (value) => createHash('sha256').update(value).digest('hex');
for (const entry of catalog.defaults)
  test(`default benchmark output stays byte-identical: ${entry.kind}/${entry.bytes}`, () => {
    assert.equal(digest(createPerformanceFixture(entry.bytes, entry.kind)), entry.sha256);
  });
for (const entry of catalog.cases)
  test(`controlled benchmark is exact UTF-8 size and intact Unicode: ${entry.id}`, () => {
    const source = createPerformanceFixture(entry.bytes, entry.kind, { bom: false, eol: 'lf' });
    assert.equal(Buffer.byteLength(source), entry.bytes);
    assert.equal(source.length, entry.utf16Units);
    assert.equal(digest(source), entry.sha256);
    assert.equal(source.isWellFormed(), true);
    assert.equal(source.startsWith('\uFEFF'), false);
    assert.equal(source.includes('\r'), false);
    assert.equal(source.endsWith('benchmark-tail'), true);
  });
