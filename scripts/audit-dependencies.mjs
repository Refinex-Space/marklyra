import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const options = { cwd: root, maxBuffer: 64 * 1024 * 1024, windowsHide: true };
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => arg !== '--notices'))
  throw new Error('Usage: node scripts/audit-dependencies.mjs [--notices]');
const collectedNotices = new Map();
async function licenseFiles(directory) {
  const records = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^(?:licen[cs]e|copying|notice)(?:$|[._-])/i.test(entry.name)) continue;
    const bytes = await readFile(resolve(directory, entry.name));
    collectedNotices.set(digest(bytes), bytes);
    records.push({ file: entry.name, sha256: digest(bytes), bytes: bytes.length });
  }
  return records.sort((a, b) => a.file.localeCompare(b.file));
}
// Only package-manager metadata is read; no source tree is uploaded or executed.
const lockBefore = {
  pnpm: digest(await readFile(resolve(root, 'pnpm-lock.yaml'))),
  cargo: digest(await readFile(resolve(root, 'Cargo.lock'))),
};
const [nodeResult, rustResult] = await Promise.all([
  execute(pnpm, ['licenses', 'list', '--json'], {
    ...options,
    shell: process.platform === 'win32',
  }),
  execute('cargo', ['metadata', '--locked', '--format-version', '1', '--all-features'], options),
]);
const nodeGroups = JSON.parse(nodeResult.stdout);
const rust = JSON.parse(rustResult.stdout);
const workspace = new Set(rust.workspace_members);
const packages = [];
for (const [declaredLicense, entries] of Object.entries(nodeGroups)) {
  for (const entry of entries) {
    const discovered = new Map();
    for (const location of entry.paths ?? []) {
      const directory = resolve(location);
      const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
      const key = `${manifest.name}@${manifest.version}`;
      if (discovered.has(key)) continue;
      discovered.set(key, {
        ecosystem: 'npm',
        name: manifest.name,
        version: manifest.version,
        declaredLicense: manifest.license ?? declaredLicense ?? null,
        licenseFiles: await licenseFiles(directory),
      });
    }
    if (!discovered.size) throw new Error(`No installed package evidence for ${entry.name}`);
    packages.push(...discovered.values());
  }
}
for (const entry of rust.packages) {
  if (workspace.has(entry.id)) continue;
  packages.push({
    ecosystem: 'cargo',
    name: entry.name,
    version: entry.version,
    declaredLicense: entry.license ?? null,
    declaredLicenseFile: entry.license_file ? basename(entry.license_file) : null,
    sourceKind: entry.source?.split('+')[0] ?? 'local',
    licenseFiles: await licenseFiles(dirname(entry.manifest_path)),
  });
}
const unique = [
  ...new Map(
    packages.map((entry) => [`${entry.ecosystem}/${entry.name}@${entry.version}`, entry]),
  ).values(),
].sort((a, b) =>
  `${a.ecosystem}/${a.name}@${a.version}`.localeCompare(`${b.ecosystem}/${b.name}@${b.version}`),
);
const lockAfter = {
  pnpm: digest(await readFile(resolve(root, 'pnpm-lock.yaml'))),
  cargo: digest(await readFile(resolve(root, 'Cargo.lock'))),
};
if (JSON.stringify(lockBefore) !== JSON.stringify(lockAfter))
  throw new Error('Dependency locks changed during inventory; rerun after dependency edits finish');
const missingDeclaration = unique.filter((entry) => !entry.declaredLicense);
const missingLicenseText = unique.filter((entry) => entry.licenseFiles.length === 0);
let noticeBundle = null;
if (args.includes('--notices')) {
  const base = resolve(root, 'artifacts/dependency-notices');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(resolve(base, 'audit-'));
  for (const [sha256, bytes] of collectedNotices)
    await writeFile(resolve(directory, `${sha256}.txt`), bytes, { flag: 'wx' });
  const manifest = {
    scope:
      'Received top-level license/notice texts only; missing texts, license choices and output-specific obligations remain unresolved.',
    locks: lockAfter,
    packages: unique.map(({ ecosystem, name, version, declaredLicense, licenseFiles }) => ({
      ecosystem,
      name,
      version,
      declaredLicense,
      files: licenseFiles.map((file) => ({ ...file, bundledText: `${file.sha256}.txt` })),
      status: licenseFiles.length
        ? 'received-texts-copied-not-approval'
        : 'missing-text-review-required',
    })),
  };
  await writeFile(resolve(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: 'wx',
  });
  noticeBundle = {
    directory: directory.slice(root.length + 1),
    uniqueTexts: collectedNotices.size,
    completeLicenseApproval: false,
  };
}
const report = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  locks: lockAfter,
  scope:
    'Installed pnpm dependencies and resolved Cargo third-party packages; excludes private runtime runtime and workspace-authored code.',
  evidence:
    'Manifest declarations plus top-level license/notice file digests. This is an inventory, not a legal approval or complete notice bundle.',
  counts: {
    npm: unique.filter((entry) => entry.ecosystem === 'npm').length,
    cargo: unique.filter((entry) => entry.ecosystem === 'cargo').length,
    missingDeclaration: missingDeclaration.length,
    missingTopLevelLicenseText: missingLicenseText.length,
  },
  noticeBundle,
  packages: unique,
};
await writeFile(
  resolve(root, 'config/dependency-inventory.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    ...report.counts,
    locks: report.locks,
    output: 'config/dependency-inventory.json',
  }),
);
if (missingDeclaration.length)
  console.log('Some dependencies need manual license declaration review; see inventory.');
