import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { build } from 'vite';
import { prepareBuiltinThemes } from '../../../scripts/lib/builtin-themes.mjs';
import { copyProjectNotices } from '../../../scripts/lib/project-notices.mjs';
import { collectRuntimeInputs } from '../../../scripts/lib/runtime-resources.mjs';
import { assembleSourceBundles, bundleManifests } from '../../../scripts/lib/source-bundles.mjs';

const repository = resolve(import.meta.dirname, '../../..');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Refuse redirected inputs and output ancestors before any generated files are removed. */
export async function verifyRuntimeBuildLayout(root) {
  async function regular(path, kind, optional = false) {
    const parts = path.split('/');
    for (let index = 0; index < parts.length; index++) {
      let info;
      try {
        info = await lstat(resolve(root, ...parts.slice(0, index + 1)));
      } catch (error) {
        if (optional && error.code === 'ENOENT') return;
        throw error;
      }
      const expected = index === parts.length - 1 ? kind : 'directory';
      if (
        info.isSymbolicLink() ||
        (expected === 'directory' ? !info.isDirectory() : !info.isFile())
      )
        throw new Error(`Runtime build path must be a regular ${expected}: ${path}`);
    }
  }
  await regular('packages/editor-runtime/dist/page', 'directory', true);
  await regular('LICENSE', 'file');
  await regular('package.json', 'file');
  await regular('packages/editor-runtime/src/page/index.html', 'file');
  await regular('apps/desktop/src/features/settings/runtime-preferences/page/setting.html', 'file');
  for (const manifest of bundleManifests) await regular(manifest, 'file');
  await regular('packages/editor-runtime/dist/frame-host.js', 'file');
}

/** Build the isolated editor page from the source owned by workspace packages. */
export async function buildRuntimePage({ root = repository } = {}) {
  await verifyRuntimeBuildLayout(root);
  const inputs = await collectRuntimeInputs(root);
  const bundles = await assembleSourceBundles(root);
  const product = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const output = resolve(root, 'packages/editor-runtime/dist/page');
  const destinations = new Set();
  const resources = [];
  const preferences = [];
  for (const entry of inputs) {
    for (const path of [entry.runtimePath, ...(entry.additionalRuntimePaths ?? [])].filter(
      Boolean,
    )) {
      if (
        path.startsWith('/') ||
        path.includes('\\') ||
        path.split('/').some((part) => !part || part === '.' || part === '..') ||
        destinations.has(path)
      )
        throw new Error(`Invalid or duplicate runtime destination: ${path}`);
      if (bundles.has(path) && bundles.get(path).entry !== entry.path)
        throw new Error(`Unexpected bundle entry for ${path}`);
      destinations.add(path);
    }
  }
  for (const path of bundles.keys())
    if (!destinations.has(path)) throw new Error(`Missing declared source bundle output: ${path}`);
  // All inputs and destinations are checked before replacing generated output.
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const entry of inputs) {
    for (const path of [entry.runtimePath, ...(entry.additionalRuntimePaths ?? [])].filter(
      Boolean,
    )) {
      const target = resolve(output, path);
      await mkdir(dirname(target), { recursive: true });
      const bundle = bundles.get(path);
      if (bundle) {
        await writeFile(target, bundle.code);
      } else await copyFile(resolve(root, entry.path), target);
      if (path === 'preferences/setting.html') {
        const page = await readFile(target, 'utf8');
        const marker = '__MARKLYRA_BUILD_VERSION__';
        if (page.split(marker).length !== 2) throw new Error('Expected one product version slot');
        await writeFile(target, page.replace(marker, product.version));
      }
      const record = {
        path: path.replace(/^preferences\//, ''),
        runtimeSha256: digest(await readFile(target)),
      };
      if (path.startsWith('preferences/')) preferences.push(record);
      else resources.push(record);
    }
  }
  resources.push(...(await prepareBuiltinThemes(root, output)));
  await copyFile(
    resolve(root, 'packages/editor-runtime/dist/frame-host.js'),
    resolve(output, 'frame-host.js'),
  );
  await writeFile(resolve(output, 'empty.css'), '/* No user CSS has been configured. */\n');
  const bundled = await build({
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: true,
      lib: {
        entry: resolve(
          root,
          'apps/desktop/src/features/settings/runtime-preferences/child-host.ts',
        ),
        formats: ['iife'],
        name: 'MarkLyraPreferencesHost',
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const chunks = (Array.isArray(bundled) ? bundled : [bundled]).flatMap((result) => result.output);
  if (chunks.length !== 1 || chunks[0].type !== 'chunk')
    throw new Error('Unexpected Preferences adapter output');
  await writeFile(resolve(output, 'preferences/child-host.js'), chunks[0].code);
  await writeFile(
    resolve(output, 'preferences/empty.css'),
    '/* Preferences use the runtime shell styles. */\n',
  );
  await copyProjectNotices(root, output);
  const preferencesManifest = {
    kind: 'runtime-preferences',
    sourceVersion: `MarkLyra ${product.version}`,
    adapterSha256: digest(chunks[0].code),
    resources: preferences,
  };
  await writeFile(
    resolve(output, 'preferences/preferences-manifest.json'),
    `${JSON.stringify(preferencesManifest, null, 2)}\n`,
  );
  const manifest = {
    sourceVersion: `MarkLyra ${product.version}`,
    kind: 'editor-runtime',
    sourceLayout: 'workspace-packages',
    adapterSha256: digest(await readFile(resolve(output, 'frame-host.js'))),
    preferences: preferencesManifest,
    resources,
  };
  await writeFile(
    resolve(output, 'runtime-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `Built ${resources.length} editor and ${preferences.length} preferences resources from workspace sources.`,
  );
  return manifest;
}
