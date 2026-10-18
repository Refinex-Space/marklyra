import { createHash } from 'node:crypto';
import { cp, lstat, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installInputEventObserver } from './lib/input-event-observer.mjs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const observerSource = () => `\n;(${installInputEventObserver.toString()})();\n`;
async function hashes(directory, prefix = '') {
  const result = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const path = prefix + entry.name,
      absolute = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error('Input diagnostic refuses symlinks');
    if (entry.isDirectory()) Object.assign(result, await hashes(absolute, path + '/'));
    else if (entry.isFile()) result[path] = digest(await readFile(absolute));
  }
  return result;
}
export async function instrumentInputRuntime(source, target) {
  source = resolve(source);
  target = resolve(target);
  const allowed = [resolve(root, 'private') + sep, resolve(root, 'artifacts') + sep];
  if (!allowed.some((prefix) => target.startsWith(prefix)) || source === target)
    throw Error('Diagnostic target must be a new ignored private/artifacts directory');
  for (let path = dirname(target); path !== dirname(path); path = dirname(path)) {
    const entry = await lstat(path).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (entry?.isSymbolicLink()) throw Error('Diagnostic target refuses symlink parents');
  }
  if (
    await stat(target).then(
      () => true,
      (error) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      },
    )
  )
    throw Error('Refusing to overwrite a runtime or evidence directory');
  const before = await hashes(source),
    manifest = JSON.parse(await readFile(resolve(source, 'runtime-manifest.json')));
  if (manifest.adapterSha256 !== before['frame-host.js']) throw Error('Input adapter digest drift');
  const observer = observerSource();
  await cp(source, target, { recursive: true, errorOnExist: true, force: false });
  await writeFile(
    resolve(target, 'frame-host.js'),
    Buffer.concat([await readFile(resolve(source, 'frame-host.js')), Buffer.from(observer)]),
  );
  manifest.adapterSha256 = digest(await readFile(resolve(target, 'frame-host.js')));
  manifest.inputDiagnostics = {
    kind: 'READONLY_TEST_INSTRUMENTATION',
    baseAdapterSha256: before['frame-host.js'],
    observerSha256: digest(observer),
    instrumentedAdapterSha256: manifest.adapterSha256,
    limitation:
      'Opt-in owned fixture only. Not a clean production artifact or an IME acceptance result.',
  };
  await writeFile(
    resolve(target, 'runtime-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  const after = await hashes(target),
    sourceAfter = await hashes(source);
  if (JSON.stringify(before) !== JSON.stringify(sourceAfter)) throw Error('Source runtime changed');
  const changed = Object.keys(before)
    .filter((path) => before[path] !== after[path])
    .sort();
  if (JSON.stringify(changed) !== JSON.stringify(['frame-host.js', 'runtime-manifest.json']))
    throw Error('Unexpected instrumentation difference');
  const report = {
    source,
    target,
    sourceUnchanged: true,
    files: Object.keys(after).length,
    changed,
    base: before['frame-host.js'],
    instrumented: after['frame-host.js'],
    observerSha256: digest(observer),
    originalIndexUnchanged: before['index.html'] === after['index.html'],
    originalMainUnchanged: before['appsrc/main.js'] === after['appsrc/main.js'],
  };
  await writeFile(
    resolve(dirname(target), 'input-instrumentation.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , source, target] = process.argv;
  if (!source || !target || !isAbsolute(source) || !isAbsolute(target))
    throw Error('Usage: node instrument-input-runtime.mjs ABS_SOURCE ABS_NEW_PRIVATE_TARGET');
  console.log(JSON.stringify(await instrumentInputRuntime(source, target)));
}
