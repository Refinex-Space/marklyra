import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  buildRuntimePage,
  verifyRuntimeBuildLayout,
} from '../../packages/editor-runtime/scripts/build-page.mjs';

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'marklyra-build-boundary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['config', 'packages/editor-runtime/dist', 'outside/page'])
    await mkdir(resolve(root, directory), { recursive: true });
  for (const file of [
    'LICENSE',
    'THIRD-PARTY-NOTICES.txt',
    'package.json',
    'config/runtime-source.json',
    'packages/editor-runtime/dist/frame-host.js',
  ])
    await writeFile(resolve(root, file), '{}');
  await writeFile(resolve(root, 'outside/page/sentinel'), 'must survive');
  return root;
}

test('ordinary package build layout accepts a not-yet-generated page', async (t) => {
  await verifyRuntimeBuildLayout(await fixture(t));
});

for (const path of [
  'LICENSE',
  'THIRD-PARTY-NOTICES.txt',
  'packages/editor-runtime/dist',
  'packages/editor-runtime/dist/page',
]) {
  test(`build rejects a redirected ${path} before removing output or reading notices`, async (t) => {
    const root = await fixture(t);
    await rm(resolve(root, path), { recursive: true, force: true });
    await symlink(
      resolve(
        root,
        ['LICENSE', 'THIRD-PARTY-NOTICES.txt'].includes(path) ? 'outside/page/sentinel' : 'outside',
      ),
      resolve(root, path),
    );
    await assert.rejects(buildRuntimePage({ root }), /Runtime build path must be a regular/);
    assert.equal(await readFile(resolve(root, 'outside/page/sentinel'), 'utf8'), 'must survive');
  });
}
