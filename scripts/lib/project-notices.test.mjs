import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  copyProjectNotices,
  readProjectNotices,
  verifyProjectNotices,
} from './project-notices.mjs';

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'marklyra-notices-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(resolve(root, 'LICENSE'), 'Project license fixture\n');
  const output = resolve(root, 'output');
  await mkdir(output);
  return { root, output };
}

test('the project license is copied and checked byte-for-byte', async (t) => {
  const { root, output } = await fixture(t);
  const identity = await copyProjectNotices(root, output);
  assert.equal(identity.noticeFiles, 1);
  assert.deepEqual([...(await readProjectNotices(root)).keys()], ['LICENSE']);
  assert.deepEqual(await verifyProjectNotices(root, output), identity);
  await writeFile(resolve(output, 'LICENSE'), 'changed license');
  await assert.rejects(verifyProjectNotices(root, output), /bundle mismatch/);
});

test('a missing, empty or redirected project license is rejected', async (t) => {
  const { root } = await fixture(t);
  const notice = resolve(root, 'LICENSE');
  await writeFile(notice, '');
  await assert.rejects(readProjectNotices(root), /empty/);
  await rm(notice);
  await assert.rejects(readProjectNotices(root), /regular file/);
  const alternate = resolve(root, 'alternate-license');
  await writeFile(alternate, 'Alternate license fixture');
  await symlink(alternate, notice);
  await assert.rejects(readProjectNotices(root), /regular file/);
});

test('redirected license output never overwrites its target', async (t) => {
  const { root, output } = await fixture(t);
  const sentinel = resolve(root, 'sentinel');
  await writeFile(sentinel, 'leave this alone');
  await symlink(sentinel, resolve(output, 'LICENSE'));
  await assert.rejects(copyProjectNotices(root, output), /regular file/);
  assert.equal(await readFile(sentinel, 'utf8'), 'leave this alone');
  assert.equal(await readFile(resolve(output, 'LICENSE'), 'utf8'), 'leave this alone');
});

test('a stale per-component directory cannot pass as consolidated output', async (t) => {
  const { root, output } = await fixture(t);
  await copyProjectNotices(root, output);
  await mkdir(resolve(output, 'licenses'));
  await assert.rejects(verifyProjectNotices(root, output), /Retired per-component/);
});
