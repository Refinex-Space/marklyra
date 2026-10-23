import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transformRuntimeZenUMLStyles } from './runtime-zenuml-styles.mjs';

const sourcePath = new URL(
    '../../resources/editor/lib/diagram/css/mermaid-zenuml.css',
    import.meta.url,
  ),
  original = await readFile(sourcePath, 'utf8'),
  digest = (value) => createHash('sha256').update(value).digest('hex');

test('Tailwind defaults are confined to ZenUML roots, descendants and their pseudo-elements', () => {
  const { code } = transformRuntimeZenUMLStyles(original);
  const scope = ':where(.zenuml,.zenuml *)';
  assert.ok(!code.includes('*,:before,:after{'));
  assert.ok(code.includes(`${scope},${scope}:before,${scope}:after{`));
  assert.ok(code.includes(`${scope}::backdrop{`));
  // :where contributes no specificity; the pseudo-elements remain outside it.
  assert.ok(!code.includes(`${scope}:where(:before,:after)`));
});

test('only the two proven selectors change and all original resource bytes remain intact', async () => {
  const { code, metadata } = transformRuntimeZenUMLStyles(original);
  assert.equal(metadata.edits.length, 2);
  assert.equal(metadata.originalSha256, digest(original));
  assert.equal(metadata.inputSha256, digest(original));
  assert.equal(metadata.transformedSha256, digest(code));
  assert.equal(digest(code), 'bd18f0818b574117c00d89a97fdb2ef27245d06901a3920de517c49a27fd0183');
  let restored = code,
    shift = 0;
  const positions = metadata.edits.map((edit) => {
    const position = edit.start + shift;
    shift += edit.text.length - (edit.end - edit.start);
    return { edit, position };
  });
  for (const { edit, position } of positions.reverse())
    restored =
      restored.slice(0, position) +
      original.slice(edit.start, edit.end) +
      restored.slice(position + edit.text.length);
  assert.equal(restored, original);
  assert.equal(digest(await readFile(sourcePath)), metadata.originalSha256);
});

test('both initializer bodies retain all 44 original custom-property values and priorities', () => {
  const { code, metadata } = transformRuntimeZenUMLStyles(original);
  for (const edit of metadata.edits) {
    const sourceStart = original.indexOf('{', edit.start),
      sourceEnd = original.indexOf('}', sourceStart),
      outputStart = code.indexOf('{', code.indexOf(edit.text)),
      outputEnd = code.indexOf('}', outputStart),
      body = original.slice(sourceStart, sourceEnd + 1);
    assert.equal(code.slice(outputStart, outputEnd + 1), body);
    assert.equal([...body.matchAll(/--tw-[\w-]+\s*:/g)].length, 44);
    assert.equal(edit.declarations, 44);
  }
});

test('unrecognized, drifted, duplicated or already transformed CSS fails closed', () => {
  const { code } = transformRuntimeZenUMLStyles(original);
  for (const value of [
    null,
    42,
    '',
    `${original}\n`,
    original.replace('--tw-scale-x: 1', '--tw-scale-x: 2'),
    original.replace('*,:before,:after{', '*,:before{'),
    `${original}*,:before,:after{--tw-scale-x:1}`,
    code,
  ])
    assert.throws(() => transformRuntimeZenUMLStyles(value), /unknown original CSS SHA-256/);
});
