import { lstat, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inspectEngineSources } from '../../packages/editor-runtime/scripts/build-engine.mjs';
import { digest, inspectPath } from './package-files.mjs';
import { loadSourceBundlePlans, sourceBundleInputs } from './source-bundles.mjs';

export const repositoryRoot = resolve(import.meta.dirname, '../..');

export const runtimeEngineEntries = [
  {
    entry: 'main.js',
    source: 'packages/editor-runtime/src/engine/main.js',
    output: 'appsrc/main.js',
  },
  {
    entry: 'editor/EmojiSearchMap.js',
    source: 'packages/editor-runtime/src/engine/editor/EmojiSearchMap.js',
    output: 'appsrc/editor/EmojiSearchMap.js',
  },
];

export async function inspectRuntimeEngineSources(root = repositoryRoot) {
  const graphs = [];
  for (const entry of runtimeEngineEntries) {
    try {
      await regularInput(root, entry.source);
    } catch (error) {
      // Small resource boundary fixtures need not include executable entries.
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    graphs.push({ ...(await inspectEngineSources({ root, entry: entry.entry })), ...entry });
  }
  return graphs;
}

// Directory layout is the build contract. Files are discovered on each invocation;
// adding or editing an asset needs no registration or digest update.
export const runtimeInputRoots = [
  ['packages/editor-runtime/src/engine', 'appsrc'],
  ['packages/editor-runtime/src/page', ''],
  ['packages/editor-runtime/assets/styles', 'style'],
  ['packages/editor-runtime/assets/locales', 'locales'],
  ['packages/editor-runtime/vendor', 'lib'],
  ['packages/editor-themes/assets', 'style/themes'],
  ['packages/editor-themes/base.css', null],
  ['apps/desktop/src/features/settings/runtime-preferences/page', 'preferences'],
];

async function regularInput(root, path) {
  const parts = path.split('/');
  for (let index = 1; index <= parts.length; index++) {
    const info = await lstat(resolve(root, ...parts.slice(0, index)));
    if (info.isSymbolicLink() || (index < parts.length && !info.isDirectory()))
      throw new Error(`Runtime input must stay inside regular workspace directories: ${path}`);
    if (index === parts.length) return info;
  }
}

export async function collectRuntimeInputs(root = repositoryRoot) {
  const plans = await loadSourceBundlePlans(root);
  const engineGraphs = await inspectRuntimeEngineSources(root);
  const bundleInputs = new Set(plans.flatMap(sourceBundleInputs));
  const bundleOutputs = new Map(plans.map((plan) => [plan.entry, plan.output]));
  const engineInputs = new Set(engineGraphs.flatMap((graph) => graph.inputs));
  const engineOutputs = new Map(runtimeEngineEntries.map((entry) => [entry.source, entry.output]));
  const inputs = [];
  const outputs = new Set();

  async function visit(path, destination) {
    const info = await lstat(resolve(root, path));
    if (info.isSymbolicLink()) throw new Error(`Runtime input cannot be a symlink: ${path}`);
    if (info.isDirectory()) {
      for (const name of (await readdir(resolve(root, path))).sort())
        await visit(
          `${path}/${name}`,
          destination === null ? null : [destination, name].filter(Boolean).join('/'),
        );
      return;
    }
    if (!info.isFile()) throw new Error(`Runtime input must be a regular file: ${path}`);
    const record = { path };
    if (bundleInputs.has(path)) destination = bundleOutputs.get(path) ?? null;
    if (engineInputs.has(path)) destination = engineOutputs.get(path) ?? null;
    if (destination !== null) record.runtimePath = destination;
    if (destination?.startsWith('locales/'))
      record.additionalRuntimePaths = [`preferences/${destination}`];
    for (const output of [record.runtimePath, ...(record.additionalRuntimePaths ?? [])]) {
      if (output === undefined) continue;
      inspectPath(output);
      if (outputs.has(output)) throw new Error(`Duplicate runtime output: ${output}`);
      outputs.add(output);
    }
    inputs.push(record);
  }

  for (const [path, destination] of runtimeInputRoots) {
    await regularInput(root, path);
    await visit(path, destination);
  }
  return inputs.sort((left, right) => left.path.localeCompare(right.path, 'en'));
}

/** Check generated files against their own build metadata, without pinning source bytes. */
export async function verifyRuntimeBuild(root = repositoryRoot) {
  const directory = resolve(root, 'packages/editor-runtime/dist/page');
  if (!(await regularInput(root, 'packages/editor-runtime/dist/page')).isDirectory())
    throw new Error('Runtime output must be a regular directory');
  if (!(await regularInput(directory, 'runtime-manifest.json')).isFile())
    throw new Error('Runtime build metadata must be a regular file');
  const runtime = JSON.parse(await readFile(resolve(directory, 'runtime-manifest.json'), 'utf8'));
  const product = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  if (typeof product.version !== 'string') throw new Error('Invalid product version');
  const version = `MarkLyra ${product.version}`;
  const outputs = new Set();
  for (const [prefix, manifest] of [
    ['', runtime],
    ['preferences/', runtime.preferences],
  ]) {
    if (!manifest || manifest.sourceVersion !== version || !Array.isArray(manifest.resources))
      throw new Error('Invalid runtime build metadata or product version');
    for (const resource of manifest.resources) {
      const path = prefix + resource.path;
      inspectPath(path);
      if (outputs.has(path)) throw new Error(`Duplicate runtime output: ${path}`);
      outputs.add(path);
      if (!(await regularInput(directory, path)).isFile())
        throw new Error(`Runtime output must be a regular file: ${path}`);
      if (digest(await readFile(resolve(directory, path))) !== resource.runtimeSha256)
        throw new Error(`Runtime build output changed: ${path}`);
    }
  }
  for (const [path, expected] of [
    ['frame-host.js', runtime.adapterSha256],
    ['preferences/child-host.js', runtime.preferences.adapterSha256],
  ]) {
    if (!(await regularInput(directory, path)).isFile())
      throw new Error(`Runtime output must be a regular file: ${path}`);
    if (digest(await readFile(resolve(directory, path))) !== expected)
      throw new Error(`Runtime build adapter changed: ${path}`);
  }
  return { outputs: outputs.size, sourceVersion: version };
}
