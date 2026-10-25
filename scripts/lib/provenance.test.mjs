import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyProjectNotices } from './project-notices.mjs';
import { checkRepository, digest, inspectBytes, inspectPath, loadPolicy } from './provenance.mjs';

const original = Buffer.from('synthetic package-owned editor source');
const sourcePath = 'packages/editor-runtime/src/engine/main.js';
function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'marklyra-provenance-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.name', 'liyao']);
  git(root, ['config', 'user.email', 'fixture@example.invalid']);
  await mkdir(join(root, 'config'));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'packages/editor-runtime/src/engine'), { recursive: true });
  await writeFile(join(root, sourcePath), original);
  await writeFile(
    join(root, 'config/runtime-source.json'),
    JSON.stringify({
      schema: 2,
      resources: [{ path: sourcePath, size: original.length, sha256: digest(original) }],
    }),
  );
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', 'fixture']);
  return root;
}

test('staged source identity cannot be concealed by clean worktree bytes or edited policy', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, sourcePath), 'changed source');
  git(root, ['add', sourcePath]);
  await writeFile(join(root, sourcePath), original);
  await assert.rejects(checkRepository(root), /Runtime source identity mismatch/);
  await writeFile(join(root, 'config/runtime-source.json'), '[]');
  await assert.rejects(checkRepository(root), /Runtime source identity mismatch/);
});

test('index and worktree checks inspect their own bytes', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, sourcePath), 'unstaged changed source');
  assert.equal((await checkRepository(root, 'tracked')).pathsAndVersions, 2);
  await assert.rejects(checkRepository(root, 'worktree'), /Runtime source identity mismatch/);
});

test('package-owned code can be copied and embedded in regular source maps', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'src/engine.js'), original);
  git(root, ['add', 'src/engine.js']);
  assert.equal((await checkRepository(root)).pathsAndVersions, 1);
  const map = { version: 3, sources: ['engine.ts'], sourcesContent: [original.toString()] };
  inspectBytes('engine.js.map', Buffer.from(JSON.stringify(map)));
  inspectBytes(
    'engine.js.map',
    Buffer.from(JSON.stringify({ sections: [{ offset: { line: 0, column: 0 }, map }] })),
  );
  const comment = '//# source' + 'MappingURL=data:application/json;base64,';
  inspectBytes(
    'engine.js',
    Buffer.from(comment + Buffer.from(JSON.stringify(map)).toString('base64')),
  );
});

test('reachable history detects a removed private file without rewriting commits', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, 'private'));
  await writeFile(join(root, 'private/engine.js'), 'not an approved path');
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', 'controlled leak']);
  git(root, ['rm', '--quiet', 'private/engine.js']);
  git(root, ['commit', '--quiet', '-m', 'controlled removal']);
  assert.equal((await checkRepository(root, 'tracked')).pathsAndVersions, 2);
  await assert.rejects(checkRepository(root, 'history'), /Forbidden provenance path/);
  assert.equal(git(root, ['rev-list', '--all', '--count']).trim(), '3');
});

test('symlink entries remain denied in both index and worktree checks', async (t) => {
  const root = await fixture(t);
  await symlink('engine.js', join(root, 'src/link.js'));
  git(root, ['add', 'src/link.js']);
  await assert.rejects(checkRepository(root), /Unreviewed Git entry/);
  await assert.rejects(checkRepository(root, 'worktree'), /Unreviewed worktree entry/);
});

test('source-map origins stay restricted in flat, indexed and inline maps', () => {
  const map = { version: 3, sources: ['../../PRIVATE/main.js'] };
  for (const object of [map, { sections: [{ offset: { line: 0, column: 0 }, map }] }])
    assert.throws(
      () => inspectBytes('engine.js.map', Buffer.from(JSON.stringify(object))),
      /Forbidden source map/,
    );
  const comment = '//# source' + 'MappingURL=data:application/json;base64,';
  assert.throws(
    () =>
      inspectBytes(
        'engine.js',
        Buffer.from(comment + Buffer.from(JSON.stringify(map)).toString('base64')),
      ),
    /Forbidden source map/,
  );
  assert.throws(
    () =>
      inspectBytes(
        'engine.js.map',
        Buffer.from(JSON.stringify({ sections: [{ url: 'https://example.invalid/map' }] })),
      ),
    /External indexed source map/,
  );
});

test('subdirectory invocation still checks the complete repository index', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, sourcePath), 'changed');
  git(root, ['add', sourcePath]);
  await assert.rejects(
    checkRepository(join(root, 'src'), 'tracked'),
    /Runtime source identity mismatch/,
  );
});

test('malformed source maps fail without printing embedded source content', () => {
  const hidden = 'synthetic private content must not be in an error';
  assert.throws(
    () => inspectBytes('broken.js.map', Buffer.from(`{${hidden}`)),
    (error) => error.message === 'Invalid source map JSON: broken.js.map',
  );
});

test('invalid staged manifests and untracked declared inputs fail inspection', async (t) => {
  const root = await fixture(t);
  git(root, ['rm', '--cached', '--quiet', sourcePath]);
  await assert.rejects(checkRepository(root, 'tracked'), /Runtime source not tracked/);
  assert.equal((await checkRepository(root, 'worktree')).pathsAndVersions, 2);
  await writeFile(join(root, 'config/runtime-source.json'), '[]');
  git(root, ['add', 'config/runtime-source.json']);
  await assert.rejects(checkRepository(root, 'tracked'), /Invalid runtime source manifest/);
});

test('unlisted engine inputs fail in both index and unstaged worktree', async (t) => {
  const root = await fixture(t);
  const path = 'packages/editor-runtime/src/engine/unlisted.js';
  await writeFile(join(root, path), 'unlisted');
  await assert.rejects(checkRepository(root, 'worktree'), /Runtime source identity mismatch/);
  git(root, ['add', path]);
  await assert.rejects(checkRepository(root), /Runtime source identity mismatch/);
});

test('missing declared worktree inputs fail after a local deletion', async (t) => {
  const root = await fixture(t);
  await rm(join(root, sourcePath));
  await assert.rejects(checkRepository(root, 'worktree'), /Runtime source missing from worktree/);
});

test('paths reject nested/case/Windows/private outputs while keeping authored sources valid', () => {
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
  inspectPath(sourcePath);
  inspectPath('config/runtime-source.json');
  for (const source of ['C:\\Users\\own\\engine.ts', 'file:///Users/own/engine.ts'])
    assert.throws(
      () => inspectBytes('engine.js.map', Buffer.from(JSON.stringify({ sources: [source] }))),
      /Forbidden source map/,
    );
});

test('runtime output aliases reject traversal and collisions', async (t) => {
  const root = await fixture(t);
  const path = join(root, 'config/runtime-source.json');
  const policy = JSON.parse(await readFile(path, 'utf8'));
  policy.resources[0].runtimePath = '../outside.js';
  await writeFile(path, JSON.stringify(policy));
  await assert.rejects(loadPolicy(root), /Forbidden provenance path/);
  policy.resources[0].runtimePath = 'appsrc/main.js';
  policy.resources[0].additionalRuntimePaths = ['appsrc/main.js'];
  await writeFile(path, JSON.stringify(policy));
  await assert.rejects(loadPolicy(root), /Invalid runtime output mapping/);
  policy.resources[0].additionalRuntimePaths = ['preferences/main.js'];
  await writeFile(path, JSON.stringify(policy));
  assert.equal((await loadPolicy(root)).resources.size, 1);
});

async function noticeFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'marklyra-notices-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, 'generated');
  for (const directory of [root, output]) {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'LICENSE'), 'root project license');
  }
  return { root, output };
}

test('project license verification rejects changed and missing copies', async (t) => {
  const { root, output } = await noticeFixture(t);
  await verifyProjectNotices(root, output);
  const notice = join(output, 'LICENSE');
  await writeFile(notice, 'different license');
  await assert.rejects(verifyProjectNotices(root, output), /Project notice bundle mismatch/);
  await rm(notice);
  await assert.rejects(verifyProjectNotices(root, output), /Project notice must be a regular file/);
  await writeFile(notice, 'root project license');
  await verifyProjectNotices(root, output);
});

test('project license source and output symlinks remain rejected', async (t) => {
  const { root, output } = await noticeFixture(t);
  const license = join(output, 'LICENSE');
  await rm(license);
  await symlink(join(root, 'LICENSE'), license);
  await assert.rejects(verifyProjectNotices(root, output), /regular file/);
  await rm(license);
  await writeFile(license, 'root project license');
  const notice = join(root, 'LICENSE');
  await rm(notice);
  await symlink(join(output, 'LICENSE'), notice);
  await assert.rejects(verifyProjectNotices(root, output), /regular file/);
});

test('retired notice directories cannot silently remain beside the shared texts', async (t) => {
  const { root, output } = await noticeFixture(t);
  await mkdir(join(output, 'licenses'));
  await assert.rejects(
    verifyProjectNotices(root, output),
    /Retired per-component notice directory/,
  );
});

test('root license source bytes survive an autocrlf checkout', async (t) => {
  const root = await fixture(t);
  await writeFile(
    join(root, '.gitattributes'),
    await readFile(new URL('../../.gitattributes', import.meta.url)),
  );
  const notices = new Map([
    ['LICENSE', Buffer.from('synthetic project license\r\nunchanged text\r\n')],
  ]);
  git(root, ['config', 'core.autocrlf', 'true']);
  for (const [name, bytes] of notices) await writeFile(join(root, name), bytes);
  git(root, ['add', '.']);
  for (const name of notices.keys()) await rm(join(root, name));
  git(root, ['checkout-index', '--all', '--force']);
  for (const [name, bytes] of notices) assert.deepEqual(await readFile(join(root, name)), bytes);
});
