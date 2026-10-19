import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) throw Error('Provide completed before and after directories');
const load = async (path) => ({
  report: JSON.parse(await readFile(resolve(path, 'report.json'), 'utf8')),
  analysis: JSON.parse(await readFile(resolve(path, 'analysis.json'), 'utf8')),
});
const [before, after] = await Promise.all([load(beforePath), load(afterPath)]);
if (
  !before.report.finishedAt ||
  !after.report.finishedAt ||
  before.report.sourceChangedDuringRun ||
  after.report.sourceChangedDuringRun
)
  throw Error('Incomplete/drifting comparison');
for (const [key, value] of Object.entries(before.report.sourceFingerprints))
  if (
    !['dist/editor-runtime/frame-host.js', 'dist/editor-runtime/runtime-manifest.json'].includes(
      key,
    )
  )
    assert.equal(
      after.report.sourceFingerprints[key],
      value,
      `Controller/unrelated input differs: ${key}`,
    );
for (const key of ['runtime/appsrc/main.js', 'sdk/index.js', 'core/source-mirror.js'])
  assert.equal(
    before.report.targetFingerprints[key],
    after.report.targetFingerprints[key],
    `Unrelated frozen target differs: ${key}`,
  );
const rows = [];
for (const old of before.analysis.rows.filter((r) => r.mode === 'runtime')) {
  const current = after.analysis.rows.find(
    (r) => r.mode === 'runtime' && r.id === old.id && r.engine === old.engine,
  );
  assert.ok(current, `Missing after case ${old.engine}/${old.id}`);
  assert.equal(old.sourceSha256, current.sourceSha256);
  assert.deepEqual(
    old.geometry,
    current.geometry,
    `Actual geometry/model differs: ${old.engine}/${old.id}`,
  );
  if (old.caseStatus !== 'complete' || current.caseStatus !== 'complete') {
    rows.push({
      engine: old.engine,
      id: old.id,
      status: 'excluded-incomplete-case',
      beforeStatus: old.caseStatus,
      afterStatus: current.caseStatus,
      metrics: null,
    });
    continue;
  }
  const metrics = {};
  for (const [name, a, b] of [
    ['loadApiP50', old.load.apiP50Ms, current.load.apiP50Ms],
    ['loadPlusFramesP50', old.load.apiPlusFramesP50Ms, current.load.apiPlusFramesP50Ms],
    ['clearP50', old.load.clearP50Ms, current.load.clearP50Ms],
    ['keyP50', old.keyboard.p50Ms, current.keyboard.p50Ms],
    ['keyEmpiricalP95', old.keyboard.empiricalP95Ms, current.keyboard.empiricalP95Ms],
    ['syncP50', old.sync.p50Ms, current.sync.p50Ms],
    ['serializeApiP50', old.serialization.p50Ms, current.serialization.p50Ms],
    ['unbrokenPasteP50', old.paste.unbroken.p50Ms, current.paste.unbroken.p50Ms],
    ['paragraphPasteP50', old.paste.paragraphs.p50Ms, current.paste.paragraphs.p50Ms],
  ])
    metrics[name] = { beforeMs: a, afterMs: b, changePercent: a > 0 ? (b / a - 1) * 100 : null };
  rows.push({
    engine: old.engine,
    id: old.id,
    status: 'paired-complete-case',
    rawExact: old.rawExact && current.rawExact,
    sourceAndSelectionHistoryExact: Object.values(current.paste).every(
      (p) => p.samples > 0 && p.allSourceExact && p.allLogicalSelectionHistoryExact,
    ),
    metrics,
  });
}
const result = {
  beforeLabel: before.report.label,
  afterLabel: after.report.label,
  targetBefore: before.report.targetFingerprints,
  targetAfter: after.report.targetFingerprints,
  controllerAndUnrelatedTargetsEqual: true,
  rows,
  limitation:
    'Sequential observed runs, not a randomized stable SLO or global speedup. Every fixture/metric and any regression is retained; uninstrumented timings are separate from CPU sample attribution.',
};
await writeFile(resolve(afterPath, 'before-after.json'), JSON.stringify(result, null, 2) + '\n', {
  flag: 'wx',
});
console.log(JSON.stringify(result, null, 2));
