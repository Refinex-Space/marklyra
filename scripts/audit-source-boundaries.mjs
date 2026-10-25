import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { verifyProjectNotices } from './lib/project-notices.mjs';
import { digest, inspectBytes, loadPolicy, verifyRuntimeInputMapping } from './lib/provenance.mjs';
import { verifyRuntimeSources } from './lib/runtime-resources.mjs';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFile(resolve(root, path));
const json = async (path) => JSON.parse(await read(path));
const { resources: sourceInputs } = await loadPolicy(root);
await verifyRuntimeSources(root);
const rules = [
  ['packages/editor-runtime/vendor/', 'VENDORED_LIBRARY', 'package-owned-library-input'],
  ['packages/editor-runtime/src/engine/', 'PROJECT_IMPLEMENTATION', 'package-owned-editor-engine'],
  ['packages/editor-runtime/src/page/', 'PROJECT_IMPLEMENTATION', 'package-owned-editor-page'],
  ['packages/editor-runtime/assets/', 'EDITOR_ASSET', 'package-owned-input-with-component-notices'],
  [
    'apps/desktop/src/features/settings/runtime-preferences/page/',
    'PROJECT_IMPLEMENTATION',
    'application-owned-settings-page',
  ],
  ['apps/desktop/src-tauri/icons/titlebar/', 'PROJECT_ASSET', 'application-owned-native-images'],
  ['packages/editor-runtime/src/runtime/', 'INTEGRATION_ADAPTER', 'editor-runtime-ABI-adapter'],
  [
    'packages/editor-runtime/src/',
    'NEW_IMPLEMENTATION_INTEGRATION_ADAPTER',
    'tracked-editor-runtime-dependency',
  ],
  ['packages/editor-core/', 'NEW_IMPLEMENTATION', 'portable-editor-module'],
  ['packages/editor-markdown/', 'NEW_IMPLEMENTATION', 'portable-editor-module'],
  [
    'packages/editor-view/',
    'BEHAVIOR_REIMPLEMENTATION_NEW_IMPLEMENTATION',
    'portable-editor-module',
  ],
  ['packages/editor-extensions/', 'NEW_IMPLEMENTATION', 'portable-editor-module'],
  ['packages/editor-themes/', 'NEW_IMPLEMENTATION', 'portable-editor-module'],
  [
    'packages/editor-react/',
    'NEW_IMPLEMENTATION_INTEGRATION_ADAPTER',
    'typed-editor-runtime-adapter',
  ],
  [
    'packages/editor-runtime/',
    'NEW_IMPLEMENTATION_INTEGRATION_ADAPTER',
    'tracked-editor-runtime-dependency',
  ],
  [
    'apps/desktop/src-tauri/icons/',
    'NEW_IMPLEMENTATION',
    'owner-provided-png-and-tauri-generated-icons',
  ],
  ['apps/', 'NEW_IMPLEMENTATION_BEHAVIOR_REIMPLEMENTATION', 'desktop-application'],
  ['crates/', 'NEW_IMPLEMENTATION', 'native-host-services'],
  ['scripts/lib/runtime-', 'INTEGRATION_ADAPTER', 'tracked-editor-source-transform'],
  ['scripts/', 'NEW_IMPLEMENTATION_INTEGRATION_ADAPTER', 'engineering-tooling'],
  [
    'tests/',
    'BEHAVIOR_REIMPLEMENTATION_NEW_TESTS',
    'authored-vectors-and-runtime-metadata-not-original-test-source',
  ],
  ['tools/', 'NEW_IMPLEMENTATION_INTEGRATION_ADAPTER', 'engineering-tools'],
];
const paths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean)
  .sort();
const modules = new Map(
  rules.map(([prefix, classification, state]) => [
    prefix,
    {
      prefix,
      classification,
      state,
      basis: 'Project module boundaries and verified source byte identities',
      inputs: [],
    },
  ]),
);
for (const path of paths) {
  const rule = rules.find(([prefix]) => path.startsWith(prefix));
  if (!rule) continue;
  let bytes;
  try {
    bytes = await read(path);
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  inspectBytes(path, bytes);
  modules.get(rule[0]).inputs.push({ path, sha256: digest(bytes) });
}
const packageRules = [];
const knownPackages = new Set([
  'editor-core',
  'editor-markdown',
  'editor-view',
  'editor-extensions',
  'editor-themes',
  'editor-runtime',
  'editor-react',
]);
for (const entry of (await readdir(resolve(root, 'packages'), { withFileTypes: true })).filter(
  (entry) => entry.isDirectory(),
)) {
  if (!knownPackages.has(entry.name))
    throw new Error(`Package needs source classification: ${entry.name}`);
  const folder = `packages/${entry.name}`,
    manifest = await json(`${folder}/package.json`);
  const editorRuntimeRequired = ['editor-runtime', 'editor-react'].includes(entry.name);
  packageRules.push({
    name: manifest.name,
    version: manifest.version,
    folder,
    private: manifest.private,
    license: manifest.license,
    classification: editorRuntimeRequired
      ? 'project-editor-with-package-owned-runtime'
      : 'project-portable-editor-module',
    candidateSourcePrefixes: [`${folder}/`],
    editorRuntimeRequired,
    dependencies: manifest.dependencies ?? {},
    peerDependencies: manifest.peerDependencies ?? {},
    files: manifest.files,
    exports: manifest.exports,
  });
  if (manifest.private !== true || manifest.license !== 'Apache-2.0')
    throw new Error(`Unexpected release status: ${manifest.name}`);
}
const runtime = await json('packages/editor-runtime/dist/page/runtime-manifest.json');
const runtimeInputIntegrity = await verifyRuntimeInputMapping(root, runtime);
const projectNotices = await verifyProjectNotices(
  root,
  resolve(root, 'packages/editor-runtime/dist/page'),
);
const resourceMap = new Map();
for (const [prefix, manifest] of [
  ['', runtime],
  ['preferences/', runtime.preferences],
])
  for (const record of manifest?.resources ?? []) resourceMap.set(prefix + record.path, record);
async function walk(directory, base = directory, result = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(full, base, result);
    else if (entry.isFile()) result.push(relative(base, full).split(sep).join('/'));
    else throw new Error('Unexpected link/special runtime resource');
  }
  return result.sort();
}
const resources = [];
const inputByOutput = new Map();
for (const record of sourceInputs.values())
  for (const path of [record.runtimePath, ...(record.additionalRuntimePaths ?? [])])
    if (path) inputByOutput.set(path, record.path);
for (const path of await walk(resolve(root, 'packages/editor-runtime/dist/page'))) {
  const sha256 = digest(await read(`packages/editor-runtime/dist/page/${path}`)),
    record = resourceMap.get(path);
  if (record && sha256 !== record.runtimeSha256) throw new Error(`Runtime drift: ${path}`);
  const sourcePath = inputByOutput.get(path);
  let classification = sourcePath ? 'WORKSPACE_INPUT' : 'GENERATED_OUTPUT';
  if (record?.sourceInputs) classification = 'GENERATED_SOURCE_BUNDLE';
  if (path === 'LICENSE') classification = 'PROJECT_NOTICE';
  if (
    ['frame-host.js', 'preferences/child-host.js', 'empty.css', 'preferences/empty.css'].includes(
      path,
    )
  )
    classification = 'GENERATED_NEW_INTEGRATION_ADAPTER';
  resources.push({
    path,
    sha256,
    classification,
    ...(sourcePath ? { sourcePath } : {}),
    ...(record?.sourceInputs ? { sourceInputs: record.sourceInputs } : {}),
  });
}
for (const path of resourceMap.keys())
  if (!resources.some((resource) => resource.path === path))
    throw new Error(`Missing declared runtime resource: ${path}`);
const nativeManifest = await json('scripts/native-titlebar-manifest.json');
const nativeAssets = [];
for (const asset of nativeManifest.assets) {
  const sha256 = digest(await read(`apps/desktop/src-tauri/icons/titlebar/${asset.file}`));
  if (sha256 !== asset.sha256) throw new Error('Native resource drift');
  nativeAssets.push({
    path: asset.file,
    sha256,
    classification: 'TRACKED_NATIVE_IMAGE',
  });
}
const report = {
  schema: 1,
  scope: 'Workspace module boundaries and generated runtime integrity',
  modules: [...modules.values()]
    .filter((module) => module.inputs.length)
    .map((module) => ({
      ...module,
      treeSha256: digest(Buffer.from(JSON.stringify(module.inputs))),
    })),
  packages: packageRules.sort((a, b) => a.name.localeCompare(b.name)),
  projectLicense: { spdx: 'Apache-2.0', path: 'LICENSE', sha256: digest(await read('LICENSE')) },
  requiredInputs: [
    'packages/editor-runtime',
    'packages/editor-themes',
    'apps/desktop/src/features/settings/runtime-preferences/page',
    'apps/desktop/src-tauri/icons/titlebar',
  ],
  projectNotices,
  runtimeInputIntegrity,
};
await mkdir(resolve(root, 'artifacts'), { recursive: true });
await writeFile(
  resolve(root, 'artifacts/source-audit.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  resolve(root, 'artifacts/runtime-audit.json'),
  `${JSON.stringify({ schema: 2, sourceVersion: runtime.sourceVersion, resources, nativeAssets }, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    modules: report.modules.length,
    sourceInputFiles: report.modules.reduce((total, module) => total + module.inputs.length, 0),
    packages: packageRules.length,
    runtimeResources: resources.length,
    nativeAssets: nativeAssets.length,
    notices: ['LICENSE'],
  }),
);
