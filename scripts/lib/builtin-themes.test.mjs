import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { builtinThemeIds, prepareBuiltinThemes } from './builtin-themes.mjs';

const root = resolve(import.meta.dirname, '../..');
test('only the branded pair is generated with one GitHub layout, local fonts and distinct palettes', async (t) => {
  const output = await mkdtemp(resolve(tmpdir(), 'marklyra-themes-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const original = await readFile(
    resolve(root, 'private/vendor/TypeMark/style/themes/github.css'),
    'utf8',
  );
  const directory = resolve(output, 'style/themes');
  await mkdir(directory, { recursive: true });
  for (const id of ['github', 'gothic', 'night', 'newsprint', 'pixyll', 'whitey'])
    await writeFile(resolve(directory, `${id}.css`), 'stale generated theme');
  const generated = await prepareBuiltinThemes(root, output, original);
  assert.deepEqual(
    (await readdir(directory)).sort(),
    builtinThemeIds.map((id) => `${id}.css`).sort(),
  );
  assert.equal(generated.length, 2);
  const themes = await Promise.all(
    builtinThemeIds.map((id) => readFile(resolve(directory, `${id}.css`), 'utf8')),
  );
  for (const css of themes) {
    assert.match(css, /max-width: 860px/);
    assert.match(css, /font-family: "Open Sans"/);
    assert.match(css, /url\('\.\/github\/open-sans-/);
    assert.doesNotMatch(css, /@import|@include-when-export/);
  }
  assert.match(themes[0], /--bg-color: #fff/);
  assert.match(themes[1], /--bg-color: #0d1117/);
  assert.equal(
    await readFile(resolve(root, 'private/vendor/TypeMark/style/themes/github.css'), 'utf8'),
    original,
  );
});
