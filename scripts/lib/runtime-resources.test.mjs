import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { collectRuntimeInputs, runtimeInputRoots } from './runtime-resources.mjs';

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'marklyra-resource-discovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path] of runtimeInputRoots) {
    if (path.endsWith('.css')) {
      await mkdir(dirname(resolve(root, path)), { recursive: true });
      await writeFile(resolve(root, path), 'body{}');
    } else await mkdir(resolve(root, path), { recursive: true });
  }
  return root;
}

test('current inputs are discovered without source fingerprints', async () => {
  const inputs = await collectRuntimeInputs();
  assert.ok(inputs.some((input) => input.path.endsWith('/src/engine/main.js')));
  assert.ok(inputs.some((input) => input.runtimePath === 'index.html'));
  assert.ok(inputs.every((input) => !('sha256' in input) && !('size' in input)));
  assert.equal(new Set(inputs.map((input) => input.path.toLowerCase())).size, inputs.length);
});

test('new, edited and removed files take effect without registration', async (t) => {
  const root = await fixture(t);
  const path = 'packages/editor-runtime/assets/styles/new.css';
  await writeFile(resolve(root, path), 'body{color:red}');
  const first = await collectRuntimeInputs(root);
  assert.deepEqual(
    first.find((input) => input.path === path),
    { path, runtimePath: 'style/new.css' },
  );
  await writeFile(resolve(root, path), 'body{color:blue}\n');
  assert.deepEqual(await collectRuntimeInputs(root), first);
  assert.equal(await readFile(resolve(root, path), 'utf8'), 'body{color:blue}\n');
  await rm(resolve(root, path));
  assert.ok(!(await collectRuntimeInputs(root)).some((input) => input.path === path));
  await assert.rejects(readFile(resolve(root, 'config')), { code: 'ENOENT' });
});

test('languages share one source and imported engine modules are not separately copied', async (t) => {
  const root = await fixture(t);
  const directory = 'packages/editor-runtime/src/engine';
  await mkdir(resolve(root, directory, 'modules'));
  await writeFile(
    resolve(root, directory, 'main.js'),
    "import value from './modules/one.js'; (function installEngineModules() { globalThis.result = value; })();",
  );
  await writeFile(resolve(root, directory, 'modules/one.js'), 'export default 1;');
  const path = 'packages/editor-runtime/assets/locales/Base.lproj/Front.json';
  await mkdir(dirname(resolve(root, path)), { recursive: true });
  await writeFile(resolve(root, path), '{"new":"新"}');
  const inputs = await collectRuntimeInputs(root);
  assert.deepEqual(
    inputs.find((input) => input.path === path),
    {
      path,
      runtimePath: 'locales/Base.lproj/Front.json',
      additionalRuntimePaths: ['preferences/locales/Base.lproj/Front.json'],
    },
  );
  assert.deepEqual(
    inputs.find((input) => input.path.endsWith('modules/one.js')),
    { path: directory + '/modules/one.js' },
  );
  assert.equal(
    inputs.find((input) => input.path === directory + '/main.js').runtimePath,
    'appsrc/main.js',
  );
});

test('redirected input directories and files cannot read outside the workspace', async (t) => {
  const root = await fixture(t);
  const external = await mkdtemp(resolve(tmpdir(), 'marklyra-external-input-'));
  t.after(() => rm(external, { recursive: true, force: true }));
  const directory = resolve(root, 'packages/editor-runtime/assets/styles');
  await rm(directory, { recursive: true });
  await symlink(external, directory, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(collectRuntimeInputs(root), /regular workspace directories/);
  await rm(directory);
  await mkdir(directory);
  await writeFile(resolve(external, 'outside.css'), 'body{}');
  await symlink(resolve(external, 'outside.css'), resolve(directory, 'linked.css'));
  await assert.rejects(collectRuntimeInputs(root), /cannot be a symlink/);
});
