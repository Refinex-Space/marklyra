import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { loadSourceBundlePlans, sourceBundleInputs } from './lib/source-bundles.mjs';

const root = resolve(import.meta.dirname, '..');
const inputs = [
  ['packages/editor-runtime/src/engine', 'appsrc'],
  ['packages/editor-runtime/src/page', ''],
  ['packages/editor-runtime/assets/styles', 'style'],
  ['packages/editor-runtime/assets/locales', 'locales'],
  ['packages/editor-runtime/vendor', 'lib'],
  ['packages/editor-themes/assets', 'style/themes'],
  ['packages/editor-themes/base.css', null],
  ['apps/desktop/src/features/settings/runtime-preferences/page', 'preferences'],
  ['apps/desktop/src-tauri/icons/titlebar', null],
];
const resources = [];
async function regularPath(path, kind, optional = false) {
  const parts = path.split('/');
  for (let index = 0; index < parts.length; index++) {
    let info;
    try {
      info = await lstat(resolve(root, ...parts.slice(0, index + 1)));
    } catch (error) {
      if (optional && index === parts.length - 1 && error.code === 'ENOENT') return;
      throw error;
    }
    const expected = index === parts.length - 1 ? kind : 'directory';
    if (info.isSymbolicLink() || (expected === 'directory' ? !info.isDirectory() : !info.isFile()))
      throw new Error(`Workspace path must be a regular ${expected}: ${path}`);
  }
}

// Validate all ancestors before traversing inputs or writing the reviewed manifest.
for (const [source] of inputs)
  await regularPath(source, source.endsWith('.css') ? 'file' : 'directory');
await regularPath('package.json', 'file');
await regularPath('config', 'directory');
await regularPath('config/runtime-source.json', 'file', true);

const bundles = await loadSourceBundlePlans(root);
const bundleInputs = new Set(bundles.flatMap(sourceBundleInputs));
const bundleOutputs = new Map(bundles.map((bundle) => [bundle.entry, bundle.output]));

async function visit(source, destination) {
  const path = resolve(root, source);
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error(`Unexpected source symlink: ${source}`);
  if (info.isDirectory()) {
    for (const name of (await readdir(path)).sort())
      await visit(
        `${source}/${name}`,
        destination === null ? null : [destination, name].filter(Boolean).join('/'),
      );
  } else if (info.isFile()) {
    const bytes = await readFile(path);
    const record = {
      path: relative(root, path).replaceAll('\\', '/'),
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    if (bundleInputs.has(source)) destination = bundleOutputs.get(source) ?? null;
    if (destination !== null) record.runtimePath = destination;
    if (destination?.startsWith('locales/'))
      record.additionalRuntimePaths = [`preferences/${destination}`];
    resources.push(record);
  } else throw new Error(`Unexpected source file type: ${source}`);
}
for (const [source, destination] of inputs) await visit(source, destination);
resources.sort((a, b) => a.path.localeCompare(b.path, 'en'));
const manifest = `${JSON.stringify({ schema: 2, project: 'MarkLyra', resources }, null, 2)}\n`;
const target = resolve(root, 'config/runtime-source.json');
const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => arg !== '--check'))
  throw new Error('Usage: node scripts/sync-runtime-sources.mjs [--check]');
if (args.includes('--check')) {
  if ((await readFile(target, 'utf8')) !== manifest)
    throw new Error(
      'Workspace input manifest is stale; run pnpm sync:runtime-sources and review the changes.',
    );
  console.log(`Verified complete mapping for ${resources.length} native workspace inputs.`);
} else {
  await writeFile(target, manifest);
  console.log(`Recorded ${resources.length} native workspace inputs.`);
}
