// Build against the workspace-locked product library, not a substitute save implementation.
// Never run concurrently with browser/native timing; no new dependency or Cargo manifest.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { arch, platform } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createPerformanceFixture } from '../../scripts/performance-fixtures.mjs';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const root = resolve(import.meta.dirname, '../..');
const arg = (key, fallback) =>
  process.argv.find((v) => v.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const label = arg('label', '');
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(label)) throw Error('Fresh safe --label required');
if (platform() !== 'darwin')
  throw Error('Current runner is macOS-only; Windows validation is separate');
const target = arch() === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
const output = resolve(root, 'artifacts/performance/io', label);
await mkdir(dirname(output), { recursive: true });
await mkdir(output);
const fixtures = resolve(output, 'fixtures');
await mkdir(fixtures);
for (const bytes of [10240, 102400, 1048576]) {
  for (const kind of ['plain', 'mixed']) {
    await writeFile(
      resolve(fixtures, `${kind}-${bytes}.md`),
      createPerformanceFixture(bytes, kind, { bom: false, eol: 'lf' }),
    );
  }
}
const options = { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
const hashes = async () =>
  Object.fromEntries(
    await Promise.all(
      [
        'Cargo.lock',
        'tests/performance/document_io.rs',
        'tools/performance/document-io.mjs',
        'scripts/performance-fixtures.mjs',
      ].map(async (file) => [file, sha256(await readFile(resolve(root, file)))]),
    ),
  );
const before = await hashes();
const build = execFileSync(
  'cargo',
  [
    'build',
    '-p',
    'document-service',
    '--release',
    '--target',
    target,
    '--locked',
    '--message-format=json',
  ],
  options,
);
await writeFile(resolve(output, 'cargo-artifacts.jsonl'), build);
const artifacts = build
  .trim()
  .split('\n')
  .filter((line) => line.startsWith('{'))
  .map((line) => JSON.parse(line));
const library = artifacts
  .findLast((a) => a.reason === 'compiler-artifact' && a.target?.name === 'document_service')
  ?.filenames.find((p) => p.endsWith('.rlib'));
if (!library) throw Error('No locked product document-service rlib');
const binary = resolve(output, 'document-io');
execFileSync(
  'rustc',
  [
    '--edition=2021',
    '--crate-name',
    'document_io',
    '--target',
    target,
    '-C',
    'opt-level=3',
    '-C',
    'lto=thin',
    '-C',
    'codegen-units=1',
    '--extern',
    `document_service=${library}`,
    '-L',
    `dependency=${dirname(library)}`,
    '-L',
    `dependency=${resolve(dirname(library), 'deps')}`,
    '-L',
    `dependency=${resolve(dirname(library), '../../release/deps')}`,
    resolve(root, 'tests/performance/document_io.rs'),
    '-o',
    binary,
  ],
  options,
);
const raw = execFileSync(binary, [fixtures], options);
await writeFile(resolve(output, 'raw.json'), raw);
const data = JSON.parse(raw);
if (data.cases.length !== 24 || data.cases.some((c) => !c.exact || !c.unchangedMtimeAndInode))
  throw Error('I/O correctness failed');
const after = await hashes();
if (JSON.stringify(before) !== JSON.stringify(after))
  throw Error('I/O sources changed during measurement');
await writeFile(
  resolve(output, 'report.json'),
  JSON.stringify(
    {
      target,
      binarySha256: sha256(await readFile(binary)),
      librarySha256: sha256(await readFile(library)),
      sourceFingerprints: before,
      sourceChangedDuringRun: false,
      method:
        'Build phase excluded. std::Instant measures actual product open/save only; byte verification and fixture creation outside timing. Warm filesystem, no stable percentile claim for n20 open.',
      ...data,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ output, cases: data.cases.length, exact: true, target }));
