import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, verify as verifyCrypto } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repository = 'Refinex-Space/marklyra';
const root = fileURLToPath(new URL('../', import.meta.url));
const json = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const writeJson = (path, value) =>
  writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`);
export function stableVersion(version) {
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ||
    version.split('.').some((n) => Number(n) > 65535)
  )
    throw Error('Expected stable version X.Y.Z (each component 0–65535)');
  return version;
}
export function publicKey(value) {
  if (typeof value !== 'string' || !value.trim())
    throw Error('MARKLYRA_UPDATER_PUBLIC_KEY is required');
  const lines = Buffer.from(value.trim(), 'base64').toString('utf8').trim().split(/\r?\n/);
  const key = Buffer.from(lines[1] ?? '', 'base64');
  if (
    !lines[0]?.startsWith('untrusted comment: ') ||
    key.length !== 42 ||
    key.subarray(0, 2).toString() !== 'Ed'
  )
    throw Error('Expected a Tauri/minisign public key, never a private key');
  return key;
}
export function verifySignature(bytes, signature, encodedKey) {
  const key = publicKey(encodedKey);
  const lines = Buffer.from(signature.trim(), 'base64').toString('utf8').trim().split(/\r?\n/);
  const packet = Buffer.from(lines[1] ?? '', 'base64');
  const global = Buffer.from(lines[3] ?? '', 'base64');
  if (
    packet.length !== 74 ||
    global.length !== 64 ||
    !lines[0]?.startsWith('untrusted comment: ') ||
    !lines[2]?.startsWith('trusted comment: ') ||
    !packet.subarray(2, 10).equals(key.subarray(2, 10))
  )
    throw Error('Invalid updater signature/key ID');
  const algorithm = packet.subarray(0, 2).toString();
  if (!['Ed', 'ED'].includes(algorithm)) throw Error('Invalid signature algorithm');
  const message = algorithm === 'ED' ? createHash('blake2b512').update(bytes).digest() : bytes;
  const publicObject = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key.subarray(10)]),
    format: 'der',
    type: 'spki',
  });
  if (
    !verifyCrypto(null, message, publicObject, packet.subarray(10)) ||
    !verifyCrypto(
      null,
      Buffer.concat([packet.subarray(10), Buffer.from(lines[2].slice(17))]),
      publicObject,
      global,
    )
  )
    throw Error('Updater signature verification failed');
}
export function assets(version) {
  stableVersion(version);
  return {
    'darwin-aarch64': {
      target: 'aarch64-apple-darwin',
      file: `MarkLyra_${version}_aarch64.app.tar.gz`,
      installer: `MarkLyra_${version}_aarch64.dmg`,
    },
    'darwin-x86_64': {
      target: 'x86_64-apple-darwin',
      file: `MarkLyra_${version}_x64.app.tar.gz`,
      installer: `MarkLyra_${version}_x64.dmg`,
    },
    'windows-x86_64': {
      target: 'x86_64-pc-windows-msvc',
      file: `MarkLyra_${version}_x64-setup.exe`,
    },
  };
}
export function checkVersions(tag) {
  const version = stableVersion(json('package.json').version);
  const cargo = readFileSync(resolve(root, 'Cargo.toml'), 'utf8').match(
    /\[workspace.package\][\s\S]*?^version = "([^"]+)"/m,
  )?.[1];
  for (const other of [
    json('apps/desktop/package.json').version,
    json('apps/desktop/src-tauri/tauri.conf.json').version,
    cargo,
  ])
    if (other !== version) throw Error('Desktop versions differ; run pnpm release:version X.Y.Z');
  if (tag && tag !== `v${version}`) throw Error('Tag must equal the source version');
  return version;
}
function prepare() {
  checkVersions(process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined);
  const key = process.env.MARKLYRA_UPDATER_PUBLIC_KEY?.trim();
  publicKey(key);
  mkdirSync(resolve(root, '.release'), { recursive: true });
  writeJson('.release/tauri.release.json', {
    bundle: { createUpdaterArtifacts: true, macOS: { signingIdentity: '-' } },
    plugins: { updater: { pubkey: key } },
  });
  console.log(
    'Prepared signed updater configuration (macOS ad-hoc; no platform certificate required).',
  );
}
function bump(version) {
  stableVersion(version);
  const old = checkVersions();
  const compare = version
    .split('.')
    .map(Number)
    .findIndex((n, i) => n !== Number(old.split('.')[i]));
  if (compare < 0 || Number(version.split('.')[compare]) < Number(old.split('.')[compare]))
    throw Error('Release version must increase');
  const metadata = JSON.parse(
    execFileSync('cargo', ['metadata', '--no-deps', '--format-version', '1'], {
      cwd: root,
      encoding: 'utf8',
    }),
  );
  const names = new Set(
    metadata.packages.filter((p) => metadata.workspace_members.includes(p.id)).map((p) => p.name),
  );
  for (const path of [
    'package.json',
    'apps/desktop/package.json',
    'apps/desktop/src-tauri/tauri.conf.json',
  ]) {
    const value = json(path);
    value.version = version;
    writeJson(path, value);
  }
  const path = resolve(root, 'Cargo.toml');
  writeFileSync(
    path,
    readFileSync(path, 'utf8').replace(
      /(\[workspace.package\][\s\S]*?^version = ")[^"]+/m,
      `$1${version}`,
    ),
  );
  const lock = resolve(root, 'Cargo.lock');
  writeFileSync(
    lock,
    readFileSync(lock, 'utf8').replace(
      /(\[\[package\]\]\nname = "([^"]+)"\nversion = ")[^"]+/g,
      (match, prefix, name) => (names.has(name) ? `${prefix}${version}` : match),
    ),
  );
  console.log(`Desktop ${old} -> ${version}; inspect the diff, then commit when ready.`);
}
function collect(target, destination) {
  const version = checkVersions();
  const entry = Object.values(assets(version)).find((value) => value.target === target);
  if (!entry || !destination) throw Error('collect TARGET DIRECTORY');
  const bundle = resolve(root, 'target', target, 'release/bundle');
  mkdirSync(destination, { recursive: true });
  const copyOne = (directory, suffix, name) => {
    const folder = resolve(bundle, directory);
    const files = readdirSync(folder).filter((file) => file.endsWith(suffix));
    if (files.length !== 1) throw Error(`Expected one ${suffix} in ${folder}`);
    copyFileSync(resolve(folder, files[0]), resolve(destination, name));
  };
  const directory = target.includes('darwin') ? 'macos' : 'nsis';
  const suffix = target.includes('darwin') ? '.app.tar.gz' : '.exe';
  copyOne(directory, suffix, entry.file);
  copyOne(directory, `${suffix}.sig`, `${entry.file}.sig`);
  if (entry.installer) copyOne('dmg', '.dmg', entry.installer);
}
export function expectedFiles(version) {
  return [
    ...Object.values(assets(version)).flatMap((entry) => [
      entry.file,
      `${entry.file}.sig`,
      ...(entry.installer ? [entry.installer] : []),
    ]),
    'latest.json',
    'source.json',
    'SHA256SUMS',
  ].sort();
}
function checksum(directory, names) {
  return names
    .map(
      (name) =>
        `${createHash('sha256')
          .update(readFileSync(resolve(directory, name)))
          .digest('hex')}  ${name}\n`,
    )
    .join('');
}
export function verifyDirectory(directory, version, key, commit) {
  const names = expectedFiles(version);
  if (JSON.stringify(readdirSync(directory).sort()) !== JSON.stringify(names))
    throw Error('Release assets are missing or unexpected');
  for (const name of names)
    if (!statSync(resolve(directory, name)).isFile() || !statSync(resolve(directory, name)).size)
      throw Error(`Empty or invalid asset: ${name}`);
  const read = (name) => readFileSync(resolve(directory, name), 'utf8');
  const latest = JSON.parse(read('latest.json'));
  const source = JSON.parse(read('source.json'));
  if (
    latest.version !== version ||
    !Number.isFinite(Date.parse(latest.pub_date)) ||
    source.version !== version ||
    source.commit !== commit ||
    !/^[a-f0-9]{40}$/.test(commit)
  )
    throw Error('Release version/source/date mismatch');
  if (
    JSON.stringify(Object.keys(latest.platforms).sort()) !==
    JSON.stringify(Object.keys(assets(version)).sort())
  )
    throw Error('Updater platform set mismatch');
  for (const [platform, entry] of Object.entries(assets(version))) {
    const signature = read(`${entry.file}.sig`).trim();
    if (
      latest.platforms[platform].signature !== signature ||
      latest.platforms[platform].url !==
        `https://github.com/${repository}/releases/download/v${version}/${entry.file}`
    )
      throw Error('Updater URL/signature mismatch');
    verifySignature(readFileSync(resolve(directory, entry.file)), signature, key);
  }
  if (
    read('SHA256SUMS') !==
    checksum(
      directory,
      names.filter((name) => name !== 'SHA256SUMS'),
    )
  )
    throw Error('Release checksums mismatch');
}
function assemble(directory) {
  const version = checkVersions(process.env.GITHUB_REF_NAME);
  const commit = process.env.GITHUB_SHA;
  const platforms = Object.fromEntries(
    Object.entries(assets(version)).map(([platform, entry]) => [
      platform,
      {
        url: `https://github.com/${repository}/releases/download/v${version}/${entry.file}`,
        signature: readFileSync(resolve(directory, `${entry.file}.sig`), 'utf8').trim(),
      },
    ]),
  );
  writeFileSync(
    resolve(directory, 'latest.json'),
    `${JSON.stringify({ version, pub_date: new Date().toISOString(), platforms }, null, 2)}\n`,
  );
  writeFileSync(
    resolve(directory, 'source.json'),
    `${JSON.stringify({ version, commit }, null, 2)}\n`,
  );
  writeFileSync(
    resolve(directory, 'SHA256SUMS'),
    checksum(
      directory,
      expectedFiles(version).filter((name) => name !== 'SHA256SUMS'),
    ),
  );
  verifyDirectory(directory, version, process.env.MARKLYRA_UPDATER_PUBLIC_KEY, commit);
  console.log(`Verified ${expectedFiles(version).length} assets and all three updater signatures.`);
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'version') bump(args[0]);
  else if (command === 'check') console.log(checkVersions(args[0]));
  else if (command === 'prepare') prepare();
  else if (command === 'collect') collect(...args);
  else if (command === 'assemble') assemble(args[0]);
  else
    throw Error(
      'Usage: release.mjs version X.Y.Z | check [TAG] | prepare | collect TARGET DIRECTORY | assemble DIRECTORY',
    );
}
