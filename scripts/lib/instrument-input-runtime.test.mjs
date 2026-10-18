import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test, { after } from 'node:test';
import { Script } from 'node:vm';
import { instrumentInputRuntime, observerSource } from '../instrument-input-runtime.mjs';

const fixtureRoot = resolve('artifacts/validation/input');
await mkdir(fixtureRoot, { recursive: true });
const directory = await mkdtemp(resolve(fixtureRoot, 'contract-'));
after(() => rm(directory, { recursive: true, force: true }));
const source = resolve(directory, 'source');
await mkdir(source);
await mkdir(resolve(source, 'appsrc'));
const frame = 'globalThis.fixtureOnly = true;\n',
  digest = (value) => createHash('sha256').update(value).digest('hex');
await writeFile(resolve(source, 'frame-host.js'), frame);
await writeFile(
  resolve(source, 'runtime-manifest.json'),
  JSON.stringify({ adapterSha256: digest(frame) }),
);
await writeFile(resolve(source, 'index.html'), '<body id="fixture">fixture only</body>');
await writeFile(resolve(source, 'appsrc/main.js'), '// authored empty test fixture\n');
test('input instrumentation changes only the copied authored adapter and manifest', async () => {
  const target = resolve(directory, 'copy');
  const report = await instrumentInputRuntime(source, target);
  assert.deepEqual(report.changed, ['frame-host.js', 'runtime-manifest.json']);
  assert.equal(report.sourceUnchanged, true);
  assert.equal(await readFile(resolve(source, 'frame-host.js'), 'utf8'), frame);
  const output = await readFile(resolve(target, 'frame-host.js'), 'utf8');
  assert.equal(output, frame + observerSource());
  new Script(output);
  const manifest = JSON.parse(await readFile(resolve(target, 'runtime-manifest.json')));
  assert.equal(manifest.adapterSha256, digest(output));
  assert.equal(manifest.inputDiagnostics.kind, 'READONLY_TEST_INSTRUMENTATION');
  await assert.rejects(instrumentInputRuntime(source, target), /overwrite/);
});
test('an unknown adapter or an existing/symlink destination is never overwritten', async () => {
  await assert.rejects(instrumentInputRuntime(source, source), /new ignored/);
  await assert.rejects(instrumentInputRuntime(source, '/Applications/Typora.app'), /new ignored/);
  const link = resolve(directory, 'link');
  await symlink(source, link);
  await assert.rejects(instrumentInputRuntime(source, resolve(link, 'nested')), /symlink parents/);
  await writeFile(resolve(source, 'frame-host.js'), frame + '// mutation\n');
  await assert.rejects(
    instrumentInputRuntime(source, resolve(directory, 'unknown')),
    /digest drift/,
  );
});
