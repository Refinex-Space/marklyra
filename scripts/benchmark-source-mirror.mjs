import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Session } from 'node:inspector';
import { createRequire } from 'node:module';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const value = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index < 0 ? fallback : process.argv[index + 1];
};
const label = value('--label', 'measurement');
const selected = value('--case', 'all');
const iterations = Number(value('--edits', '100'));
const operation = value('--operation', 'replace');
const payload = value('--payload', 'X');
const position = value('--position', 'middle');
const typingOnly = process.argv.includes('--typing-only');
if (!payload || !['middle', 'tail'].includes(position)) throw new Error('Invalid input parameters');
if (operation === 'delete' && position !== 'tail')
  throw new Error('Delete workload requires --position tail');
const memorySpan = Number(value('--memory-span', '1'));
if (!Number.isSafeInteger(memorySpan) || memorySpan < 1) throw new Error('Invalid --memory-span');
if (!['replace', 'insert', 'delete'].includes(operation)) throw new Error('Invalid --operation');
const output = resolve(
  root,
  value('--output', `artifacts/source-mirror-performance/${label}-${Date.now()}`),
);
if (!Number.isSafeInteger(iterations) || iterations < 1) throw new Error('Invalid --edits');
if (!global.gc) throw new Error('Run Node with --expose-gc for retained-heap sampling');
await mkdir(output, { recursive: true });
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve('vite'))('esbuild');
const files = [
  'packages/editor-core/src/source-mirror.ts',
  'packages/editor-core/src/source-mirror-ranges.ts',
  'packages/editor-core/src/transaction.ts',
  'packages/editor-core/src/types.ts',
  'scripts/benchmark-source-mirror.mjs',
];
const fingerprints = Object.fromEntries(
  await Promise.all(
    files.map(async (file) => [
      file,
      createHash('sha256')
        .update(await readFile(resolve(root, file)))
        .digest('hex'),
    ]),
  ),
);
// Isolated artifact bundle: never write package dist or private runtime resources.
const providedBundle = value('--bundle', undefined);
const bundle = providedBundle ? resolve(root, providedBundle) : resolve(output, 'mirror.mjs');
if (!providedBundle)
  esbuild.buildSync({
    entryPoints: [resolve(root, files[0])],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    outfile: bundle,
  });
const { SourceMirror } = await import(pathToFileURL(bundle).href);
const percentile = (samples, fraction) => {
  const values = [...samples].sort((a, b) => a - b);
  return values[Math.max(0, Math.ceil(values.length * fraction) - 1)] ?? 0;
};
const summary = (samples) => ({
  count: samples.length,
  p50Ms: percentile(samples, 0.5),
  p95Ms: samples.length >= 100 ? percentile(samples, 0.95) : null,
  minMs: Math.min(...samples),
  maxMs: Math.max(...samples),
});
const timed = (callback) => {
  const start = performance.now();
  callback();
  return performance.now() - start;
};
const heap = () => {
  global.gc();
  global.gc();
  return process.memoryUsage().heapUsed;
};
function fixture(kind, bytes) {
  const rows =
    kind === 'backing'
      ? [['alpha'.repeat(16), 'alpha'.repeat(16)]]
      : kind === 'mixed'
        ? [
            ['# Original alpha benchmark', '# Original alpha benchmark'],
            [
              'A plain alpha paragraph with 中文😀 and `code`.',
              'A plain alpha paragraph with 中文😀 and `code`.',
            ],
            ['- alpha task', '- alpha task'],
            ['```text', '```text'],
            ['  alpha literal  ', '  alpha literal  '],
            ['```', '```'],
            ['', ''],
          ]
        : kind === 'tables'
          ? [
              ['|alpha|beta|gamma|', '| alpha | beta | gamma |'],
              ['|---|---|---|', '| --- | --- | --- |'],
              ['|alpha value|two|three|', '| alpha value | two | three |'],
              ['009. alpha item', '1. alpha item'],
              ['\t- alpha child  ', '    - alpha child'],
              ['', ''],
            ]
          : [
              ['alpha same\twords  ', 'alpha same words'],
              ['', ''],
              ['alpha same words', 'alpha same words'],
              ['', ''],
            ];
  const raw = ['\uFEFF'],
    canonical = [];
  let size = Buffer.byteLength(raw[0]),
    line = 0;
  while (size < bytes)
    for (const [source, rendered] of rows) {
      const ending = ['\r\n', '\n', '\r'][line++ % 3];
      raw.push(source + ending);
      canonical.push(`${rendered}\n`);
      size += Buffer.byteLength(source + ending);
    }
  let source = raw.join(''),
    text = canonical.join('');
  let tailAnchor;
  if (position === 'tail') {
    const seeded = operation === 'delete' ? payload.repeat(iterations) : '';
    source += `\r\nTail alpha${seeded}`;
    text += `\nTail alpha${seeded}\n\n`;
    tailAnchor = text.length - 2 - seeded.length;
  }
  const anchors = [0.05, 0.5, 0.95].map((fraction) => {
    const offset = text.indexOf('alpha', Math.floor(text.length * fraction));
    assert(offset >= 0);
    return offset + 1;
  });
  return {
    source,
    canonical: text,
    anchors,
    tailAnchor,
    bytes: Buffer.byteLength(source),
    canonicalBytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(source).digest('hex'),
  };
}
function editRange(sample, index, memory = false) {
  const anchor = position === 'tail' ? sample.tailAnchor : sample.anchors[1];
  if (operation === 'delete') {
    const from = anchor + (iterations - index - 1) * payload.length;
    return { from, to: from + payload.length };
  }
  if (operation === 'insert') {
    const width = payload.length * (memory ? memorySpan : 1);
    const from = anchor + index * width;
    return { from, to: from };
  }
  const from = sample.anchors[index % sample.anchors.length];
  return { from, to: from + (memory ? memorySpan : 1) };
}

function positions(text, count = 1000) {
  const values = [];
  for (let index = 0; index < count; index++) {
    let offset = Math.floor(((index * 0.61803398875) % 1) * text.length);
    if (text[offset - 1] === '\r' && text[offset] === '\n') offset++;
    if (/^[\uDC00-\uDFFF]$/.test(text[offset] ?? '')) offset++;
    values.push(offset);
  }
  return values;
}
async function profileStart() {
  if (!process.argv.includes('--profile')) return undefined;
  const session = new Session();
  session.connect();
  const post = (method, params = {}) =>
    new Promise((resolve, reject) =>
      session.post(method, params, (error, response) =>
        error ? reject(error) : resolve(response),
      ),
    );
  await post('Profiler.enable');
  await post('Profiler.start');
  return async () => {
    const result = await post('Profiler.stop');
    session.disconnect();
    await writeFile(resolve(output, 'source-mirror.cpuprofile'), JSON.stringify(result.profile));
  };
}
if (process.argv.includes('--memory-worker')) {
  const [kind, targetText] = selected.split('-'),
    sample = fixture(kind, Number(targetText));
  const warm = () => {
    new SourceMirror(sample.source, sample.canonical);
  };
  warm();
  warm();
  const snapshot = () => {
    heap();
    const m = process.memoryUsage();
    return { heapUsed: m.heapUsed, external: m.external, arrayBuffers: m.arrayBuffers, rss: m.rss };
  };
  const before = snapshot();
  const mirror = new SourceMirror(sample.source, sample.canonical);
  const constructed = snapshot();
  const mutate = () => {
    for (let index = 0; index < iterations; index++) {
      const { from, to } = editRange(sample, index, true);
      const base = mirror.canonical,
        insert =
          operation === 'delete'
            ? ''
            : operation === 'insert'
              ? payload.repeat(memorySpan)
              : (base[from] === 'X' ? 'Y' : 'X').repeat(memorySpan);
      mirror.update(base.slice(0, from) + insert + base.slice(to), {
        kind: 'edit',
        baseStateId: mirror.stateId,
        baseCanonical: base,
        patches: [{ from, to, insert }],
      });
    }
  };
  mutate();
  const edited = snapshot();
  console.log(
    JSON.stringify({
      before,
      constructed,
      edited,
      constructionDelta: constructed.heapUsed - before.heapUsed,
      historyDelta: edited.heapUsed - constructed.heapUsed,
      operation,
      iterations,
      span: memorySpan,
      payload,
      position,
      sourceLength: mirror.source.length,
      bundleSha256: createHash('sha256')
        .update(await readFile(bundle))
        .digest('hex'),
    }),
  );
  process.exit(0);
}
const report = {
  label,
  timestamp: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  osRelease: os.release(),
  cpu: os.cpus()[0]?.model,
  logicalCpus: os.cpus().length,
  totalMemory: os.totalmem(),
  loadAverageBefore: os.loadavg(),
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  fingerprints,
  bundleSha256: createHash('sha256')
    .update(await readFile(bundle))
    .digest('hex'),
  method: {
    edits: iterations,
    operation,
    payload,
    position,
    typingOnly,
    cpuProfile: process.argv.includes('--profile'),
    constructionSamples: typingOnly ? 1 : 7,
    mappingBatches: typingOnly ? 1 : 5,
    mappingQueriesPerBatch: 2000,
    gc: 'Two explicit full GC requests before heap readings; process heap approximation, not exact object ownership',
    scope: 'Pure SourceMirror only; excludes parser, DOM and OS WebView costs',
  },
  cases: [],
};
const stopProfile = await profileStart();
for (const kind of ['mixed', 'tables', 'repeated'])
  for (const target of [10 * 1024, 100 * 1024, 1024 * 1024]) {
    const name = `${kind}-${target}`;
    if (selected !== 'all' && selected !== name) continue;
    const sample = fixture(kind, target),
      construction = [];
    for (let warm = 0; warm < 2; warm++) new SourceMirror(sample.source, sample.canonical);
    for (let count = 0; count < (typingOnly ? 1 : 7); count++)
      construction.push(timed(() => new SourceMirror(sample.source, sample.canonical)));
    const beforeMirror = heap();
    let mirror = new SourceMirror(sample.source, sample.canonical);
    assert.equal(mirror.source, sample.source);
    assert.equal(mirror.update(sample.canonical).source, sample.source);
    const constructedHeap = heap();
    const rawPositions = positions(sample.source),
      canonicalPositions = positions(sample.canonical),
      mapping = [];
    let checksum = 0;
    for (let batch = 0; batch < (typingOnly ? 1 : 5); batch++)
      mapping.push(
        timed(() => {
          for (let index = 0; index < canonicalPositions.length; index++) {
            checksum += mirror.canonicalToSource(
              canonicalPositions[index],
              index % 2 ? 'left' : 'right',
            );
            checksum += mirror.sourceToCanonical(rawPositions[index], index % 2 ? 'left' : 'right');
          }
        }),
      );
    for (const at of rawPositions) {
      const left = mirror.sourceToCanonical(at, 'left'),
        right = mirror.sourceToCanonical(at, 'right');
      assert(
        mirror.canonicalToSource(left, 'left') <= at &&
          mirror.canonicalToSource(right, 'right') >= at,
      );
    }
    const history = [],
      edit = [],
      undo = [],
      redo = [];
    let expectedRaw = sample.source;
    for (let index = 0; index < iterations; index++) {
      const { from, to } = editRange(sample, index);
      const old = mirror.canonical.slice(from, to),
        insert =
          operation === 'delete' ? '' : operation === 'insert' ? payload : old === 'X' ? 'Y' : 'X';
      const rawFrom = mirror.canonicalToSource(from),
        rawTo = operation === 'insert' ? rawFrom : mirror.canonicalToSource(to, 'left');
      const previousId = mirror.stateId,
        base = mirror.canonical;
      const next = base.slice(0, from) + insert + base.slice(to);
      edit.push(
        timed(() =>
          mirror.update(next, {
            kind: 'edit',
            baseStateId: previousId,
            baseCanonical: base,
            patches: [{ from, to, insert }],
          }),
        ),
      );
      expectedRaw = expectedRaw.slice(0, rawFrom) + insert + expectedRaw.slice(rawTo);
      assert.equal(mirror.source, expectedRaw);
      history.push({ from, old, insert, previousId, afterId: mirror.stateId, rawFrom, rawTo });
    }
    const editedHeap = heap();
    for (const entry of typingOnly ? [] : [...history].reverse()) {
      const base = mirror.canonical,
        next = base.slice(0, entry.from) + entry.old + base.slice(entry.from + entry.insert.length);
      undo.push(
        timed(() =>
          mirror.update(next, {
            kind: 'history',
            baseStateId: mirror.stateId,
            targetStateId: entry.previousId,
          }),
        ),
      );
    }
    if (!typingOnly) assert.equal(mirror.source, sample.source);
    for (const entry of typingOnly ? [] : history) {
      const base = mirror.canonical,
        next = base.slice(0, entry.from) + entry.insert + base.slice(entry.from + entry.old.length);
      redo.push(
        timed(() =>
          mirror.update(next, {
            kind: 'history',
            baseStateId: mirror.stateId,
            targetStateId: entry.afterId,
          }),
        ),
      );
    }
    assert.equal(mirror.source, expectedRaw);
    const isolatedMemory = typingOnly
      ? undefined
      : JSON.parse(
          execFileSync(
            process.execPath,
            [
              '--expose-gc',
              fileURLToPath(import.meta.url),
              '--memory-worker',
              '--case',
              name,
              '--operation',
              operation,
              '--payload',
              payload,
              '--position',
              position,
              '--edits',
              String(iterations),
              '--memory-span',
              String(memorySpan),
              '--bundle',
              bundle,
              '--output',
              resolve(output, 'memory'),
            ],
            { cwd: root, encoding: 'utf8' },
          ),
        );
    const result = {
      name,
      isolatedMemory,
      targetBytes: target,
      bytes: sample.bytes,
      canonicalBytes: sample.canonicalBytes,
      sourceCodeUnits: sample.source.length,
      canonicalCodeUnits: sample.canonical.length,
      fixtureSha256: sample.sha256,
      construction: summary(construction),
      mappingBatch: summary(mapping),
      edit: summary(edit),
      undo: summary(undo),
      redo: summary(redo),
      heap: {
        beforeMirror,
        constructedHeap,
        editedHeap,
        mirrorDelta: constructedHeap - beforeMirror,
        editHistoryDelta: editedHeap - constructedHeap,
      },
      checksum,
      historyValidated: !typingOnly,
      invariants: typingOnly
        ? 'No-edit exact; local raw patch exact; 1000 reverse correspondence intervals; final raw exact. History timings intentionally omitted.'
        : 'No-edit exact; local raw patch exact; 1000 reverse correspondence intervals; Undo to initial raw exact; Redo exact',
    };
    report.cases.push(result);
    console.log(
      JSON.stringify({
        name,
        construction: result.construction.p50Ms,
        mapping2000: result.mappingBatch.p50Ms,
        edit: result.edit.p50Ms,
        undo: result.undo.p50Ms,
        retainedHistoryMiB: result.isolatedMemory
          ? result.isolatedMemory.historyDelta / 1024 ** 2
          : null,
      }),
    );
    await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
    mirror = null;
  }
await stopProfile?.();
report.loadAverageAfter = os.loadavg();
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(`Saved ${resolve(output, 'report.json')}`);
