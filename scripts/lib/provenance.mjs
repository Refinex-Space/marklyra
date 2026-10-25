import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const forbidden =
  /(?:^|\/)(?:private|artifacts|target|node_modules|\.git|runtime-assets|recovered|[^/]+\.app)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:hdb|dmg|exe|msi|dylib|asar|tgz)$/i;
const hashPattern = /^[a-f0-9]{64}$/;
const modePattern = /^(100644|100755)$/;

export function inspectPath(path) {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes(':') ||
    Array.from(path).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    path.split('/').some((part) => !part || part === '.' || part === '..') ||
    forbidden.test(path)
  )
    throw new Error(`Forbidden provenance path: ${JSON.stringify(path)}`);
}
function inspectMap(map, label, depth = 0) {
  if (!map || typeof map !== 'object' || depth > 8) throw new Error(`Invalid source map: ${label}`);
  for (const source of map.sources ?? []) {
    if (
      typeof source !== 'string' ||
      source.startsWith('/') ||
      source.startsWith('file:') ||
      /^[a-z]:[/\\]/i.test(source) ||
      forbidden.test(source.replaceAll('\\', '/'))
    )
      throw new Error(`Forbidden source map origin: ${label}`);
  }
  for (const section of map.sections ?? []) {
    if (!section.map || section.url)
      throw new Error(`External indexed source map needs review: ${label}`);
    inspectMap(section.map, label, depth + 1);
  }
}
function parseMap(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid source map JSON: ${label}`);
  }
}
export function inspectBytes(path, bytes) {
  if (path.endsWith('.map')) inspectMap(parseMap(bytes.toString('utf8'), path), path);
  if (/\.(?:[cm]?js|css)$/.test(path)) {
    for (const match of bytes
      .toString('utf8')
      .matchAll(
        /sourceMappingURL=data:application\/json(?:;charset=[\w-]+)?(;base64)?,([^\s*]+)/g,
      )) {
      const source = match[1]
        ? Buffer.from(match[2], 'base64').toString('utf8')
        : decodeURIComponent(match[2]);
      inspectMap(parseMap(source, path), path);
    }
  }
}
function git(root, args, options = {}) {
  return execFileSync('git', args, { cwd: root, maxBuffer: 128 * 1024 * 1024, ...options });
}
const inputPrefixes = [
  'packages/editor-runtime/src/engine/',
  'packages/editor-runtime/src/page/',
  'packages/editor-runtime/assets/',
  'packages/editor-runtime/vendor/',
  'packages/editor-themes/assets/',
  'apps/desktop/src/features/settings/runtime-preferences/page/',
  'apps/desktop/src-tauri/icons/titlebar/',
];
export const isRuntimeSourcePath = (path) =>
  path === 'packages/editor-themes/base.css' ||
  inputPrefixes.some((prefix) => path.startsWith(prefix));

export async function loadPolicy(root, index = false) {
  const read = (path) => (index ? git(root, ['show', `:${path}`]) : readFile(resolve(root, path)));
  const manifest = JSON.parse(await read('config/runtime-source.json'));
  if (manifest.schema !== 2 || !Array.isArray(manifest.resources) || !manifest.resources.length)
    throw new Error('Invalid runtime source manifest');
  const hashes = new Set();
  const resources = new Map();
  const outputs = new Set();
  for (const record of manifest.resources) {
    inspectPath(record.path);
    if (
      !isRuntimeSourcePath(record.path) ||
      !hashPattern.test(record.sha256) ||
      !Number.isSafeInteger(record.size) ||
      record.size < 0 ||
      resources.has(record.path)
    )
      throw new Error('Invalid runtime source record');
    if (
      record.additionalRuntimePaths !== undefined &&
      !Array.isArray(record.additionalRuntimePaths)
    )
      throw new Error('Invalid runtime output mapping');
    for (const output of [record.runtimePath, ...(record.additionalRuntimePaths ?? [])]) {
      if (output === undefined) continue;
      if (typeof output !== 'string' || outputs.has(output))
        throw new Error('Invalid runtime output mapping');
      inspectPath(output);
      outputs.add(output);
    }
    hashes.add(record.sha256);
    resources.set(record.path, record);
  }
  return { hashes, resources };
}
function entries(bytes) {
  return bytes
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t'),
        header = line.slice(0, tab).split(' '),
        path = line.slice(tab + 1);
      if (
        tab < 0 ||
        !modePattern.test(header[0]) ||
        !/^[a-f0-9]{40,64}$/.test(header[1] === 'blob' ? header[2] : header[1]) ||
        (header[1] !== 'blob' && header[2] !== '0')
      )
        throw new Error(`Unreviewed Git entry mode/stage: ${JSON.stringify(path)}`);
      return { mode: header[0], oid: header[1] === 'blob' ? header[2] : header[1], path };
    });
}
function blobs(root, ids) {
  if (!ids.length) return new Map();
  const bytes = git(root, ['cat-file', '--batch'], { input: `${ids.join('\n')}\n` });
  const result = new Map();
  let offset = 0;
  for (const oid of ids) {
    const end = bytes.indexOf(10, offset);
    const [observed, kind, length] = bytes.subarray(offset, end).toString('utf8').split(' ');
    const size = Number(length);
    if (
      end < 0 ||
      observed !== oid ||
      kind !== 'blob' ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      end + size + 2 > bytes.length
    )
      throw new Error('Invalid Git blob response');
    result.set(oid, bytes.subarray(end + 1, end + 1 + size));
    offset = end + size + 2;
  }
  if (offset !== bytes.length) throw new Error('Unexpected Git blob response tail');
  return result;
}
export async function checkRepository(root, mode = 'staged') {
  root = git(root, ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const { hashes, resources } = await loadPolicy(root, mode !== 'worktree');
  if (mode === 'worktree') return checkWorktree(root, resources, hashes);
  let rows,
    commits = [];
  if (mode === 'history') {
    commits = git(root, ['rev-list', '--all'], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    rows = commits.flatMap((commit) =>
      entries(git(root, ['ls-tree', '-rz', '--full-tree', commit])),
    );
  } else {
    rows = entries(git(root, ['ls-files', '--stage', '-z']));
    if (mode === 'staged') {
      const changed = new Set(
        git(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
          .toString('utf8')
          .split('\0'),
      );
      rows = rows.filter((row) => changed.has(row.path));
    } else if (mode !== 'tracked') throw new Error('Unknown provenance mode');
  }
  rows = [...new Map(rows.map((row) => [`${row.oid}:${row.path}`, row])).values()];
  for (const row of rows) inspectPath(row.path);
  const objects = blobs(root, [...new Set(rows.map((row) => row.oid))]);
  for (const row of rows) {
    const bytes = objects.get(row.oid);
    if (mode !== 'history' && isRuntimeSourcePath(row.path)) {
      const record = resources.get(row.path);
      if (!record || record.size !== bytes.length || record.sha256 !== digest(bytes))
        throw new Error(`Runtime source identity mismatch: ${row.path}`);
    }
    inspectBytes(row.path, bytes);
  }
  if (mode === 'tracked') {
    const tracked = new Set(rows.map((row) => row.path));
    for (const path of resources.keys())
      if (!tracked.has(path)) throw new Error(`Runtime source not tracked: ${path}`);
  }
  return {
    mode,
    commits: commits.length,
    pathsAndVersions: rows.length,
    blobs: objects.size,
    runtimeSourceDigests: hashes.size,
  };
}

async function checkWorktree(root, resources, hashes) {
  const paths = [
    ...new Set(
      git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
        .toString('utf8')
        .split('\0')
        .filter(Boolean),
    ),
  ];
  const observed = new Set();
  const directories = new Set();
  for (const path of paths) {
    inspectPath(path);
    let bytes;
    try {
      const parts = path.split('/');
      for (let length = 1; length < parts.length; length++) {
        const directory = resolve(root, ...parts.slice(0, length));
        if (directories.has(directory)) continue;
        const info = await lstat(directory);
        if (!info.isDirectory() || info.isSymbolicLink())
          throw new Error(`Unreviewed worktree directory: ${path}`);
        directories.add(directory);
      }
      const info = await lstat(resolve(root, path));
      if (!info.isFile() || info.isSymbolicLink())
        throw new Error(`Unreviewed worktree entry: ${path}`);
      bytes = await readFile(resolve(root, path));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (isRuntimeSourcePath(path)) {
      const record = resources.get(path);
      if (!record || record.size !== bytes.length || record.sha256 !== digest(bytes))
        throw new Error(`Runtime source identity mismatch: ${path}`);
    }
    inspectBytes(path, bytes);
    observed.add(path);
  }
  for (const path of resources.keys())
    if (!observed.has(path)) throw new Error(`Runtime source missing from worktree: ${path}`);
  return {
    mode: 'worktree',
    commits: 0,
    pathsAndVersions: observed.size,
    blobs: observed.size,
    runtimeSourceDigests: hashes.size,
  };
}

/** Bind copied runtime files to the current native input manifest, not an older build. */
export async function verifyRuntimeInputMapping(root, runtime) {
  const { resources } = await loadPolicy(root);
  const product = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const version = `MarkLyra ${product.version}`;
  if (typeof product.version !== 'string' || runtime.sourceVersion !== version)
    throw new Error('Runtime source-to-output mapping: product version differs');
  const expected = new Map();
  for (const input of resources.values())
    for (const path of [input.runtimePath, ...(input.additionalRuntimePaths ?? [])])
      if (path) expected.set(path, input);
  const observed = new Set();
  for (const [prefix, manifest] of [
    ['', runtime],
    ['preferences/', runtime.preferences],
  ]) {
    if (!manifest) continue;
    if (manifest.sourceVersion !== version || !Array.isArray(manifest.resources))
      throw new Error('Runtime source-to-output mapping: invalid runtime manifest');
    for (const record of manifest.resources) {
      const path = prefix + record.path;
      inspectPath(path);
      if (observed.has(path))
        throw new Error(`Runtime source-to-output mapping: duplicate output ${path}`);
      const input = expected.get(path);
      if (
        input
          ? record.sourcePath !== input.path || record.originalSha256 !== input.sha256
          : record.sourcePath !== undefined
      )
        throw new Error(`Runtime source-to-output mapping: stale or unknown input for ${path}`);
      observed.add(path);
    }
  }
  for (const path of expected.keys())
    if (!observed.has(path))
      throw new Error(`Runtime source-to-output mapping: missing output ${path}`);
  return { nativeOutputs: expected.size, sourceVersion: version };
}
