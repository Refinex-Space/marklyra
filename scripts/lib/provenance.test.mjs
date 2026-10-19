import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { checkRepository, digest, inspectBytes, inspectPath } from './provenance.mjs';

const original = Buffer.from('synthetic tracked editor resource');
const derived = Buffer.from('synthetic tracked auxiliary resource');
function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'marklyra-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.name', 'refinex']);
  git(root, ['config', 'user.email', 'refinex@users.noreply.github.com']);
  await mkdir(join(root, 'config'), { recursive: true });
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'resources/editor/appsrc'), { recursive: true });
  const resources = [
    { path: 'resources/editor/appsrc/main.js', size: original.length, sha256: digest(original) },
    { path: 'resources/editor/auxiliary.js', size: derived.length, sha256: digest(derived) },
  ];
  await writeFile(join(root, resources[0].path), original);
  await writeFile(join(root, resources[1].path), derived);
  await writeFile(
    join(root, 'config/runtime-source.json'),
    JSON.stringify({
      schema: 2,
      resources,
      noticeExceptions: [
        {
          path: 'licenses/received.txt',
          sha256: digest(original),
          evidence: 'synthetic notice',
        },
      ],
    }),
  );
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', 'fixture']);
  return root;
}

test('actual staged bytes cannot be concealed by clean worktree bytes or edited policy', async (t) => {
  const root = await fixture(t),
    file = join(root, 'src/engine.js');
  await writeFile(file, original);
  git(root, ['add', 'src/engine.js']);
  await writeFile(file, 'export const safe = true;');
  await assert.rejects(checkRepository(root), /Restricted asset/);
  await writeFile(join(root, 'config/runtime-source.json'), '[]');
  await assert.rejects(checkRepository(root), /Restricted asset/);
});

test('clean index remains clean when unstaged worktree contains a private fixture', async (t) => {
  const root = await fixture(t),
    file = join(root, 'src/engine.js');
  await writeFile(file, 'export const safe = true;');
  git(root, ['add', 'src/engine.js']);
  await writeFile(file, original);
  const result = await checkRepository(root);
  assert.equal(result.pathsAndVersions, 1);
});

test('reachable history detects a removed private file without rewriting commits', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, 'private'));
  await writeFile(join(root, 'private/engine.js'), 'not an approved path');
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', 'controlled leak']);
  git(root, ['rm', '--quiet', 'private/engine.js']);
  git(root, ['commit', '--quiet', '-m', 'controlled removal']);
  assert.equal((await checkRepository(root, 'tracked')).pathsAndVersions, 3);
  await assert.rejects(checkRepository(root, 'history'), /Forbidden provenance path/);
  assert.equal(git(root, ['rev-list', '--all', '--count']).trim(), '3');
});

test('exact notice exception is location bound; derivatives and symlinks stay denied', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, 'licenses'));
  await writeFile(join(root, 'licenses/received.txt'), original);
  git(root, ['add', '.']);
  await checkRepository(root);
  await writeFile(join(root, 'src/renamed.txt'), original);
  git(root, ['add', '.']);
  await assert.rejects(checkRepository(root), /Restricted asset/);
  git(root, ['rm', '--cached', '--quiet', 'src/renamed.txt']);
  await writeFile(join(root, 'src/variant.js'), derived);
  git(root, ['add', 'src/variant.js']);
  await assert.rejects(checkRepository(root), /Restricted asset/);
  git(root, ['rm', '--cached', '--quiet', 'src/variant.js']);
  await symlink('variant.js', join(root, 'src/link.js'));
  git(root, ['add', 'src/link.js']);
  await assert.rejects(checkRepository(root), /Unreviewed Git entry/);
});

test('known runtime source in flat, indexed and inline maps is rejected', () => {
  const hashes = new Set([digest(original)]),
    map = { version: 3, sources: ['engine.ts'], sourcesContent: [original.toString()] };
  assert.throws(
    () => inspectBytes('engine.js.map', Buffer.from(JSON.stringify(map)), hashes),
    /Restricted source/,
  );
  assert.throws(
    () =>
      inspectBytes(
        'engine.js.map',
        Buffer.from(JSON.stringify({ sections: [{ offset: { line: 0, column: 0 }, map }] })),
        hashes,
      ),
    /Restricted source/,
  );
  const comment = '//# source' + 'MappingURL=data:application/json;base64,';
  assert.throws(
    () =>
      inspectBytes(
        'engine.js',
        Buffer.from(comment + Buffer.from(JSON.stringify(map)).toString('base64')),
        hashes,
      ),
    /Restricted source/,
  );
  assert.throws(
    () =>
      inspectBytes(
        'engine.js.map',
        Buffer.from(JSON.stringify({ sources: ['../../PRIVATE/main.js'] })),
        hashes,
      ),
    /Forbidden source map/,
  );
  inspectBytes('frame-host.js', Buffer.from('export const adapter = true;'), hashes);
});

test('subdirectory invocation still checks the complete repository index', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'leak.js'), derived);
  git(root, ['add', 'leak.js']);
  await assert.rejects(checkRepository(join(root, 'src'), 'tracked'), /Restricted asset/);
});

test('malformed source maps fail without printing embedded source content', () => {
  const hidden = 'synthetic private content must not be in an error';
  assert.throws(
    () => inspectBytes('broken.js.map', Buffer.from(`{${hidden}`), new Set()),
    (error) => error.message === 'Invalid source map JSON: broken.js.map',
  );
});

test('invalid staged manifest and changed or untracked runtime sources fail inspection', async (t) => {
  const root = await fixture(t);
  const path = 'resources/editor/appsrc/main.js';
  await writeFile(join(root, path), 'changed source');
  git(root, ['add', path]);
  await assert.rejects(checkRepository(root, 'tracked'), /Runtime source identity mismatch/);
  git(root, ['restore', '--staged', path]);
  git(root, ['rm', '--cached', '--quiet', path]);
  await assert.rejects(checkRepository(root, 'tracked'), /Runtime source not tracked/);
  git(root, ['restore', '--staged', path]);
  await writeFile(join(root, 'config/runtime-source.json'), '[]');
  git(root, ['add', 'config/runtime-source.json']);
  await assert.rejects(checkRepository(root, 'tracked'), /Invalid runtime source manifest/);
});

test('tracked resource bytes are allowed at their exact source path without weakening private paths', async (t) => {
  const root = await fixture(t);
  await checkRepository(root, 'tracked');
  await writeFile(join(root, 'resources/editor/unlisted.js'), 'unlisted');
  git(root, ['add', '.']);
  await assert.rejects(checkRepository(root), /Runtime source identity mismatch/);
});

test('paths reject nested/case/Windows/private outputs while keeping actual adapter source valid', () => {
  for (const path of [
    'x/Private/main.js',
    'x/.env.local',
    'X.app/main',
    'dist/engine.exe',
    '../file',
    'a\\private\\b',
    'artifacts/own.json',
  ])
    assert.throws(() => inspectPath(path));
  inspectPath('packages/editor-runtime/src/runtime/frame-host.ts');
  inspectPath('config/runtime-source.json');
  for (const source of ['C:\\Users\\own\\engine.ts', 'file:///Users/own/engine.ts'])
    assert.throws(
      () =>
        inspectBytes(
          'engine.js.map',
          Buffer.from(JSON.stringify({ sources: [source] })),
          new Set(),
        ),
      /Forbidden source map/,
    );
});
