import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  copyProjectNotices,
  readProjectNotices,
  sharedNoticeParts,
  verifyProjectNotices,
} from './project-notices.mjs';

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'marklyra-notices-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(resolve(root, 'LICENSE'), 'Project license fixture\n');
  await writeFile(resolve(root, 'THIRD-PARTY-NOTICES.txt'), 'Received notice fixture\n');
  const output = resolve(root, 'output');
  await mkdir(output);
  return { root, output };
}

test('one shared notice accompanies the project license and is checked byte-for-byte', async (t) => {
  const { root, output } = await fixture(t);
  const identity = await copyProjectNotices(root, output);
  assert.equal(identity.noticeFiles, 1);
  assert.deepEqual(await verifyProjectNotices(root, output), identity);
  await writeFile(resolve(output, 'THIRD-PARTY-NOTICES.txt'), 'changed notice');
  await assert.rejects(verifyProjectNotices(root, output), /bundle mismatch/);
});

test('a missing, empty or redirected source notice is rejected', async (t) => {
  const { root } = await fixture(t);
  const notice = resolve(root, 'THIRD-PARTY-NOTICES.txt');
  await writeFile(notice, '');
  await assert.rejects(readProjectNotices(root), /empty/);
  await rm(notice);
  await assert.rejects(readProjectNotices(root), /regular file/);
  await symlink(resolve(root, 'LICENSE'), notice);
  await assert.rejects(readProjectNotices(root), /regular file/);
});

test('redirected output never overwrites its target or partially copies the other file', async (t) => {
  const { root, output } = await fixture(t);
  const sentinel = resolve(root, 'sentinel');
  await writeFile(sentinel, 'leave this alone');
  await writeFile(resolve(output, 'LICENSE'), 'existing output');
  await symlink(sentinel, resolve(output, 'THIRD-PARTY-NOTICES.txt'));
  await assert.rejects(copyProjectNotices(root, output), /regular file/);
  assert.equal(await readFile(sentinel, 'utf8'), 'leave this alone');
  assert.equal(await readFile(resolve(output, 'LICENSE'), 'utf8'), 'existing output');
});

test('a stale per-component directory cannot pass as consolidated output', async (t) => {
  const { root, output } = await fixture(t);
  await copyProjectNotices(root, output);
  await mkdir(resolve(output, 'licenses'));
  await assert.rejects(verifyProjectNotices(root, output), /Retired per-component/);
});

test('shared terms retain distinct copyrights and additional restrictions', () => {
  const terms = 'Permission is hereby granted, fixture grant.\nFixture disclaimer.';
  const first = sharedNoticeParts(`Copyright A\n\n${terms}`, '');
  const second = sharedNoticeParts(`Copyright B\n\n${terms}`, '');
  assert.equal(first.terms, second.terms);
  assert.equal(first.attribution, 'Copyright A');
  assert.equal(second.attribution, 'Copyright B');
  const extra = sharedNoticeParts(`Copyright A\n${terms}\nAdditional received condition.`, '');
  assert.notEqual(extra.terms, terms);
  assert.ok(extra.terms.endsWith('Additional received condition.'));
});

test('only matching Apache terms are delegated to the root license', () => {
  const apache = 'Apache License\nVersion 2.0\nFixture terms.\nEND OF TERMS AND CONDITIONS';
  const result = sharedNoticeParts(`Copyright Owner\n${apache}\nAdditional exception.`, apache);
  assert.equal(result.attribution, 'Copyright Owner\n\nAdditional exception.');
  assert.ok(result.terms.includes('supplied in LICENSE'));
  const changed = apache.replace('Fixture terms.', 'Different conditions.');
  assert.equal(sharedNoticeParts(changed, apache).terms, changed);
});
