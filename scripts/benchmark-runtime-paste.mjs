import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium, webkit } from '@playwright/test';
import { installPasteRecorder } from '../tools/performance/paste-recorder.mjs';
import { createPerformanceFixture } from './performance-fixtures.mjs';

const root = resolve(import.meta.dirname, '..');
const arg = (name, fallback) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const options = new Set([
  'label',
  'scenario',
  'engine',
  'bytes',
  'paste-bytes',
  'page-url',
  'runtime-url',
  'frame-host',
  'frame-sha',
  'main',
  'main-sha',
  'zenuml-css',
  'css-sha',
  'output',
]);
for (const argument of process.argv.slice(2)) {
  if (['--run', '--help'].includes(argument)) continue;
  const name = /^--([^=]+)=/.exec(argument)?.[1];
  if (!name || !options.has(name)) throw Error(`Unknown benchmark argument: ${argument}`);
}
if (process.argv.includes('--help')) {
  console.log(`Usage: node scripts/benchmark-runtime-paste.mjs [--run] [options]

Without --run, validate and print frozen input identities without launching a browser.
Start the repository's browser-test-server/runtime-server separately; this script
never builds, starts or stops shared services. Each run owns one browser server.

  --label=sample --scenario=fresh|typing-drained|typing-overlap --engine=webkit|chromium
  --bytes=10240|102400|1048576 --paste-bytes=10240
  --page-url=http://127.0.0.1:4173/runtime.html
  --runtime-url=http://127.0.0.1:4174/index.html
  --frame-host=dist/editor-runtime/frame-host.js [--frame-sha=<sha256>]
  --main=dist/editor-runtime/appsrc/main.js [--main-sha=<sha256>]
  --zenuml-css=dist/editor-runtime/lib/diagram/css/mermaid-zenuml.css [--css-sha=<sha256>]
  --output=<new directory; default artifacts/performance/runtime-paste/timestamp-label-scenario-size>

Frame, main and CSS buffers are frozen before browser launch and their actual
SHA-256 values are always reported. Optional expected hashes reject a wrong input.
Compare serial A/B and B/A runs with identical fixture, SDK/core, main, recorder,
scenario and engine. Keep failed/changed-input reports, but exclude their timing.
The full action window includes delayed typing/scroll work, and exact source plus
Undo/Redo/continued input is required. One pair does not estimate tail latency.`);
  process.exit(0);
}
const engine = arg('engine', 'webkit');
const scenario = arg('scenario', 'fresh');
const bytes = Number(arg('bytes', '1048576'));
const payloadBytes = Number(arg('paste-bytes', '10240'));
const label = arg('label', 'sample');
if (
  !['webkit', 'chromium'].includes(engine) ||
  !['fresh', 'typing-drained', 'typing-overlap'].includes(scenario)
)
  throw Error('Invalid engine/scenario');
if (
  ![10240, 102400, 1048576].includes(bytes) ||
  !Number.isSafeInteger(payloadBytes) ||
  payloadBytes < 128 ||
  payloadBytes > 1048576
)
  throw Error('Invalid bounded fixture size');
if (!/^[a-z0-9-]+$/i.test(label)) throw Error('Invalid label');
const pageUrl = new URL(arg('page-url', 'http://127.0.0.1:4173/runtime.html'));
const runtimeUrl = new URL(arg('runtime-url', 'http://127.0.0.1:4174/index.html'));
for (const url of [pageUrl, runtimeUrl])
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  )
    throw Error('Benchmark requires explicit loopback HTTP services');
const framePath = resolve(arg('frame-host', resolve(root, 'dist/editor-runtime/frame-host.js')));
const mainPath = resolve(arg('main', resolve(root, 'dist/editor-runtime/appsrc/main.js')));
const frameBytes = await readFile(framePath),
  mainBytes = await readFile(mainPath);
const cssPath = resolve(
  arg('zenuml-css', resolve(root, 'dist/editor-runtime/lib/diagram/css/mermaid-zenuml.css')),
);
const cssBytes = await readFile(cssPath);
for (const [name, input] of [
  ['frame-sha', frameBytes],
  ['main-sha', mainBytes],
  ['css-sha', cssBytes],
]) {
  const expected = arg(name, '');
  if (expected && (!/^[a-f0-9]{64}$/.test(expected) || hash(input) !== expected))
    throw Error(`Frozen input does not match --${name}`);
}
const source = createPerformanceFixture(bytes, bytes === 10240 ? 'plain' : 'mixed');
const marker = '__MARKLYRA_PASTE_END_8E41__';
const payload = 'p'.repeat(payloadBytes - marker.length) + marker;
const controllerFiles = [
  'package.json',
  'pnpm-lock.yaml',
  'scripts/performance-fixtures.mjs',
  'scripts/benchmark-runtime-paste.mjs',
  'tools/performance/paste-recorder.mjs',
];
async function fingerprint() {
  const paths = [...controllerFiles];
  async function visit(directory, optional = false) {
    let entries;
    try {
      entries = await readdir(resolve(root, directory), { withFileTypes: true });
    } catch (error) {
      if (optional && error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const path = `${directory}/${entry.name}`;
      if (entry.isSymbolicLink()) throw Error(`Unexpected fingerprint symlink: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) paths.push(path);
    }
  }
  await visit('dist/editor-runtime');
  await visit('apps/editor-playground/src');
  paths.push('apps/editor-playground/runtime.html', 'apps/editor-playground/vite.config.ts');
  for (const entry of await readdir(resolve(root, 'packages'), { withFileTypes: true }))
    if (entry.isDirectory()) await visit(`packages/${entry.name}/dist`, true);
  return Object.fromEntries(
    await Promise.all(
      paths.sort().map(async (path) => [path, hash(await readFile(resolve(root, path)))]),
    ),
  );
}
const identities = await fingerprint();
const config = {
  engine,
  scenario,
  bytes,
  payloadBytes,
  label,
  pageUrl: pageUrl.href,
  runtimeUrl: runtimeUrl.href,
  framePath,
  frameSha256: hash(frameBytes),
  mainPath,
  mainSha256: hash(mainBytes),
  cssPath,
  cssSha256: hash(cssBytes),
  fixtureSha256: hash(source),
  payloadSha256: hash(payload),
  delayedWork: {
    loadMinimumMs: 2300,
    typingMinimumMs: 2300,
    pasteMinimumMs: 2600,
    quietMs: 250,
    maximumMs: 15000,
  },
};
if (!process.argv.includes('--run')) {
  console.log(JSON.stringify({ planOnly: true, config, identities }, null, 2));
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = resolve(
  arg(
    'output',
    resolve(root, 'artifacts/performance/runtime-paste', `${stamp}-${label}-${scenario}-${bytes}`),
  ),
);
await mkdir(dirname(output), { recursive: true });
await mkdir(output);
await writeFile(resolve(output, 'fixture.md'), source, { flag: 'wx' });
await writeFile(resolve(output, 'payload.txt'), payload, { flag: 'wx' });
const report = {
  schema: 2,
  status: 'starting',
  startedAt: new Date().toISOString(),
  config,
  identities,
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
      'Own headless browser, synthetic plain tail ClipboardEvent; no native OS clipboard/IME claim and no claim that every offscreen preview has rendered.',
    clock:
      'Node wall times and child performance.now recorded separately; no clock-domain subtraction.',
    attribution:
      'Timers retain scheduling cause across nested timer callbacks. Promise/rAF causality is not inferred; unmatched work remains unknown. Original delays are never changed or cancelled by the harness.',
    measurement:
      'Instrumented paired comparison. scrollAdjust/getMarkdown/File.sync and owned brush work are delegated; original brush Promise identities and native serializer prototypes are preserved. Inclusive costs must not be added.',
    identities:
      'All package dist files, runtime assets and playground sources are fingerprinted before/after. Actual host and measured-frame HTTP response bodies are hashed separately: disk identity does not prove a Vite cache served that revision. Paired runs must compare served hashes as well as disk identities.',
    window:
      'Paste+DOM+flush+two frames+at least 2600ms from dispatch, all observed non-background setTimeout callbacks drained, native brush queue empty, all observed brush Promises settled and 250ms quiet, then geometry and two final frame opportunities. Only the identified perpetual Brush idle timeout is excluded; its actual work remains observed. Combined selection/typing-to-complete window is also reported.',
    heap: 'Chromium CDP JS heap at fixed stage boundaries, no forced GC; unavailable for WebKit. This is not total/native/retained-history memory.',
  },
  stages: {},
  sourceChecks: [],
  errors: [],
  lifecycle: [],
  servedFrozenAssets: {},
  servedResponses: [],
};
const save = () =>
  writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
let server, browser, page, frame;
let activeStage = 'launch';
let interactionWindow = false;
const sourceCaptures = new Map();
const responseJobs = new Set();
const responses = [];
function observeResponse(response) {
  const url = new URL(response.url());
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    ![pageUrl.origin, runtimeUrl.origin].includes(url.origin)
  )
    return;
  let owner;
  try {
    owner = response.request().frame();
  } catch (error) {
    report.errors.push({
      stage: 'identity',
      message: `Resource owner unavailable: ${String(error)}`,
    });
    return;
  }
  const entry = {
    url: url.href,
    status: response.status(),
    type: response.request().resourceType(),
    phase: activeStage,
  };
  responses.push({ owner, entry });
  const job = (async () => {
    try {
      const bytes = await response.body();
      entry.bytes = bytes.length;
      entry.sha256 = hash(bytes);
    } catch (error) {
      entry.error = String(error);
    }
  })();
  responseJobs.add(job);
  void job.finally(() => responseJobs.delete(job));
}
function responseIdentities() {
  return responses
    .filter(({ owner }) => owner === frame || owner === page?.mainFrame())
    .map(({ owner, entry }) => ({ owner: owner === frame ? 'runtime' : 'host', ...entry }));
}
async function finishResponseIdentities() {
  let timeout;
  try {
    await Promise.race([
      (async () => {
        while (responseJobs.size) await Promise.all([...responseJobs]);
      })(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(Error('Response identity collection timed out')), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    report.servedResponses = responseIdentities();
  }
  // The demo's retired iframe is deliberately destroyed before the measured
  // editor is created. Its cancelled responses do not describe this fixture.
  if (report.servedResponses.some((entry) => entry.error || !entry.sha256))
    throw Error('Measured resource response identity is unavailable');
  for (const [path, asset] of Object.entries(report.servedFrozenAssets)) {
    const expected = new URL(path, runtimeUrl);
    const served = report.servedResponses.filter((entry) => {
      const actual = new URL(entry.url);
      return (
        entry.owner === 'runtime' &&
        actual.origin === expected.origin &&
        actual.pathname === expected.pathname
      );
    });
    if (!asset.requests || !served.length || served.some((entry) => entry.sha256 !== asset.sha256))
      throw Error(`Frozen asset was not served with its expected identity: ${path}`);
  }
}
const watchdog = setTimeout(() => {
  report.deadline = '180000ms case deadline';
  void server?.kill();
}, 180000);
async function stage(name, work) {
  activeStage = name;
  report.activeStage = name;
  if (!interactionWindow) await save();
  const start = performance.now();
  const value = await work();
  report.stages[name] = { wallMs: performance.now() - start, value };
  if (!interactionWindow) await save();
  return value;
}
async function phase(name) {
  await frame.evaluate((name) => window.__pasteBench.phaseTo(name), name);
}
async function exact(name, wanted) {
  const actual = await page.evaluate(() => window.marklyraEditor.flush());
  sourceCaptures.set(name, { actual, wanted });
  const item = { name, exact: actual === wanted, utf16Units: actual.length };
  report.sourceChecks.push(item);
  if (!item.exact) {
    await save();
    throw Error(`Full source mismatch: ${name}`);
  }
  return item;
}
const frames = () =>
  frame.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame((first) =>
          requestAnimationFrame((second) => resolve({ first, second })),
        ),
      ),
  );
async function heap(name) {
  if (engine !== 'chromium')
    return {
      name,
      available: false,
      reason: 'WebKit exposes no comparable JS heap through this harness',
    };
  const session = await page.context().newCDPSession(page);
  try {
    return { name, available: true, ...(await session.send('Runtime.getHeapUsage')) };
  } finally {
    await session.detach();
  }
}
try {
  await stage('startup', async () => {
    server = await { chromium, webkit }[engine].launchServer({ headless: true });
    report.ownedBrowserPid = server.process().pid;
    browser = await { chromium, webkit }[engine].connect(server.wsEndpoint());
    report.browserVersion = browser.version();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block',
    });
    await context.addInitScript(installPasteRecorder, { origin: runtimeUrl.origin });
    for (const [path, contentType, body] of [
      ['frame-host.js', 'text/javascript', frameBytes],
      ['appsrc/main.js', 'text/javascript', mainBytes],
      ['lib/diagram/css/mermaid-zenuml.css', 'text/css', cssBytes],
    ]) {
      const served = { sha256: hash(body), requests: 0 };
      report.servedFrozenAssets[path] = served;
      await context.route(`${new URL(path, runtimeUrl).href}*`, (route) => {
        served.requests++;
        return route.fulfill({ contentType, body });
      });
    }
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('response', observeResponse);
    page.on('pageerror', (error) =>
      report.errors.push({ stage: activeStage, message: error.message }),
    );
    page.on('crash', () => report.lifecycle.push({ event: 'crash', stage: activeStage }));
    await page.goto(pageUrl.href);
    await page.waitForFunction(() => Boolean(window.marklyraEditor));
    await page.evaluate(async (runtimeUrl) => {
      const old = window.marklyraEditor;
      await old.ready;
      const C = old.constructor,
        mount = old.element.parentElement;
      old.destroy();
      window.benchmarkErrors = [];
      window.marklyraEditor = new C(mount, {
        runtimeUrl,
        markdown: '',
        documentContext: 'runtime-paste-benchmark',
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
        onError: (error) => window.benchmarkErrors.push(error.message),
      });
      await window.marklyraEditor.ready;
    }, runtimeUrl.href);
    frame = page.frames().find((entry) => entry.url().startsWith(`${runtimeUrl.origin}/`));
    if (!frame) throw Error('Missing current runtime frame');
    await frame.evaluate(() => window.__pasteBench.installMethods());
  });
  await phase('load');
  await stage('load', () => page.evaluate((source) => window.marklyraEditor.load(source), source));
  await stage('loadFrames', frames);
  await stage('loadDrain', () =>
    frame.evaluate(() =>
      window.__pasteBench.drain({
        causes: ['startup', 'load'],
        allCauses: true,
        anchor: window.__pasteBench.phaseAt,
        minimumMs: 2300,
        quietMs: 250,
        maximumMs: 15000,
      }),
    ),
  );
  await stage('loadExact', () => exact('loaded', source));
  report.structure = await frame.evaluate(() => ({
    elements: document.querySelector('#write').querySelectorAll('*').length,
    blocks: window.editor.nodeMap.blocks.length,
    modelNodes: window.editor.nodeMap.allNodes.length,
    images: document.querySelectorAll('#write img').length,
    codeMirrors: document.querySelectorAll('#write .CodeMirror').length,
  }));
  report.heapBefore = await heap('before-scenario');
  const scenarioStart = performance.now();
  interactionWindow = true;
  await phase('selection');
  await stage('selection', () =>
    frame.evaluate(() => {
      const area = window.editor.writingArea,
        last = area.lastElementChild;
      if (!last?.textContent.endsWith('benchmark-tail')) throw Error('Unexpected fixture tail');
      area.focus();
      const walker = document.createTreeWalker(last, 4);
      let tail;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) tail = node;
      if (!tail) throw Error('Missing tail text');
      getSelection().setBaseAndExtent(tail, tail.textContent.length, tail, tail.textContent.length);
      // No scrollTop/rect/scrollIntoView read here: do not force paste layout early.
    }),
  );
  let beforePaste = source;
  if (scenario !== 'fresh') {
    await phase('typing');
    await stage('typing', async () => {
      for (let count = 0; count < 8; count++) await page.keyboard.type('x');
    });
    beforePaste += 'xxxxxxxx';
    await stage('typingFlush', () => exact('typed', beforePaste));
    if (scenario === 'typing-drained') {
      await phase('typing-drain');
      await stage('typingDrain', () =>
        frame.evaluate(() =>
          window.__pasteBench.drain({
            causes: ['typing', 'selection', 'typing-drain'],
            allCauses: true,
            anchor: window.__pasteBench.lastInputAt,
            minimumMs: 2300,
            quietMs: 250,
            maximumMs: 15000,
          }),
        ),
      );
    }
  }
  report.pendingAtPaste = await frame.evaluate(() => [...window.__pasteBench.pending.values()]);
  const pasteStart = performance.now();
  await stage('pasteDispatch', () =>
    frame.evaluate(
      ({ payload, marker }) => {
        const state = window.__pasteBench;
        state.phaseTo('paste');
        const area = window.editor.writingArea;
        state.paste = { startedAt: performance.now(), trusted: false };
        const observer = new MutationObserver(() => {
          if (!area.lastElementChild?.textContent.includes(marker)) return;
          state.paste.domReadyAt = performance.now();
          observer.disconnect();
          requestAnimationFrame((first) =>
            requestAnimationFrame((second) => {
              state.paste.domFrames = { first, second };
            }),
          );
        });
        observer.observe(area, { subtree: true, childList: true, characterData: true });
        const data = new DataTransfer();
        data.setData('text/plain', payload);
        const event = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        });
        area.dispatchEvent(event);
        state.paste.dispatchEndedAt = performance.now();
        state.paste.defaultPrevented = event.defaultPrevented;
        return state.paste;
      },
      { payload, marker },
    ),
  );
  await stage('pasteDOM', () =>
    frame
      .waitForFunction(() => window.__pasteBench.paste.domReadyAt !== undefined)
      .then(() => frame.evaluate(() => window.__pasteBench.paste)),
  );
  const expected = beforePaste + payload;
  await stage('pasteFlush', () => exact('pasted', expected));
  report.pasteToFlushWallMs = performance.now() - pasteStart;
  await stage('pasteFrames', frames);
  report.pasteToTwoFramesWallMs = performance.now() - pasteStart;
  await phase('paste-window');
  await stage('pasteDelayedWindow', () =>
    frame.evaluate(() =>
      window.__pasteBench.drain({
        causes: ['typing', 'selection', 'typing-drain', 'paste', 'paste-window'],
        allCauses: true,
        anchor: window.__pasteBench.paste.startedAt,
        minimumMs: 2600,
        quietMs: 250,
        maximumMs: 15000,
      }),
    ),
  );
  await stage('finalScrollObservation', () =>
    frame.evaluate(() => {
      const start = performance.now();
      const positions = [...document.querySelectorAll('content')].map((element) => ({
        top: element.scrollTop,
        left: element.scrollLeft,
      }));
      return { start, end: performance.now(), positions };
    }),
  );
  await stage('finalFrames', frames);
  report.pasteToCompleteWindowWallMs = performance.now() - pasteStart;
  report.selectionTypingPasteWindowWallMs = performance.now() - scenarioStart;
  interactionWindow = false;
  report.performanceLedger = await frame.evaluate(() => window.__pasteBench.snapshot());
  await phase('verification');
  await exact('after-delayed-window', expected);
  await stage('undo', () => page.evaluate(() => window.marklyraEditor.execute({ type: 'undo' })));
  await exact('undone', beforePaste);
  await stage('redo', () => page.evaluate(() => window.marklyraEditor.execute({ type: 'redo' })));
  await exact('redone', expected);
  await stage('continueInput', () => page.keyboard.insertText('续写😀'));
  await exact('continued', `${expected}续写😀`);
  await page.evaluate(() => window.marklyraEditor.execute({ type: 'undo' }));
  await exact('continue-undone', expected);
  await page.evaluate(() => window.marklyraEditor.execute({ type: 'redo' }));
  await exact('continue-redone', `${expected}续写😀`);
  const saved = await page.evaluate(async () => {
    const source = await window.marklyraEditor.flush();
    return window.marklyraEditor.markSaved(source);
  });
  if (!saved) throw Error('markSaved did not accept final exact source');
  report.heapAfter = await heap('after-history-and-continue');
  report.errors.push(
    ...(await page.evaluate(() =>
      window.benchmarkErrors.map((message) => ({ stage: 'sdk', message })),
    )),
  );
  if (report.errors.length || report.performanceLedger.dropped)
    throw Error('Runtime errors or truncated measurement ledger');
  if (!report.performanceLedger.binding?.node || !report.performanceLedger.binding?.map)
    throw Error('Native serializer identity is unavailable or changed');
  await finishResponseIdentities();
  report.status = 'complete';
} catch (error) {
  report.status = 'failed';
  report.failure = { stage: activeStage, message: String(error) };
  try {
    report.partialLedger = await Promise.race([
      frame?.evaluate(() => window.__pasteBench?.snapshot()),
      new Promise((resolve) => setTimeout(() => resolve('unavailable'), 1000)),
    ]);
  } catch {
    report.partialLedger = 'unavailable';
  }
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  // Close owned resources before report I/O: even a disk/write failure must not
  // strand a connected BrowserServer or close somebody else's browser.
  const bounded = async (work, label) => {
    let timer;
    try {
      await Promise.race([
        work,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error(label)), 3000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    await bounded(browser?.close(), 'Owned browser disconnect timeout');
  } catch (error) {
    report.lifecycle.push({ event: 'disconnect-failed', message: String(error) });
  }
  // browser.close() on a connected browser only disconnects. Always close the
  // BrowserServer we launched, and kill only that owned server if close stalls.
  try {
    await bounded(server?.close(), 'Owned browser server close timeout');
  } catch (error) {
    report.lifecycle.push({ event: 'server-close-failed', message: String(error) });
    try {
      await server?.kill();
    } catch (killError) {
      report.lifecycle.push({ event: 'server-kill-failed', message: String(killError) });
      report.status = 'failed';
      process.exitCode = 1;
    }
  }
  report.lifecycle.push({ event: 'owned-server-cleanup-finished', pid: report.ownedBrowserPid });
  report.servedResponses = responseIdentities();
  try {
    for (const [name, { actual, wanted }] of sourceCaptures) {
      await writeFile(resolve(output, `${name}.md`), actual);
      const item = report.sourceChecks.find((item) => item.name === name);
      Object.assign(item, {
        expectedSha256: hash(wanted),
        actualSha256: hash(actual),
        bytes: Buffer.byteLength(actual),
      });
    }
    const after = await fingerprint();
    report.integrity = {
      cssUnchanged: hash(await readFile(cssPath)) === hash(cssBytes),
      controllerUnchanged: JSON.stringify(after) === JSON.stringify(identities),
      frameUnchanged: hash(await readFile(framePath)) === hash(frameBytes),
      mainUnchanged: hash(await readFile(mainPath)) === hash(mainBytes),
    };
    if (Object.values(report.integrity).some((value) => !value)) {
      report.status = 'failed';
      process.exitCode = 1;
    }
  } catch (error) {
    report.status = 'failed';
    process.exitCode = 1;
    report.lifecycle.push({ event: 'report-or-integrity-failed', message: String(error) });
  }
  // Response collection or teardown can deliver an error after the last source
  // check. Never publish a successful report that contains a late error/crash.
  if (report.errors.length || report.lifecycle.some((entry) => entry.event === 'crash')) {
    report.status = 'failed';
    process.exitCode = 1;
  }
  report.finishedAt = new Date().toISOString();
  await save();
  console.log(
    JSON.stringify(
      {
        output,
        status: report.status,
        failure: report.failure,
        pasteToFlushWallMs: report.pasteToFlushWallMs,
        pasteToCompleteWindowWallMs: report.pasteToCompleteWindowWallMs,
        selectionTypingPasteWindowWallMs: report.selectionTypingPasteWindowWallMs,
      },
      null,
      2,
    ),
  );
}
