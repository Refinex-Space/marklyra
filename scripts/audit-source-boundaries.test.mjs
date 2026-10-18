import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const source = resolve(import.meta.dirname, '..');
test('source audit rejects missing runtime, unknown package and mismatched notices in an isolated copy', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'marklyra-audit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const inventory = JSON.parse(
    await readFile(join(source, 'config/dependency-inventory.json'), 'utf8'),
  );
  for (const file of [
    '.gitignore',
    'pnpm-lock.yaml',
    'Cargo.lock',
    'scripts/audit-source-boundaries.mjs',
    'scripts/lib/provenance.mjs',
    'scripts/native-titlebar-manifest.json',
    'config/runtime-source.json',
    'config/restricted-assets.json',
    'config/dependency-inventory.json',
    'licenses/fonts/manifest.json',
    'licenses/icons/manifest.json',
    ...[
      'editor-core',
      'editor-markdown',
      'editor-view',
      'editor-extensions',
      'editor-themes',
      'editor-runtime',
      'editor-react',
    ].map((name) => `packages/${name}/package.json`),
  ]) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await copyFile(join(source, file), join(root, file));
  }
  for (const directory of [
    'private/runtime-assets',
    'private/native-titlebar',
    inventory.noticeBundle.directory,
  ])
    await cp(join(source, directory), join(root, directory), { recursive: true });
  const git = (args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git(['init', '--quiet']);
  git(['add', '.']);
  git([
    '-c',
    'user.name=refinex',
    '-c',
    'user.email=refinex@users.noreply.github.com',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  ]);
  const run = () =>
    spawnSync(process.execPath, ['scripts/audit-source-boundaries.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
  const initial = run();
  assert.equal(initial.status, 0, initial.stderr);
  const resource = 'private/runtime-assets/appsrc/editor/EmojiSearchMap.js';
  await rm(join(root, resource));
  const missing = run();
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Missing declared runtime resource/);
  await copyFile(join(source, resource), join(root, resource));
  await mkdir(join(root, 'packages/unreviewed'));
  await writeFile(join(root, 'packages/unreviewed/package.json'), '{}');
  const unknown = run();
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Package needs source classification/);
  await rm(join(root, 'packages/unreviewed'), { recursive: true });
  const manifestPath = join(root, inventory.noticeBundle.directory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.packages[0].version = 'unknown-version';
  await writeFile(manifestPath, JSON.stringify(manifest));
  const mismatch = run();
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /Notice package mapping differs/);
});
