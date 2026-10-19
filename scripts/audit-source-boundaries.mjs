import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { digest, inspectBytes, loadPolicy } from './lib/provenance.mjs';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFile(resolve(root, path));
const json = async (path) => JSON.parse(await read(path));
const { hashes, exceptions } = await loadPolicy(root);
const rules = [
  ['resources/', 'EDITOR_SOURCE_RESOURCE', 'tracked-project-input'],
  [
    'packages/editor-core/THIRD-PARTY-NOTICES.txt',
    'THIRD_PARTY_NOTICE',
    'received-jsdiff-BSD-3-Clause-notice',
  ],
  [
    'packages/editor-runtime/THIRD-PARTY-NOTICES.txt',
    'THIRD_PARTY_NOTICE',
    'received-jsdiff-BSD-3-Clause-notice',
  ],
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
  inspectBytes(path, bytes, hashes, exceptions);
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
      ? 'adapter-with-tracked-editor-runtime'
      : 'authored-portable-review-candidate',
    publicReleaseApproved: false,
    candidateSourcePrefixes: [`${folder}/`],
    editorRuntimeRequired,
    blockers: editorRuntimeRequired
      ? [
          'Editor runtime sources are tracked under resources/editor and built separately from SDK adapters',
          'SDK packages remain internal; publication is a separate operation',
        ]
      : [
          'SDK packages remain internal; publication is a separate operation',
          'Package functionality/public API readiness is a separate API review, not this source audit',
        ],
    dependencies: manifest.dependencies ?? {},
    peerDependencies: manifest.peerDependencies ?? {},
    files: manifest.files,
    exports: manifest.exports,
  });
  if (manifest.private !== true || manifest.license !== 'UNLICENSED')
    throw new Error(`Unexpected release status: ${manifest.name}`);
}
const runtime = await json('dist/editor-runtime/runtime-manifest.json');
const resourceMap = new Map();
for (const [prefix, manifest] of [
  ['', runtime],
  ['preferences/', runtime.preferences],
])
  for (const record of manifest.resources) resourceMap.set(prefix + record.path, record);
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
for (const path of await walk(resolve(root, 'dist/editor-runtime'))) {
  const sha256 = digest(await read(`dist/editor-runtime/${path}`)),
    record = resourceMap.get(path);
  if (record && sha256 !== record.runtimeSha256) throw new Error(`Runtime drift: ${path}`);
  let classification = record
    ? record.originalSha256 === sha256
      ? 'THIRD_PARTY_ASSET'
      : 'TRANSFORMED_EDITOR_RESOURCE'
    : 'GENERATED_METADATA_OR_ADAPTER';
  if (
    ['frame-host.js', 'preferences/child-host.js', 'empty.css', 'preferences/empty.css'].includes(
      path,
    )
  )
    classification = 'GENERATED_NEW_INTEGRATION_ADAPTER';
  resources.push({ path, sha256, classification });
}
for (const path of resourceMap.keys())
  if (!resources.some((resource) => resource.path === path))
    throw new Error(`Missing declared runtime resource: ${path}`);
const nativeManifest = await json('scripts/native-titlebar-manifest.json');
const nativeAssets = [];
for (const asset of nativeManifest.assets) {
  const sha256 = digest(await read(`resources/native-titlebar/${asset.file}`));
  if (sha256 !== asset.sha256) throw new Error('Native resource drift');
  nativeAssets.push({
    path: asset.file,
    sha256,
    classification: 'TRACKED_NATIVE_IMAGE',
  });
}
const inventory = await json('config/dependency-inventory.json');
const notices = inventory.noticeBundle
  ? await json(`${inventory.noticeBundle.directory}/manifest.json`)
  : null;
if (!notices || notices.packages.length !== inventory.packages.length)
  throw new Error('Run dependency inventory with --notices first');
if (
  JSON.stringify(notices.locks) !== JSON.stringify(inventory.locks) ||
  inventory.locks.pnpm !== digest(await read('pnpm-lock.yaml')) ||
  inventory.locks.cargo !== digest(await read('Cargo.lock'))
)
  throw new Error('Dependency/notice inventory does not match current locks');
const received = new Map(
  notices.packages.map((pkg) => [`${pkg.ecosystem}/${pkg.name}@${pkg.version}`, pkg]),
);
if (received.size !== notices.packages.length) throw new Error('Duplicate notice package mapping');
for (const pkg of inventory.packages) {
  const notice = received.get(`${pkg.ecosystem}/${pkg.name}@${pkg.version}`);
  if (
    !notice ||
    JSON.stringify(notice.declaredLicense) !== JSON.stringify(pkg.declaredLicense) ||
    JSON.stringify(notice.files.map(({ file, sha256, bytes }) => ({ file, sha256, bytes }))) !==
      JSON.stringify(pkg.licenseFiles)
  )
    throw new Error(`Notice package mapping differs: ${pkg.name}`);
}
for (const pkg of notices.packages)
  for (const file of pkg.files)
    if (
      digest(await read(`${inventory.noticeBundle.directory}/${file.bundledText}`)) !== file.sha256
    )
      throw new Error(`Notice changed: ${pkg.name}`);
const report = {
  schema: 1,
  scope: 'Module source boundaries, tracked resource identities and dependency notice integrity',
  modules: [...modules.values()]
    .filter((module) => module.inputs.length)
    .map((module) => ({
      ...module,
      treeSha256: digest(Buffer.from(JSON.stringify(module.inputs))),
    })),
  packages: packageRules.sort((a, b) => a.name.localeCompare(b.name)),
  requiredInputs: ['resources/editor', 'dist/editor-runtime', 'resources/native-titlebar'],
  releaseWhitelist: [],
  conditionalCandidatePackages: packageRules
    .filter((pkg) => !pkg.editorRuntimeRequired)
    .map((pkg) => pkg.name)
    .sort(),
  blockers: [
    'SDK package manifests remain private/UNLICENSED; publication requires separate authorization',
    `${inventory.counts.missingTopLevelLicenseText} third-party packages lack received top-level license text; output-specific license choices/NOTICE remain to review`,
    'TeXGyre 1.104 and received Ionicons conversion lineage remain unresolved',
  ],
  dependencyInventorySha256: digest(await read('config/dependency-inventory.json')),
  localNoticeBundle: inventory.noticeBundle,
};
await writeFile(resolve(root, 'config/source-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(
  resolve(root, 'config/runtime-audit.json'),
  `${JSON.stringify({ schema: 2, sourceVersion: runtime.sourceVersion, resources, nativeAssets }, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    modules: report.modules.length,
    authoredInputFiles: report.modules.reduce((total, module) => total + module.inputs.length, 0),
    packages: packageRules.length,
    runtimeResources: resources.length,
    nativeAssets: nativeAssets.length,
    noticeTexts: inventory.noticeBundle.uniqueTexts,
    releaseWhitelist: report.releaseWhitelist,
  }),
);
