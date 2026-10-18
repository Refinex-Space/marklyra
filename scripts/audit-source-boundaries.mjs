import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { digest, inspectBytes, loadPolicy } from './lib/provenance.mjs';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFile(resolve(root, path));
const json = async (path) => JSON.parse(await read(path));
const { hashes } = await loadPolicy(root);
const rules = [
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
  [
    'packages/editor-runtime/src/runtime/',
    'INTEGRATION_ADAPTER',
    'private-original-ABI-review-required',
  ],
  [
    'packages/editor-runtime/src/',
    'NEW_IMPLEMENTATION_INTEGRATION_ADAPTER',
    'private-runtime-still-required',
  ],
  [
    'packages/editor-core/',
    'NEW_IMPLEMENTATION',
    'candidate-owner-license-and-source-review-required',
  ],
  [
    'packages/editor-markdown/',
    'NEW_IMPLEMENTATION',
    'candidate-owner-license-and-source-review-required',
  ],
  [
    'packages/editor-view/',
    'BEHAVIOR_REIMPLEMENTATION_NEW_IMPLEMENTATION',
    'candidate-owner-license-and-source-review-required',
  ],
  [
    'packages/editor-extensions/',
    'NEW_IMPLEMENTATION',
    'candidate-owner-license-and-source-review-required',
  ],
  [
    'packages/editor-themes/',
    'NEW_IMPLEMENTATION',
    'candidate-owner-license-and-source-review-required',
  ],
  [
    'packages/editor-react/',
    'NEW_IMPLEMENTATION_INTEGRATION_ADAPTER',
    'runtime-dependency-and-owner-review-required',
  ],
  [
    'packages/editor-runtime/',
    'NEW_IMPLEMENTATION_INTEGRATION_ADAPTER',
    'private-runtime-still-required',
  ],
  [
    'apps/desktop/src-tauri/icons/',
    'NEW_IMPLEMENTATION',
    'owner-provided-png-and-tauri-generated-icons',
  ],
  [
    'apps/',
    'NEW_IMPLEMENTATION_BEHAVIOR_REIMPLEMENTATION',
    'private-desktop-product-no-public-release',
  ],
  ['crates/', 'NEW_IMPLEMENTATION', 'private-host-services-owner-license-required'],
  [
    'scripts/lib/runtime-',
    'INTEGRATION_ADAPTER',
    'private-input-transform-no-copied-engine-approval',
  ],
  ['scripts/', 'NEW_IMPLEMENTATION_INTEGRATION_ADAPTER', 'engineering-tooling-no-clean-room-claim'],
  [
    'tests/',
    'BEHAVIOR_REIMPLEMENTATION_NEW_TESTS',
    'authored-vectors-and-runtime-metadata-not-original-test-source',
  ],
  [
    'tools/',
    'NEW_IMPLEMENTATION_INTEGRATION_ADAPTER',
    'private-evidence-inputs-no-commercial-output-in-git',
  ],
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
      basis:
        'Declared project provenance plus current hash/path inspection; not independent authorship proof or legal approval',
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
  inspectBytes(path, bytes, hashes);
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
  const privateRuntimeRequired = ['editor-runtime', 'editor-react'].includes(entry.name);
  packageRules.push({
    name: manifest.name,
    version: manifest.version,
    folder,
    private: manifest.private,
    license: manifest.license,
    classification: privateRuntimeRequired
      ? 'authored-adapter-with-private-runtime-dependency'
      : 'authored-portable-review-candidate',
    publicReleaseApproved: false,
    candidateSourcePrefixes: [`${folder}/`],
    privateRuntimeRequired,
    blockers: privateRuntimeRequired
      ? [
          'Commercial runtime excluded from Git/npm; adapter is not a standalone complete kernel',
          'Owner license choice and manual derivative-source review pending',
        ]
      : [
          'Owner license choice and manual derivative-source review pending',
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
const runtime = await json('private/runtime-assets/runtime-manifest.json');
const resourceMap = new Map();
for (const [prefix, manifest] of [
  ['', runtime],
  ['preferences/', runtime.preferences],
])
  for (const record of manifest.resources) resourceMap.set(prefix + record.path, record);
const fonts = await json('licenses/fonts/manifest.json');
const iconMetadata = await json('licenses/icons/manifest.json');
async function walk(directory, base = directory, result = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(full, base, result);
    else if (entry.isFile()) result.push(relative(base, full).split(sep).join('/'));
    else throw new Error('Unreviewed link/special private resource');
  }
  return result.sort();
}
const resources = [];
for (const path of await walk(resolve(root, 'private/runtime-assets'))) {
  const sha256 = digest(await read(`private/runtime-assets/${path}`)),
    record = resourceMap.get(path);
  if (record && sha256 !== record.runtimeSha256) throw new Error(`Runtime drift: ${path}`);
  const font = fonts.fonts.find((font) => font.sha256 === sha256);
  let classification = record
    ? record.originalSha256 === sha256
      ? 'THIRD_PARTY_ASSET'
      : 'TRANSFORMED_PRIVATE_RESOURCE'
    : 'PRIVATE_GENERATED_METADATA_OR_ADAPTER';
  if (
    ['frame-host.js', 'preferences/child-host.js', 'empty.css', 'preferences/empty.css'].includes(
      path,
    )
  )
    classification = 'GENERATED_NEW_INTEGRATION_ADAPTER';
  let licenseState = font ? font.reviewState : 'unreviewed-private-no-public-approval';
  if (sha256 === iconMetadata.fontawesome.sha256)
    licenseState = 'upstream-exact-OFL-1.1-notices-prepared';
  if (sha256 === iconMetadata.ionicons.sha256)
    licenseState = 'received-MIT-text-present-conversion-lineage-unresolved';
  const componentOrigin =
    font || path.includes('/ionicons-') || path.includes('/font-awesome-')
      ? 'received-third-party-font'
      : path.startsWith('lib/')
        ? 'received-third-party-library-versions-not-cleared'
        : path === 'appsrc/main.js'
          ? 'commercial-runtime-with-embedded-third-party-components'
          : classification === 'GENERATED_NEW_INTEGRATION_ADAPTER'
            ? 'authored-adapter-may-bundle-declared-dependencies'
            : 'original-or-generated-private-material';
  resources.push({
    path,
    sha256,
    classification,
    componentOrigin,
    licenseState,
    publicReleaseApproved: false,
  });
}
for (const path of resourceMap.keys())
  if (!resources.some((resource) => resource.path === path))
    throw new Error(`Missing declared runtime resource: ${path}`);
const nativeManifest = await json('scripts/native-titlebar-manifest.json');
const nativeAssets = [];
for (const asset of nativeManifest.assets) {
  const sha256 = digest(await read(`private/native-titlebar/${asset.file}`));
  if (sha256 !== asset.sha256) throw new Error('Native resource drift');
  nativeAssets.push({
    path: asset.file,
    sha256,
    classification: 'DERIVED_PRIVATE_IMAGE',
    licenseState: 'unresolved-private',
    publicReleaseApproved: false,
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
  scope:
    'Module-level declared provenance and byte identities; no Clean Room claim or public release approval',
  modules: [...modules.values()]
    .filter((module) => module.inputs.length)
    .map((module) => ({
      ...module,
      treeSha256: digest(Buffer.from(JSON.stringify(module.inputs))),
    })),
  packages: packageRules.sort((a, b) => a.name.localeCompare(b.name)),
  privateRequiredInputs: [
    'private/vendor/TypeMark',
    'private/runtime-assets',
    'private/native-titlebar (macOS)',
  ],
  releaseWhitelist: [],
  conditionalCandidatePackages: packageRules
    .filter((pkg) => !pkg.privateRuntimeRequired)
    .map((pkg) => pkg.name)
    .sort(),
  blockers: [
    'SDK package manifests remain private/UNLICENSED; publication requires separate authorization',
    'Original commercial runtime/themes/Typora icons/native images are not approved for public redistribution',
    `${inventory.counts.missingTopLevelLicenseText} third-party packages lack received top-level license text; output-specific license choices/NOTICE remain to review`,
    'TeXGyre 1.104 and received Ionicons conversion lineage remain unresolved',
  ],
  dependencyInventorySha256: digest(await read('config/dependency-inventory.json')),
  localNoticeBundle: inventory.noticeBundle,
};
await writeFile(resolve(root, 'config/source-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(
  resolve(root, 'config/runtime-audit.json'),
  `${JSON.stringify({ schema: 1, sourceVersion: runtime.sourceVersion, resources, nativeAssets, publicReleaseApproved: false, limitation: 'Received font notices are separate from commercial runtime and theme rights; dependencies embedded in private libraries are not cleared by npm/Cargo inventory' }, null, 2)}\n`,
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
