import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { digest, isRuntimeSourcePath } from './provenance.mjs';
import { repositoryRoot, verifyRuntimeSources } from './runtime-resources.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'marklyra-resources-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'config'));
  await mkdir(join(root, 'packages/editor-runtime/src/engine'), { recursive: true });
  const bytes = Buffer.from('const source = "keep LF";\nconst next = true;\n');
  const path = 'packages/editor-runtime/src/engine/main.js';
  await writeFile(join(root, path), bytes);
  await writeFile(
    join(root, 'config/runtime-source.json'),
    JSON.stringify({
      schema: 2,
      resources: [{ path, size: bytes.length, sha256: digest(bytes) }],
    }),
  );
  return { root, path, bytes };
}

test('tracked project inputs verify without a private directory or installed editor', async () => {
  const resources = await verifyRuntimeSources();
  assert.ok(resources.size > 0);
  assert.ok(resources.has('packages/editor-runtime/src/engine/main.js'));
  assert.ok(resources.has('packages/editor-runtime/src/page/index.html'));
  assert.ok(resources.has('apps/desktop/src-tauri/icons/titlebar/panel-left.svg'));
  assert.ok(resources.has('apps/desktop/src-tauri/icons/titlebar/panel-right.svg'));
  assert.ok(resources.has('apps/desktop/src-tauri/icons/titlebar/table-of-contents.svg'));
  for (const path of resources.keys()) assert.ok(isRuntimeSourcePath(path));
});

test('source paths are portable across case-insensitive Windows filesystems', async () => {
  const resources = await verifyRuntimeSources();
  const paths = new Set();
  for (const path of resources.keys()) {
    assert.ok(!paths.has(path.toLowerCase()), `Case-insensitive collision: ${path}`);
    paths.add(path.toLowerCase());
    for (const part of path.split('/')) {
      assert.ok(!/[<>:"|?*]|[. ]$/.test(part), `Unsupported Windows filename: ${path}`);
      assert.ok(!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part), path);
    }
  }
});

test('missing and changed sources fail with a source identity recovery instruction', async (t) => {
  const { root, path } = await fixture(t);
  await verifyRuntimeSources(root);
  await writeFile(join(root, path), 'changed');
  await assert.rejects(verifyRuntimeSources(root), /source identity mismatch.*reviewed identity/);
  await rm(join(root, path));
  await assert.rejects(
    verifyRuntimeSources(root),
    /Runtime source unavailable.*main\.js.*reviewed identity/,
  );
});

test('a linked source ancestor cannot redirect the build outside the checkout', async (t) => {
  const { root } = await fixture(t);
  const input = join(root, 'packages/editor-runtime/src/engine');
  const external = join(root, 'external');
  await cp(input, external, { recursive: true });
  await rm(input, { recursive: true });
  await symlink(external, input, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyRuntimeSources(root), /source directory must be regular/);
});

test('Windows autocrlf checkout preserves pinned source bytes', async (t) => {
  const { root, path, bytes } = await fixture(t);
  await cp(join(repositoryRoot, '.gitattributes'), join(root, '.gitattributes'));
  const pinned = new Map([[path, bytes]]);
  for (const file of [
    'apps/desktop/public/icons/image-viewer/download.svg',
    'scripts/runtime-shell-icons.d.mts',
    'pnpm-lock.yaml',
  ]) {
    const source = await readFile(join(repositoryRoot, file));
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), source);
    pinned.set(file, source);
  }
  const git = (args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git(['init', '--quiet']);
  git(['config', 'core.autocrlf', 'true']);
  git(['add', '.']);
  for (const file of pinned.keys()) await rm(join(root, file));
  git(['checkout-index', '--all', '--force']);
  for (const [file, source] of pinned) assert.deepEqual(await readFile(join(root, file)), source);
  await verifyRuntimeSources(root);
});
