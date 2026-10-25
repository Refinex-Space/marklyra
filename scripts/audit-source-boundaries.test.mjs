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
  for (const file of [
    '.gitignore',
    'LICENSE',
    'THIRD-PARTY-NOTICES.txt',
    'package.json',
    'scripts/audit-source-boundaries.mjs',
    'scripts/lib/provenance.mjs',
    'scripts/lib/project-notices.mjs',
    'scripts/lib/runtime-resources.mjs',
    'scripts/native-titlebar-manifest.json',
    'config/runtime-source.json',
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
  const inputManifest = JSON.parse(
    await readFile(join(source, 'config/runtime-source.json'), 'utf8'),
  );
  for (const { path } of inputManifest.resources) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await copyFile(join(source, path), join(root, path));
  }
  await cp(
    join(source, 'packages/editor-runtime/dist/page'),
    join(root, 'packages/editor-runtime/dist/page'),
    { recursive: true },
  );
  const git = (args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git(['init', '--quiet']);
  git(['add', '.']);
  git([
    '-c',
    'user.name=liyao',
    '-c',
    'user.email=fixture@example.invalid',
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
  const noticePath = join(root, 'packages/editor-runtime/dist/page/THIRD-PARTY-NOTICES.txt');
  const noticeBytes = await readFile(noticePath);
  await writeFile(noticePath, 'changed bundled notice');
  const changedNotice = run();
  assert.notEqual(changedNotice.status, 0);
  assert.match(changedNotice.stderr, /Project notice bundle mismatch/);
  await writeFile(noticePath, noticeBytes);
  const runtimePath = join(root, 'packages/editor-runtime/dist/page/runtime-manifest.json');
  const runtimeBytes = await readFile(runtimePath);
  const staleRuntime = JSON.parse(runtimeBytes.toString('utf8'));
  staleRuntime.resources.find((entry) => entry.sourcePath).originalSha256 = '0'.repeat(64);
  await writeFile(runtimePath, JSON.stringify(staleRuntime));
  const staleInput = run();
  assert.notEqual(staleInput.status, 0);
  assert.match(staleInput.stderr, /Runtime source-to-output mapping/);
  await writeFile(runtimePath, runtimeBytes);
  const resource = 'packages/editor-runtime/dist/page/appsrc/editor/EmojiSearchMap.js';
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
  const packagePath = join(root, 'packages/editor-runtime/package.json');
  const packageManifest = JSON.parse(await readFile(packagePath, 'utf8'));
  packageManifest.private = false;
  await writeFile(packagePath, JSON.stringify(packageManifest));
  const publicPackage = run();
  assert.notEqual(publicPackage.status, 0);
  assert.match(publicPackage.stderr, /Unexpected release status/);
  packageManifest.private = true;
  packageManifest.license = 'MIT';
  await writeFile(packagePath, JSON.stringify(packageManifest));
  const wrongProjectLicense = run();
  assert.notEqual(wrongProjectLicense.status, 0);
  assert.match(wrongProjectLicense.stderr, /Unexpected release status/);
  assert.ok(
    (await readFile(join(root, 'artifacts/source-audit.json'), 'utf8')).includes(
      'runtimeInputIntegrity',
    ),
  );
  for (const file of [
    'config/source-audit.json',
    'config/runtime-audit.json',
    'config/dependency-inventory.json',
  ])
    await assert.rejects(readFile(join(root, file)), { code: 'ENOENT' });
});
