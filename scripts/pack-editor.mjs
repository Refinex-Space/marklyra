import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectBytes, inspectPath, loadPolicy } from './lib/provenance.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const destination = join(root, 'artifacts/npm');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const forbidden =
  /(?:^|\/)(?:private|runtime-assets|recovered|appsrc|node_modules|target|\.git)(?:\/|$)/;

function safePath(path) {
  inspectPath(path);
  if (
    typeof path !== 'string' ||
    !path ||
    path.includes('\\') ||
    Array.from(path).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    path.startsWith('/') ||
    path.includes(':') ||
    path.split('/').some((part) => part === '..' || part === '.' || !part) ||
    forbidden.test(path)
  ) {
    throw new Error(`Forbidden package path: ${JSON.stringify(path)}`);
  }
  return path;
}
function manifestGate(manifest) {
  if (['prepack', 'prepare', 'postpack'].some((name) => manifest.scripts?.[name]))
    throw new Error(`${manifest.name}: packing lifecycle scripts require separate review`);
  if (manifest.private !== true || manifest.license !== 'UNLICENSED')
    throw new Error(`${manifest.name}: private/UNLICENSED publication gate is required`);
  if (!/^@marklyra\/[a-z][a-z0-9-]*$/.test(manifest.name))
    throw new Error('SDK package must use the MarkLyra namespace');
  if (!Array.isArray(manifest.files) || !manifest.files.length)
    throw new Error(`${manifest.name}: explicit package files allowlist is required`);
  for (const file of manifest.files) safePath(file);
  if (manifest.bundledDependencies?.length || manifest.bundleDependencies?.length)
    throw new Error(`${manifest.name}: bundled dependencies need separate provenance review`);
}
function run(command, args, cwd = root, json = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} failed: ${result.error?.message ?? result.stderr?.toString('utf8') ?? result.status}`,
    );
  return json ? JSON.parse(result.stdout.toString('utf8')) : result.stdout;
}
function exportsList(value) {
  if (typeof value === 'string') return [value];
  return value && typeof value === 'object' ? Object.values(value).flatMap(exportsList) : [];
}

if (process.argv.includes('--self-test')) {
  for (const path of [
    '../secret',
    '/private/a',
    'dist/private/main.js',
    'dist/appsrc/main.js',
    'dist/runtime-assets/index.html',
    'dist\\x.js',
    'dist/../x.js',
  ]) {
    assert.throws(() => safePath(path));
  }
  assert.equal(safePath('dist/runtime/frame-host.js'), 'dist/runtime/frame-host.js');
  const original = Buffer.from('synthetic original resource fixture');
  const hashes = new Set([digest(original)]);
  assert.throws(() => inspectBytes('dist/engine.js', original, hashes));
  assert.throws(() =>
    inspectBytes(
      'dist/engine.js.map',
      Buffer.from(
        JSON.stringify({ sources: ['engine.ts'], sourcesContent: [original.toString()] }),
      ),
      hashes,
    ),
  );
  assert.throws(() =>
    inspectBytes(
      'dist/engine.js.map',
      Buffer.from(JSON.stringify({ sources: ['../../../private/main.js'] })),
      hashes,
    ),
  );
  assert.throws(() =>
    manifestGate({ name: 'fixture', private: false, license: 'MIT', files: ['dist'] }),
  );
  inspectBytes('README.md', Buffer.from('Private runtime assets are not included.'), hashes);
  assert.throws(() =>
    manifestGate({ name: '@other/editor', private: true, license: 'UNLICENSED', files: ['dist'] }),
  );
  console.log('Package provenance preflight regression checks passed.');
  process.exit(0);
}

const { hashes: restrictedHashes } = await loadPolicy(root);
let generatedManifestChecked = false;
try {
  const generated = JSON.parse(
    await readFile(join(root, 'private/runtime-assets/runtime-manifest.json'), 'utf8'),
  );
  // frame-host.js is our new adapter; only the transformed original resources
  // belong to this deny set, not generated.adapterSha256.
  for (const manifest of [generated, generated.preferences]) {
    for (const resource of manifest?.resources ?? []) {
      if (resource.runtimeSha256 && !restrictedHashes.has(resource.runtimeSha256))
        throw new Error(`Runtime resource needs provenance review: ${resource.path}`);
    }
  }
  generatedManifestChecked = true;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(destination, { recursive: true });
const staging = await mkdtemp(join(destination, '.preflight-'));
const report = [];
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
try {
  const packages = (await readdir(join(root, 'packages'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of packages) {
    const directory = join(root, 'packages', name);
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    manifestGate(manifest);
    const dry = run(pnpm, ['pack', '--dry-run', '--json'], directory, true);
    for (const file of dry.files) {
      safePath(file.path);
      const full = join(directory, file.path);
      const resolved = await realpath(full);
      if (!resolved.startsWith(`${await realpath(directory)}${sep}`))
        throw new Error(`${name}: package entry leaves package directory`);
      let ancestor = directory;
      for (const part of file.path.split('/')) {
        ancestor = join(ancestor, part);
        if ((await lstat(ancestor)).isSymbolicLink())
          throw new Error(`${name}: symlink in package input`);
      }
      if (!(await lstat(full)).isFile()) throw new Error(`${name}: non-file package entry`);
      if (file.path !== 'package.json')
        inspectBytes(file.path, await readFile(full), restrictedHashes);
    }
    const packed = run(pnpm, ['pack', '--json', '--pack-destination', staging], directory, true);
    const archiveName = basename(packed.filename);
    const archive = join(staging, archiveName);
    const actual = run('tar', ['-tzf', archive])
      .toString('utf8')
      .trim()
      .split('\n')
      .filter(Boolean);
    const verbose = run('tar', ['-tvzf', archive])
      .toString('utf8')
      .trim()
      .split('\n')
      .filter(Boolean);
    if (verbose.some((line) => line[0] !== '-'))
      throw new Error(
        `${name}: archive contains links/directories/special entries requiring review`,
      );
    const expected = packed.files.map((file) => `package/${safePath(file.path)}`);
    // pnpm may inherit a workspace LICENSE without listing it in --json.
    // Accept only the exact regular root file; other unreported entries fail.
    if (actual.includes('package/LICENSE') && !expected.includes('package/LICENSE')) {
      const license = join(root, 'LICENSE');
      const info = await lstat(license);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unreviewed root license input');
      assert.deepEqual(
        run('tar', ['-xOzf', archive, '--', 'package/LICENSE']),
        await readFile(license),
        `${name}: inherited license differs from the workspace root`,
      );
      expected.push('package/LICENSE');
    }
    expected.sort();
    assert.deepEqual(
      [...actual].sort(),
      expected,
      `${name}: actual archive differs from reported file list`,
    );
    const entries = [];
    let packedManifest;
    for (const path of actual) {
      if (!path.startsWith('package/')) throw new Error(`${name}: unknown archive root`);
      const short = safePath(path.slice(8));
      const bytes = run('tar', ['-xOzf', archive, '--', path]);
      inspectBytes(short, bytes, restrictedHashes);
      entries.push({ path: short, bytes: bytes.length, sha256: digest(bytes) });
      if (short === 'package.json') packedManifest = JSON.parse(bytes.toString('utf8'));
    }
    assert.ok(packedManifest, `${name}: packed manifest missing`);
    manifestGate(packedManifest);
    for (const target of exportsList(packedManifest.exports)) {
      if (!target.startsWith('./') || !entries.some((entry) => entry.path === target.slice(2)))
        throw new Error(`${name}: missing exported build output ${target}`);
    }
    for (const range of Object.values(packedManifest.dependencies ?? {})) {
      if (/^(?:workspace:|file:|link:)/.test(range))
        throw new Error(`${name}: unresolved local package dependency`);
    }
    report.push({
      name: packedManifest.name,
      version: packedManifest.version,
      archive: archiveName,
      sha256: digest(await readFile(archive)),
      files: entries,
    });
    console.log(
      `Verified ${packedManifest.name}@${packedManifest.version}: ${entries.length} archive files; no known runtime-resource path/digest match.`,
    );
  }
  for (const result of report)
    await rename(join(staging, result.archive), join(destination, result.archive));
  await writeFile(
    join(destination, 'pack-report.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), generatedManifestChecked, restrictedAssetDigestCount: restrictedHashes.size, limitation: 'Exact-byte and path checks do not establish clean-room provenance, derivative-code absence, licenses or public release authorization.', packages: report }, null, 2)}\n`,
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}
console.log(
  `Verified ${report.length} local SDK archives. All remain private/UNLICENSED. No publishing or source upload performed. Report: ${relative(root, join(destination, 'pack-report.json'))}`,
);
