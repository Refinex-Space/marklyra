import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium, webkit } from '@playwright/test';
import { createPerformanceFixture, summarize } from './performance-fixtures.mjs';

const root = resolve(import.meta.dirname, '..');
const argument = (name, fallback) =>
  process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? fallback;
const label = argument('label', 'latest');
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Invalid report label');
const worker = process.argv.includes('--worker');
// Read-only A/B sampling of an explicitly selected prior local adapter build.
const frameHostPath = argument('frame-host', '');
const frameHostOverride = frameHostPath ? await readFile(resolve(frameHostPath)) : undefined;
const output = resolve(root, 'artifacts/performance/runtime', label);
await mkdir(resolve(root, 'artifacts/performance/runtime'), { recursive: true });
await mkdir(output, { recursive: worker });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = [
  'packages/editor-core/dist/source-mirror.js',
  'packages/editor-core/dist/source-mirror-ranges.js',
  'packages/editor-runtime/dist/index.js',
  'private/runtime-assets/frame-host.js',
  'private/runtime-assets/appsrc/main.js',
  'private/runtime-assets/runtime-manifest.json',
  'private/vendor/TypeMark/appsrc/main.js',
  'scripts/performance-fixtures.mjs',
  'scripts/benchmark-runtime-editor.mjs',
];
const fingerprints = async () =>
  Object.fromEntries([
    ...(await Promise.all(
      files.map(async (path) => [path, hash(await readFile(resolve(root, path)))]),
    )),
    ...(frameHostOverride ? [['servedFrameHostOverride', hash(frameHostOverride)]] : []),
  ]);
if (!worker) {
  const before = await fingerprints();
  const cases = [];
  for (const engine of ['chromium', 'webkit']) {
    for (const bytes of [10 * 1024, 100 * 1024, 1024 * 1024]) {
      const file = resolve(output, `${engine}-${bytes}.json`);
      console.log(`Runtime SDK benchmark: ${engine} ${bytes} bytes`);
      let workerError = null;
      try {
        execFileSync(
          process.execPath,
          [
            import.meta.filename,
            '--worker',
            `--engine=${engine}`,
            `--bytes=${bytes}`,
            `--label=${label}`,
            ...(frameHostPath ? [`--frame-host=${resolve(frameHostPath)}`] : []),
          ],
          { cwd: root, stdio: 'inherit', timeout: 120_000 },
        );
      } catch (error) {
        workerError = String(error);
      }
      let data;
      try {
        data = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        data = { engine, bytes, stage: 'no-result' };
      }
      cases.push({ ...data, ...(workerError ? { workerError } : {}) });
      await writeFile(resolve(output, 'partial.json'), JSON.stringify(cases, null, 2) + '\n');
    }
  }
  const after = await fingerprints();
  const report = {
    capturedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
    },
    method: {
      scope:
        'Runtime SDK in headless browsers; native WKWebView/WebView2 require separate validation',
      load: 'Warm runtime; three SDK.load from blank, then two animation frames. Includes snapshot/mapping/bridge; excludes initial JS navigation.',
      keyboard:
        'Eight real keyboard characters; automation wall time and child capture-to-bubble handler separately. Flush latency includes canonical synchronization, mapping and IPC.',
      selection: 'DOM Range moves to document tail; two-frame elapsed includes refresh wait.',
      paste:
        'Synthetic ClipboardEvent, not OS clipboard. 10KiB plain text at tail; flush and exact source verification.',
      heap: 'Chromium CDP JSHeapUsedSize when available, no forced GC; unavailable on WebKit. Not native RSS or isolated retained history.',
      deadline:
        'Each case is a separate worker/browser; parent 120s deadline. Per-page default timeout 20s, SDK own deadlines unchanged.',
      percentiles: 'nearest rank; three load samples cannot estimate stable tail latency',
    },
    sourceFingerprints: before,
    sourceChangedDuringRun: JSON.stringify(before) !== JSON.stringify(after),
    cases,
  };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  if (
    report.sourceChangedDuringRun ||
    cases.some(
      (entry) =>
        entry.stage !== 'complete' ||
        !entry.exactInputAndPaste ||
        entry.errors?.length ||
        entry.workerError,
    )
  )
    process.exitCode = 1;
  console.log(
    JSON.stringify(
      cases.map(({ engine, bytes, stage, load, keyboard, flush, error, workerError }) => ({
        engine,
        bytes,
        stage,
        load,
        keyboard,
        flush,
        error,
        workerError,
      })),
      null,
      2,
    ),
  );
} else {
  const engine = argument('engine');
  if (!['chromium', 'webkit'].includes(engine)) throw new Error('Invalid benchmark engine');
  const bytes = Number(argument('bytes'));
  const source = createPerformanceFixture(bytes, bytes === 10240 ? 'plain' : 'mixed');
  const result = {
    engine,
    bytes,
    utf16Units: source.length,
    fixtureSha256: hash(source),
    stage: 'launch',
    capturedAt: new Date().toISOString(),
    errors: [],
    lifecycle: [],
    loadSamples: [],
    sourceFingerprints: await fingerprints(),
  };
  const resultPath = resolve(output, `${engine}-${bytes}.json`);
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  const save = async (stage) => {
    result.stage = stage;
    await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n');
  };
  let browser;
  let cleaningUp = false;
  const lifecycle = (event) =>
    result.lifecycle.push({ event, at: new Date().toISOString(), stage: result.stage, cleaningUp });
  try {
    browser = await { chromium, webkit }[engine].launch({ headless: true });
    browser.on('disconnected', () => lifecycle('browser-disconnected'));
    result.browserVersion = browser.version();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('crash', () => lifecycle('page-crash'));
    page.on('close', () => lifecycle('page-close'));
    if (frameHostOverride)
      await page.route('http://127.0.0.1:4174/frame-host.js*', (route) =>
        route.fulfill({ body: frameHostOverride, contentType: 'text/javascript' }),
      );
    page.setDefaultTimeout(20_000);
    page.on('pageerror', (error) => result.errors.push(String(error)));
    await page.goto('http://127.0.0.1:4173/');
    await page.waitForFunction(() => Boolean(window.marklyraEditor));
    await page.evaluate(async () => {
      await window.marklyraEditor.ready;
      const previous = window.marklyraEditor;
      const Editor = previous.constructor;
      const mount = previous.element.parentElement;
      previous.destroy();
      window.benchmarkErrors = [];
      window.marklyraEditor = new Editor(mount, {
        runtimeUrl: 'http://127.0.0.1:4174/index.html',
        documentContext: 'benchmark',
        markdown: '',
        host: {
          images: {
            resolve: async ({ reference }) =>
              reference === 'fixture.png'
                ? {
                    url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMwaQz6DwAD+wIH+1FtgwAAAABJRU5ErkJggg==',
                  }
                : null,
          },
        },
        onError: (error) => window.benchmarkErrors.push(String(error)),
      });
      await window.marklyraEditor.ready;
    });
    const frame = page.frames().find((entry) => entry.url().startsWith('http://127.0.0.1:4174/'));
    if (!frame) throw new Error('Missing runtime runtime frame');
    const loads = [],
      paints = [];
    await save('load');
    for (let i = 0; i < 3; i++) {
      const sample = { sample: i + 1 };
      result.loadSamples.push(sample);
      result.loadSample = i + 1;
      result.loadPhase = 'clear';
      await save('load');
      await page.evaluate(() => window.marklyraEditor.load(''));
      result.loadPhase = 'load-or-two-frames';
      await save('load');
      const start = performance.now();
      await page.evaluate((text) => window.marklyraEditor.load(text), source);
      sample.loadMs = performance.now() - start;
      loads.push(sample.loadMs);
      sample.frames = await frame.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame((first) =>
              requestAnimationFrame((second) => done({ first, second })),
            ),
          ),
      );
      sample.loadTwoFramesMs = performance.now() - start;
      paints.push(sample.loadTwoFramesMs);
    }
    if ((await page.evaluate(() => window.marklyraEditor.flush())) !== source)
      throw new Error('Load changed raw source');
    result.load = summarize(loads);
    result.loadTwoFrames = summarize(paints);
    result.structure = await frame.evaluate(() => ({
      elements: document.querySelector('#write').querySelectorAll('*').length,
      blocks: document.querySelector('#write').children.length,
      sourceMode: window.editor.sourceView.inSourceMode,
      codeMirrors: document.querySelectorAll('.CodeMirror').length,
    }));
    await save('input');
    await frame.evaluate(() => {
      const metrics = {
        sync: [],
        markdown: [],
        input: [],
        beforeinput: [],
      };
      window.benchmarkMetrics = metrics;
      for (const [object, name, key] of [
        [window.File, 'sync', 'sync'],
        [window.editor, 'getMarkdown', 'markdown'],
      ]) {
        const method = object[name];
        object[name] = function (...args) {
          const start = performance.now();
          try {
            return method.apply(this, args);
          } finally {
            metrics[key].push(performance.now() - start);
          }
        };
      }
      for (const type of ['input', 'beforeinput']) {
        let start = 0;
        document.addEventListener(
          type,
          () => {
            start = performance.now();
          },
          true,
        );
        document.addEventListener(type, () => {
          metrics[type].push(performance.now() - start);
        });
      }
      window.benchmarkTail = () => {
        const area = document.querySelector('#write');
        const last = area.lastElementChild;
        if (
          !last?.textContent.endsWith('benchmark-tail') &&
          !last?.textContent.includes('benchmark-tailx')
        )
          throw new Error('Unexpected tail paragraph');
        area.focus();
        const range = document.createRange();
        const walker = document.createTreeWalker(last, 4);
        let tail = walker.nextNode();
        if (!tail) throw new Error('Missing tail text node');
        let next = walker.nextNode();
        while (next) {
          tail = next;
          next = walker.nextNode();
        }
        range.setStart(tail, tail.textContent.length);
        range.collapse(true);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      };
      window.benchmarkTail();
    });
    const keys = [],
      flushes = [];
    for (let i = 0; i < 8; i++) {
      let start = performance.now();
      await page.keyboard.type('x');
      keys.push(performance.now() - start);
      start = performance.now();
      const actual = await page.evaluate(() => window.marklyraEditor.flush());
      flushes.push(performance.now() - start);
      if (actual !== source + 'x'.repeat(i + 1)) throw new Error('Input changed untouched source');
    }
    result.keyboard = summarize(keys);
    result.flush = summarize(flushes);
    const timings = await frame.evaluate(() => window.benchmarkMetrics);
    result.instrumented = Object.fromEntries(
      Object.entries(timings).map(([key, times]) => [key, summarize(times)]),
    );
    await save('selection');
    const selections = [];
    for (let i = 0; i < 8; i++) {
      const elapsed = await frame.evaluate(async () => {
        const start = performance.now();
        window.benchmarkTail();
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        return performance.now() - start;
      });
      selections.push(elapsed);
    }
    result.selectionTwoFrames = summarize(selections);
    await save('paste');
    const pasted = 'p'.repeat(10 * 1024);
    const start = performance.now();
    await frame.evaluate((text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      document
        .querySelector('#write')
        .dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
        );
    }, pasted);
    await frame.waitForFunction(
      (tail) => document.querySelector('#write')?.textContent.includes(tail),
      pasted.slice(-100),
    );
    const pastedSource = await page.evaluate(() => window.marklyraEditor.flush());
    result.pasteAndFlushMs = performance.now() - start;
    if (pastedSource !== source + 'x'.repeat(8) + pasted) {
      const expected = source + 'x'.repeat(8) + pasted;
      let offset = 0;
      while (offset < expected.length && expected[offset] === pastedSource[offset]) offset++;
      result.pasteMismatch = {
        offset,
        actualLength: pastedSource.length,
        expectedLength: expected.length,
        actual: pastedSource.slice(Math.max(0, offset - 40), offset + 120),
        expected: expected.slice(Math.max(0, offset - 40), offset + 120),
      };
      throw new Error('Paste did not preserve exact source');
    }
    result.exactInputAndPaste = true;
    if (engine === 'chromium') {
      const session = await page.context().newCDPSession(page);
      await session.send('Performance.enable');
      result.chromiumMetrics = (await session.send('Performance.getMetrics')).metrics.filter(
        (entry) => ['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'Documents'].includes(entry.name),
      );
    }
    result.errors.push(...(await page.evaluate(() => window.benchmarkErrors)));
    if (result.errors.length) throw new Error('Runtime reported errors');
    await save('complete');
  } catch (error) {
    result.error = String(error);
    process.exitCode = 1;
    await save(`failed:${result.stage}`);
  } finally {
    cleaningUp = true;
    try {
      await browser?.close();
    } catch (error) {
      result.cleanupError = String(error);
      process.exitCode = 1;
    }
    await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n');
  }
}
