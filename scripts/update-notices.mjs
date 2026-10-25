import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { sharedNoticeParts } from './lib/project-notices.mjs';

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const marker = '=== PACKAGE DEPENDENCY NOTICES (GENERATED) ===';
const options = { cwd: root, maxBuffer: 64 * 1024 * 1024, windowsHide: true };
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => arg !== '--check'))
  throw new Error('Usage: node scripts/update-notices.mjs [--check]');
const target = resolve(root, 'THIRD-PARTY-NOTICES.txt');
const info = await lstat(target);
if (!info.isFile() || info.isSymbolicLink()) throw new Error('Expected a regular notice file');
const previous = await readFile(target, 'utf8');
if (previous.split(marker).length !== 2) throw new Error('Expected one dependency notice boundary');
const fixed = previous.slice(0, previous.indexOf(marker) + marker.length);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const locks = async () =>
  Promise.all(
    ['pnpm-lock.yaml', 'Cargo.lock'].map(async (name) => hash(await readFile(resolve(root, name)))),
  );
const before = await locks();
const [nodeResult, cargoResult, ...trees] = await Promise.all([
  execute(pnpm, ['licenses', 'list', '--prod', '--json'], {
    ...options,
    shell: process.platform === 'win32',
  }),
  execute('cargo', ['metadata', '--locked', '--offline', '--format-version', '1'], options),
  ...['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-pc-windows-msvc'].map((platform) =>
    execute(
      'cargo',
      [
        'tree',
        '--locked',
        '--offline',
        '-p',
        'marklyra-desktop',
        '--target',
        platform,
        '-e',
        'normal,no-proc-macro',
        '--prefix',
        'none',
        '--format',
        '{p}',
      ],
      options,
    ),
  ),
]);
const selected = new Set();
for (const tree of trees)
  for (const line of tree.stdout.split('\n')) {
    const match = /^([\w-]+) v([^\s]+)/.exec(line);
    if (match) selected.add(`${match[1]}@${match[2]}`);
  }
const cargo = JSON.parse(cargoResult.stdout);
const workspace = new Set(cargo.workspace_members);
const packages = new Map();
for (const entries of Object.values(JSON.parse(nodeResult.stdout)))
  for (const entry of entries)
    for (const directory of entry.paths ?? []) {
      const metadata = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
      packages.set(`npm/${metadata.name}@${metadata.version}`, {
        directory,
        license: metadata.license,
      });
    }
for (const entry of cargo.packages) {
  const name = `${entry.name}@${entry.version}`;
  if (workspace.has(entry.id) || !selected.has(name)) continue;
  packages.set(`cargo/${name}`, {
    directory: dirname(entry.manifest_path),
    license: entry.license,
    licenseFile: entry.license_file,
  });
}
const texts = new Map();
const missing = [];
const normalize = (value) => value.replace(/\s+/g, ' ').trim();
const projectLicense = await readFile(resolve(root, 'LICENSE'), 'utf8');
const decoder = new TextDecoder('utf-8', { fatal: true });
for (const [name, entry] of [...packages].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  const packageRoot = await realpath(entry.directory);
  const names = (await readdir(entry.directory, { withFileTypes: true }))
    .filter((item) => item.isFile() && /^(?:licen[cs]e|copying|notice)(?:$|[._-])/i.test(item.name))
    .map((item) => item.name);
  if (entry.licenseFile) names.push(entry.licenseFile);
  let found = false;
  for (const file of [...new Set(names)].sort()) {
    const path = resolve(entry.directory, file);
    if (!path.startsWith(`${resolve(entry.directory)}${sep}`))
      throw new Error(`Notice escapes its package: ${name}`);
    const metadata = await lstat(path);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size > 4 * 1024 * 1024 ||
      !(await realpath(path)).startsWith(`${packageRoot}${sep}`)
    )
      throw new Error(`Unexpected package notice: ${name}`);
    const text = decoder.decode(await readFile(path));
    if (text.includes(marker)) throw new Error(`Unexpected notice boundary inside ${name}`);
    if (!text.trim()) continue;
    found = true;
    const { attribution, terms } = sharedNoticeParts(text, projectLicense);
    const key = hash(normalize(terms));
    if (!texts.has(key)) texts.set(key, { terms, attributions: new Map() });
    const entries = texts.get(key).attributions;
    const attributionKey = hash(normalize(attribution));
    if (!entries.has(attributionKey))
      entries.set(attributionKey, { text: attribution, packages: new Set() });
    entries.get(attributionKey).packages.add(name);
  }
  if (!found) missing.push(`${name} — ${entry.license || 'license declaration unavailable'}`);
}
if (JSON.stringify(before) !== JSON.stringify(await locks()))
  throw new Error('Dependency locks changed while collecting notices');
const sections = [...texts.values()].map((entry) => {
  const credits = [...entry.attributions.values()].map(
    (item) =>
      `Applies to: ${[...item.packages].sort().join(', ')}${item.text ? `\n${item.text}` : ''}`,
  );
  return `${credits.join('\n\n')}\n\nShared terms for the notices above:\n\n${entry.terms}`;
});
const output =
  `${fixed}\n\nGenerated from production npm dependencies and the normal Cargo dependency\ngraphs of the supported macOS/Windows targets. Development/test tools and\nother target-only branches are not included. Do not edit this generated section.\n\n${sections.join(`\n\n${'='.repeat(72)}\n\n`)}\n\n` +
  (missing.length
    ? `Package metadata without a separately received top-level notice:\n${missing.join('\n')}\n`
    : '');
if (args.includes('--check')) {
  if (output !== previous)
    throw new Error('Dependency notices changed; run pnpm update:notices and review.');
} else await writeFile(target, output);
console.log(
  `Consolidated ${packages.size} runtime packages into ${texts.size} distinct received texts; ${missing.length} have metadata without a separate text.`,
);
