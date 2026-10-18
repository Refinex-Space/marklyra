import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fc from 'fast-check';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const value = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index < 0 ? fallback : process.argv[index + 1];
};
const beforeFile = value('--before', undefined);
if (!beforeFile) throw new Error('Supply --before with a preserved source-mirror bundle');
const output = resolve(root, value('--output', 'artifacts/source-mirror-performance/differential'));
await mkdir(output, { recursive: true });
const require = createRequire(import.meta.url);
createRequire(require.resolve('vite'))('esbuild').buildSync({
  entryPoints: [resolve(root, 'packages/editor-core/src/source-mirror.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  outfile: resolve(output, 'after.mjs'),
});
const beforePath = resolve(root, beforeFile),
  afterPath = resolve(output, 'after.mjs');
const { SourceMirror: Before } = await import(pathToFileURL(beforePath).href);
const { SourceMirror: After } = await import(pathToFileURL(afterPath).href);
const validPositions = (text) => {
  const result = [0];
  let index = 0;
  for (const point of text) {
    index += point.length;
    if (text[index - 1] !== '\r' || text[index] !== '\n') result.push(index);
  }
  return result;
};
const apply = (source, patches) => {
  let cursor = 0;
  const result = [];
  for (const patch of patches) {
    assert(patch.from >= cursor && patch.to >= patch.from && patch.to <= source.length);
    result.push(source.slice(cursor, patch.from), patch.insert);
    cursor = patch.to;
  }
  return result.join('') + source.slice(cursor);
};
let accepted = 0,
  rejected = 0,
  maps = 0;
function compare(left, right) {
  assert.equal(right.source, left.source);
  assert.equal(right.canonical, left.canonical);
  assert.equal(right.stateId, left.stateId);
  for (const method of ['sourceToCanonical', 'canonicalToSource']) {
    const text = method === 'sourceToCanonical' ? left.source : left.canonical;
    for (const at of validPositions(text))
      for (const affinity of ['left', 'right']) {
        assert.equal(right[method](at, affinity), left[method](at, affinity));
        maps++;
      }
  }
}
function step(left, right, next, hint) {
  const raw = left.source;
  const invoke = (mirror) => {
    try {
      return { result: mirror.update(next, hint) };
    } catch (error) {
      return { error: { code: error.code, name: error.name, message: error.message } };
    }
  };
  const a = invoke(left),
    b = invoke(right);
  assert.deepEqual(b.error, a.error);
  if (a.result && b.result) {
    assert.equal(apply(raw, a.result.patches), left.source);
    assert.equal(apply(raw, b.result.patches), right.source);
    // Adjacent Undo/Redo now returns the recorded exact patch; the previous diff
    // could choose another equivalent placement. Compare resulting raw bytes.
    if (hint?.kind !== 'history') assert.deepEqual(b.result, a.result);
    accepted++;
  } else rejected++;
  compare(left, right);
}
const row = fc.tuple(
  fc.constantFrom('alpha', 'same', '😀中文', '|x|y|', '009. item', '- child'),
  fc.constantFrom('', ' ', '\t', '  '),
  fc.constantFrom('\r\n', '\n', '\r'),
);
const operation = fc.record({
  mode: fc.integer({ min: 0, max: 6 }),
  at: fc.nat(1000),
  remove: fc.integer({ min: 0, max: 2 }),
  insert: fc.constantFrom('', 'X', '中', '😀', ' ', '\n', 'same', '`'),
});
const seed = Number(value('--seed', '3461893'));
const runs = Number(value('--runs', '300'));
fc.assert(
  fc.property(
    fc.array(row, { minLength: 1, maxLength: 9 }),
    fc.array(operation, { minLength: 5, maxLength: 24 }),
    (rows, operations) => {
      const source = `\uFEFF${rows.map(([text, gap, eol]) => text + gap + eol).join('')}`;
      const canonical = rows
        .map(([text]) => `${text.replace('|x|y|', '| x | y |').replace('009.', '1.')}\n`)
        .join('');
      const left = new Before(source, canonical),
        right = new After(source, canonical);
      const checkpoints = [{ id: left.stateId, canonical }];
      compare(left, right);
      for (const op of operations) {
        if (op.mode === 0) {
          const target = checkpoints[op.at % checkpoints.length];
          step(left, right, target.canonical, {
            kind: 'history',
            baseStateId: left.stateId,
            targetStateId: target.id,
          });
        } else if (op.mode === 1) step(left, right, left.canonical);
        else {
          const points = validPositions(left.canonical),
            index = op.at % points.length;
          const from = points[index],
            to = points[Math.min(points.length - 1, index + op.remove)];
          const next = left.canonical.slice(0, from) + op.insert + left.canonical.slice(to);
          const hint =
            op.mode === 2
              ? undefined
              : {
                  kind: 'edit',
                  baseStateId: left.stateId,
                  baseCanonical: left.canonical,
                  patches: [{ from, to, insert: op.insert }],
                  ...(op.mode === 3
                    ? { placementRanges: [{ from: 0, to: left.canonical.length }] }
                    : {}),
                };
          step(left, right, next, hint);
          if (!checkpoints.some((checkpoint) => checkpoint.id === left.stateId))
            checkpoints.push({ id: left.stateId, canonical: left.canonical });
        }
      }
    },
  ),
  { numRuns: runs, seed },
);
const digest = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
const result = {
  timestamp: new Date().toISOString(),
  seed,
  runs,
  accepted,
  rejected,
  mappingComparisons: maps,
  before: { path: beforePath, sha256: await digest(beforePath) },
  after: { path: afterPath, sha256: await digest(afterPath) },
  contract:
    'Same success/error, state IDs, raw/canonical values, bidirectional affinity mapping; patches apply exactly. History patch alignment may improve without changing raw output.',
};
await writeFile(resolve(output, 'report.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
