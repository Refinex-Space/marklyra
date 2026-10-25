import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

async function fixture(t) {
  const base = await mkdtemp(resolve(tmpdir(), 'marklyra-sync-boundary-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = resolve(base, 'workspace');
  for (const dir of [
    'scripts',
    'config',
    'packages/editor-runtime/src/engine',
    'packages/editor-runtime/src/page',
    'packages/editor-runtime/assets/styles',
    'packages/editor-runtime/assets/locales',
    'packages/editor-runtime/vendor',
    'packages/editor-themes/assets',
    'apps/desktop/src/features/settings/runtime-preferences/page',
    'apps/desktop/src-tauri/icons/titlebar',
  ])
    await mkdir(resolve(root, dir), { recursive: true });
  await copyFile(
    new URL('../sync-runtime-sources.mjs', import.meta.url),
    resolve(root, 'scripts/sync-runtime-sources.mjs'),
  );
  await writeFile(resolve(root, 'package.json'), '{"type":"module","version":"0.1.8"}');
  await writeFile(resolve(root, 'packages/editor-themes/base.css'), 'body{}');
  await writeFile(resolve(root, 'config/runtime-source.json'), '{"untouched":true}');
  const run = (...args) =>
    spawnSync(process.execPath, [resolve(root, 'scripts/sync-runtime-sources.mjs'), ...args], {
      encoding: 'utf8',
    });
  return { root, base, run };
}

test('sync refuses a linked source ancestor before traversing external inputs', async (t) => {
  const { root, base, run } = await fixture(t);
  await rename(resolve(root, 'packages'), resolve(base, 'external-packages'));
  await symlink(resolve(base, 'external-packages'), resolve(root, 'packages'));
  for (const args of [[], ['--check']]) {
    const result = run(...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be a regular directory/);
  }
  assert.equal(
    await readFile(resolve(root, 'config/runtime-source.json'), 'utf8'),
    '{"untouched":true}',
  );
});

for (const kind of ['file', 'directory']) {
  test(`sync refuses a linked output ${kind} without modifying the external destination`, async (t) => {
    const { root, base, run } = await fixture(t);
    const original = resolve(root, kind === 'file' ? 'config/runtime-source.json' : 'config');
    const external = resolve(base, 'external-output');
    await rename(original, external);
    await symlink(external, original);
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be a regular/);
    assert.equal(
      await readFile(kind === 'file' ? external : resolve(external, 'runtime-source.json'), 'utf8'),
      '{"untouched":true}',
    );
  });
}

test('a product version bump does not invalidate unchanged native source identities', async (t) => {
  const { root, run } = await fixture(t);
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const before = await readFile(resolve(root, 'config/runtime-source.json'), 'utf8');
  await writeFile(resolve(root, 'package.json'), '{"type":"module","version":"0.1.9"}');
  const checked = run('--check');
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(await readFile(resolve(root, 'config/runtime-source.json'), 'utf8'), before);
});
