import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { EditorSession } from '../packages/editor-core/dist/index.js';
import { parseMarkdown, serializeMarkdown } from '../packages/editor-markdown/dist/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'artifacts/performance');
const sizes = [10 * 1024, 100 * 1024, 1024 * 1024];
const browserRequested = process.argv.includes('--browser');

async function fingerprints() {
  const files = [
    'packages/editor-core/dist/session.js',
    'packages/editor-core/dist/transaction.js',
    'packages/editor-markdown/dist/index.js',
    'packages/editor-view/src/index.ts',
    'packages/editor-view/src/projection.ts',
    'scripts/benchmark-editor.mjs',
  ];
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        createHash('sha256')
          .update(await readFile(resolve(root, file)))
          .digest('hex'),
      ]),
    ),
  );
}

async function withTimeout(promise, milliseconds, label) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} exceeded ${milliseconds} ms`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function sample(bytes) {
  const header = '\uFEFF---\r\ntitle: Original benchmark fixture\n---\r\n\n';
  const section = [
    '## Benchmark section\r\n',
    '\nText with **strong**, *emphasis*, ~~strike~~, `inline code` and 中文😀.\r\n',
    '[Local reference](./reference.md) and ![image](./fixture.png).\n\n',
    '- parent\n  - child\r\n    - grandchild\n- [ ] task\n\n',
    '> A quotation\n> > Nested quotation\n\n',
    '| column | value |\n| --- | --- |\n| sample | 123 |\n\n',
    '```typescript\nconst sample = { exact: "  spaces  " };\n```\r\n\n',
    '$$x^2 + y^2 = z^2$$\n\n',
  ].join('');
  const repeat = Math.floor((bytes - Buffer.byteLength(header)) / Buffer.byteLength(section));
  const body = header + section.repeat(repeat);
  return body + 'x'.repeat(bytes - Buffer.byteLength(body));
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
  return {
    count: sorted.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    minMs: sorted[0] ?? 0,
    maxMs: sorted.at(-1) ?? 0,
  };
}

function timed(run) {
  const start = performance.now();
  run();
  return performance.now() - start;
}

function measure(run, count = 30) {
  for (let i = 0; i < 5; i++) run();
  return summarize(Array.from({ length: count }, () => timed(run)));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function coreBenchmark(source) {
  console.error(`core ${Buffer.byteLength(source)} bytes`);
  assert(serializeMarkdown(parseMarkdown(source)) === source, 'Parse/serialize changed source');
  const parser = measure(() => parseMarkdown(source));
  const loading = measure(() => new EditorSession(source));
  globalThis.gc?.();
  const beforeHeap = process.memoryUsage().heapUsed;
  const editor = new EditorSession(source);
  const document = parseMarkdown(source);
  const insertTimings = [];
  const undoTimings = [];
  const selectionTimings = [];
  for (let i = 0; i < 100; i++) {
    const position = editor.state.source.length;
    selectionTimings.push(timed(() => editor.setSelection({ anchor: position, head: position })));
    insertTimings.push(
      timed(() =>
        editor.apply({
          baseRevision: editor.state.revision,
          patches: [{ from: position, to: position, insert: 'x' }],
          group: 'benchmark-independent-transaction',
        }),
      ),
    );
  }
  assert(editor.state.source === `${source}${'x'.repeat(100)}`, 'Insertion damaged source');
  const historyStats = editor.historyStats;
  globalThis.gc?.();
  const retainedHeap = process.memoryUsage().heapUsed;
  for (let i = 0; i < 100; i++) {
    undoTimings.push(timed(() => assert(editor.undo(), 'Missing undo transaction')));
  }
  assert(editor.state.source === source, 'Undo did not restore exact source');
  assert(!editor.undo(), 'Unexpected extra undo history');
  return {
    bytes: Buffer.byteLength(source),
    utf16Units: source.length,
    blocks: document.blocks.length,
    parser,
    loadCore: loading,
    insert100: summarize(insertTimings),
    undo100: summarize(undoTimings),
    selection100: summarize(selectionTimings),
    retainedHeapDeltaBytes: retainedHeap - beforeHeap,
    historyStats,
    heapCollection: globalThis.gc ? 'explicit GC before/after retained history' : 'no explicit GC',
    exactRoundtrip: true,
    exactUndo: true,
  };
}

async function browserBenchmarks(samples) {
  const { chromium, webkit } = await import('@playwright/test');
  const { createServer } = await import('vite');
  const server = await createServer({
    root: resolve(root, 'apps/editor-playground'),
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Missing benchmark server port');
  const results = [];
  try {
    for (const [engine, launcher] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      let browser;
      const engineResults = [];
      try {
        browser = await launcher.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await page.goto(`http://127.0.0.1:${address.port}/portable.html`);
        await page.waitForFunction(() => Boolean(window.playgroundEditor));
        await page.evaluate(() => {
          const View = window.playgroundEditor.constructor;
          window.playgroundEditor.destroy();
          document.body.replaceChildren();
          const host = document.createElement('article');
          host.style.cssText = 'width: 840px; margin: 40px auto';
          document.body.append(host);
          window.benchmarkEditor = new View(host);
          window.benchmarkInput = [];
          let start = 0;
          window.benchmarkEditor.element.addEventListener(
            'beforeinput',
            () => {
              start = performance.now();
            },
            { capture: true },
          );
          window.benchmarkEditor.element.addEventListener('beforeinput', () => {
            window.benchmarkInput.push(performance.now() - start);
          });
        });
        for (const source of samples) {
          console.error(`${engine} ${Buffer.byteLength(source)} bytes: load/selection`);
          const measurement = await withTimeout(
            page.evaluate(async (text) => {
              const editor = window.benchmarkEditor;
              const load = [],
                paint = [],
                selection = [];
              editor.load(text);
              const repetitions = text.length > 500_000 ? 3 : 5;
              for (let i = 0; i < repetitions; i++) {
                editor.load('');
                const start = performance.now();
                editor.load(text);
                load.push(performance.now() - start);
                await new Promise((done) =>
                  requestAnimationFrame(() => requestAnimationFrame(done)),
                );
                paint.push(performance.now() - start);
              }
              if (editor.getMarkdown() !== text) throw new Error('View load changed source');
              for (let i = 0; i < 20; i++) {
                const position = i % 2 === 0 ? 0 : text.length;
                const start = performance.now();
                editor.setSelection({ anchor: position, head: position });
                selection.push(performance.now() - start);
              }
              editor.setSelection({ anchor: text.length, head: text.length });
              editor.focus();
              window.benchmarkInput = [];
              return {
                load,
                paint,
                selection,
                elements: editor.element.querySelectorAll('*').length,
              };
            }, source),
            120_000,
            `${engine} ${Buffer.byteLength(source)} byte load/selection`,
          );
          console.error(`${engine} ${Buffer.byteLength(source)} bytes: keyboard`);
          const wallClock = [];
          for (let i = 0; i < 20; i++) {
            const start = performance.now();
            await withTimeout(page.keyboard.type('x'), 30_000, `${engine} keyboard character`);
            wallClock.push(performance.now() - start);
          }
          const afterInput = await page.evaluate((original) => {
            const editor = window.benchmarkEditor;
            if (editor.getMarkdown() !== `${original}${'x'.repeat(20)}`) {
              throw new Error('Keyboard input did not match expected source');
            }
            const input = [...window.benchmarkInput];
            let undoCount = 0;
            while (editor.session.undo()) {
              undoCount++;
              if (undoCount > 20) throw new Error('Unexpected browser history length');
            }
            if (editor.getMarkdown() !== original) throw new Error('View undo changed source');
            return { input, undoCount };
          }, source);
          engineResults.push({
            bytes: Buffer.byteLength(source),
            elementCount: measurement.elements,
            loadSync: summarize(measurement.load),
            loadTwoFrames: summarize(measurement.paint),
            selectionApi: summarize(measurement.selection),
            inputHandler: summarize(afterInput.input),
            keyboardAutomation: summarize(wallClock),
            undoGroupsFor20Characters: afterInput.undoCount,
            exactSourceAndUndo: true,
          });
          await writeFile(
            resolve(output, `${engine}-partial.json`),
            `${JSON.stringify(engineResults, null, 2)}\n`,
          );
        }
        results.push({ engine, version: browser.version(), results: engineResults });
      } catch (error) {
        results.push({
          engine,
          partialResults: engineResults,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await browser?.close();
      }
    }
  } finally {
    await server.close();
  }
  return results;
}

const samples = sizes.map(sample);
await mkdir(output, { recursive: true });
const beforeFingerprints = await fingerprints();
let productVersion = null;
if (process.platform === 'darwin') {
  productVersion = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim();
}
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    osRelease: os.release(),
    osProductVersion: productVersion,
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    explicitGc: Boolean(globalThis.gc),
  },
  method: {
    fixture: 'Original repeated mixed Markdown; exact UTF-8 byte sizes, mixed EOL and Unicode',
    core: '5 warmups and 30 samples for parse/load; 100 individual end insertions and undos',
    browser: browserRequested
      ? 'Headless Playwright: 1 warmup + 5 view.load (3 for 1MB), each from blank state; 20 selection changes and real keyboard x inputs'
      : 'Not requested',
    browserInput:
      'beforeinput capture-to-bubble synchronous handler; excludes paint/IPC; keyboardAutomation includes IPC and event scheduling',
    browserLoad:
      'Full source load after blank reset, including parse and DOM creation; excludes first navigation/JS download and constructor setup',
    heap: 'Approximate Node heap delta retains parsed document and 100 independent history states; not process RSS or browser/native memory',
  },
  core: samples.map(coreBenchmark),
  browsers: [],
  sourceFingerprints: beforeFingerprints,
};
await writeFile(resolve(output, 'editor-core-latest.json'), `${JSON.stringify(report, null, 2)}\n`);
report.browsers = browserRequested ? await browserBenchmarks(samples) : [];
report.sourceChangedDuringRun =
  JSON.stringify(beforeFingerprints) !== JSON.stringify(await fingerprints());
await writeFile(resolve(output, 'editor-latest.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
