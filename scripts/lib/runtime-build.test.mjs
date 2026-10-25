import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

for (const missingOutput of [false, true])
  test(`bundle output mapping fails before removing the prior build (missing=${missingOutput})`, async (t) => {
    const root = await fixture(t);
    const base = 'packages/editor-runtime/src/engine';
    await mkdir(resolve(root, base, 'modules'), { recursive: true });
    await mkdir(resolve(root, 'packages/editor-runtime/dist/page'));
    const sentinel = resolve(root, 'packages/editor-runtime/dist/page/sentinel');
    await writeFile(sentinel, 'prior build');
    const files = new Map([
      ['main.js', 'globalThis.result = __MARKLYRA_TEST__;'],
      ['modules/one.js', '42;'],
      ['other.js', '0;'],
      [
        'bundles.json',
        JSON.stringify({
          schema: 1,
          bundles: [
            {
              entry: 'main.js',
              output: 'appsrc/main.js',
              slots: [{ name: '__MARKLYRA_TEST__', kind: 'sequence', parts: ['modules/one.js'] }],
            },
          ],
        }),
      ],
    ]);
    const resources = [];
    for (const [name, source] of files) {
      await writeFile(resolve(root, base, name), source);
      resources.push({
        path: `${base}/${name}`,
        size: Buffer.byteLength(source),
        sha256: createHash('sha256').update(source).digest('hex'),
        ...(!missingOutput && name === 'other.js' ? { runtimePath: 'appsrc/main.js' } : {}),
      });
    }
    await writeFile(
      resolve(root, 'config/runtime-source.json'),
      JSON.stringify({ schema: 2, resources }),
    );
    await assert.rejects(
      buildRuntimePage({ root }),
      /Unexpected bundle entry|Missing declared source bundle output/,
    );
    assert.equal(await readFile(sentinel, 'utf8'), 'prior build');
  });

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
