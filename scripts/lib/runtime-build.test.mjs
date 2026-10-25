import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  buildRuntimePage,
  verifyRuntimeBuildLayout,
} from '../../packages/editor-runtime/scripts/build-page.mjs';
import { runtimeInputRoots, verifyRuntimeBuild } from './runtime-resources.mjs';

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'marklyra-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (path, content) => {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), content);
  };
  for (const [path] of runtimeInputRoots) {
    if (path.endsWith('.css')) await write(path, 'body{}');
    else await mkdir(resolve(root, path), { recursive: true });
  }
  const engine = 'packages/editor-runtime/src/engine';
  const preferences = 'apps/desktop/src/features/settings/runtime-preferences';
  await write('LICENSE', 'Project fixture license');
  await write('package.json', '{"type":"module","version":"1.2.3"}');
  await write('packages/editor-runtime/dist/frame-host.js', 'globalThis.frame = true;');
  await write(
    'packages/editor-runtime/src/page/index.html',
    '<html><script src="./appsrc/main.js"></script></html>',
  );
  await write(engine + '/main.js', 'globalThis.order = __MARKLYRA_TEST__;');
  await write(engine + '/modules/first.js', '("first");');
  await write(engine + '/modules/second.js', '("second");');
  await write(
    engine + '/bundles.json',
    JSON.stringify({
      schema: 1,
      bundles: [
        {
          entry: 'main.js',
          output: 'appsrc/main.js',
          slots: [
            {
              name: '__MARKLYRA_TEST__',
              kind: 'array',
              parts: ['modules/second.js', null, 'modules/first.js'],
            },
          ],
        },
      ],
    }),
  );
  await write(preferences + '/page/setting.html', '<p>__MARKLYRA_BUILD_VERSION__</p>');
  await write(
    preferences + '/page/static/js/entry.js',
    'globalThis.settings = __MARKLYRA_PREFS__;',
  );
  await write(preferences + '/page/static/js/modules/panel.js', '42;');
  await write(
    preferences + '/page/static/js/bundles.json',
    JSON.stringify({
      schema: 1,
      bundles: [
        {
          entry: 'entry.js',
          output: 'preferences/static/js/entry.js',
          slots: [{ name: '__MARKLYRA_PREFS__', kind: 'array', parts: ['modules/panel.js'] }],
        },
      ],
    }),
  );
  await write(preferences + '/child-host.ts', 'globalThis.fixtureSettings = true;');
  for (const name of ['marklyra.css', 'marklyra-light.css', 'marklyra-dark.css'])
    await write('packages/editor-themes/' + name, 'body{color:inherit}');
  return {
    root,
    write,
    engine,
    preferences,
    output: resolve(root, 'packages/editor-runtime/dist/page'),
  };
}

test('build uses current bytes, auto-discovers new assets, removes stale files and keeps bundle order', async (t) => {
  const { root, write, engine, output } = await fixture(t);
  const css = 'packages/editor-runtime/assets/styles/custom.css';
  const locale = 'packages/editor-runtime/assets/locales/Base.lproj/Front.json';
  await write(css, 'body{color:red}\r\n');
  await write(locale, '{"name":"中文"}\n');
  await buildRuntimePage({ root });
  const context = {};
  runInNewContext(await readFile(resolve(output, 'appsrc/main.js'), 'utf8'), context);
  assert.equal(context.order.length, 3);
  assert.deepEqual(Object.keys(context.order), ['0', '2']);
  assert.deepEqual(Array.from(context.order), ['second', undefined, 'first']);
  assert.equal(await readFile(resolve(output, 'style/custom.css'), 'utf8'), 'body{color:red}\r\n');
  assert.deepEqual(
    await readFile(resolve(output, 'locales/Base.lproj/Front.json')),
    await readFile(resolve(output, 'preferences/locales/Base.lproj/Front.json')),
  );
  await verifyRuntimeBuild(root);
  await write(css, 'body{color:blue}\n');
  await write(engine + '/modules/first.js', '("edited");');
  await write('packages/editor-runtime/src/engine/new-worker.js', 'globalThis.worker = true;');
  await write('package.json', '{"type":"module","version":"1.2.4"}');
  await buildRuntimePage({ root });
  assert.equal(await readFile(resolve(output, 'style/custom.css'), 'utf8'), 'body{color:blue}\n');
  assert.match(await readFile(resolve(output, 'appsrc/main.js'), 'utf8'), /edited/);
  assert.match(await readFile(resolve(output, 'appsrc/new-worker.js'), 'utf8'), /worker/);
  assert.equal(await readFile(resolve(output, 'preferences/setting.html'), 'utf8'), '<p>1.2.4</p>');
  assert.equal((await verifyRuntimeBuild(root)).sourceVersion, 'MarkLyra 1.2.4');
  await rm(resolve(root, css));
  await buildRuntimePage({ root });
  await assert.rejects(readFile(resolve(output, 'style/custom.css')), { code: 'ENOENT' });
  await assert.rejects(readFile(resolve(root, 'config')), { code: 'ENOENT' });
});

for (const failure of ['missing-part', 'duplicate-output', 'traversal'])
  test(`invalid bundle ${failure} fails before deleting the previous build`, async (t) => {
    const { root, write, engine, output } = await fixture(t);
    await write('packages/editor-runtime/dist/page/sentinel', 'previous build');
    const manifest = JSON.parse(await readFile(resolve(root, engine, 'bundles.json'), 'utf8'));
    if (failure === 'missing-part') await rm(resolve(root, engine, 'modules/first.js'));
    else if (failure === 'duplicate-output')
      manifest.bundles.push({ ...manifest.bundles[0], entry: 'other.js' });
    else manifest.bundles[0].output = '../outside.js';
    await write(engine + '/bundles.json', JSON.stringify(manifest));
    await assert.rejects(buildRuntimePage({ root }), /ENOENT|Duplicate|Invalid source bundle path/);
    assert.equal(await readFile(resolve(output, 'sentinel'), 'utf8'), 'previous build');
  });

for (const path of ['LICENSE', 'packages/editor-runtime/dist', 'packages/editor-runtime/dist/page'])
  test(`redirected ${path} cannot change an external build target`, async (t) => {
    const { root, write } = await fixture(t);
    await write('outside/sentinel', 'keep');
    await rm(resolve(root, path), { recursive: true, force: true });
    await symlink(
      resolve(root, path === 'LICENSE' ? 'outside/sentinel' : 'outside'),
      resolve(root, path),
    );
    await assert.rejects(verifyRuntimeBuildLayout(root), /regular/);
    assert.equal(await readFile(resolve(root, 'outside/sentinel'), 'utf8'), 'keep');
  });

test('output checks catch missing, changed, duplicate and escaped build records', async (t) => {
  const { root, output } = await fixture(t);
  await buildRuntimePage({ root });
  const file = resolve(output, 'appsrc/main.js'),
    original = await readFile(file);
  await writeFile(file, 'changed output');
  await assert.rejects(verifyRuntimeBuild(root), /output changed/);
  await rm(file);
  await assert.rejects(verifyRuntimeBuild(root), { code: 'ENOENT' });
  await writeFile(file, original);
  const manifestPath = resolve(output, 'runtime-manifest.json'),
    text = await readFile(manifestPath, 'utf8'),
    manifest = JSON.parse(text);
  manifest.resources.push(manifest.resources[0]);
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(verifyRuntimeBuild(root), /Duplicate runtime output/);
  manifest.resources.pop();
  manifest.resources[0].path = '../outside';
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(verifyRuntimeBuild(root), /Forbidden package path/);
  await writeFile(manifestPath, text);
  await rm(manifestPath);
  await writeFile(resolve(root, 'outside-metadata.json'), text);
  await symlink(resolve(root, 'outside-metadata.json'), manifestPath);
  await assert.rejects(verifyRuntimeBuild(root), /regular workspace directories/);
  await rm(manifestPath);
  await writeFile(manifestPath, text);
  await writeFile(resolve(output, 'frame-host.js'), 'changed adapter');
  await assert.rejects(verifyRuntimeBuild(root), /adapter changed/);
});
