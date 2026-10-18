// Original Preferences UI and real parent/child bridge; Native apply/CAS is a controlled substitute.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, webkit } from '@playwright/test';
import { build } from 'vite';

const require = createRequire(resolve('apps/desktop/package.json'));
const entry = 'recovery-markdown-controls-entry';
const common = {
  configFile: false,
  logLevel: 'error',
  resolve: {
    alias: { '@marklyra/editor-runtime': resolve('packages/editor-runtime/src/index.ts') },
  },
};
const parent = await build({
  ...common,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [
    {
      name: entry,
      enforce: 'pre',
      resolveId: (id) => (id === entry || id === resolve(entry) ? `\0${entry}` : null),
      load: (id) =>
        id === `\0${entry}`
          ? `import React from ${JSON.stringify(require.resolve('react'))};import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};import {PreferencesWindow} from ${JSON.stringify(resolve('apps/desktop/src/features/settings/PreferencesWindow.tsx'))};createRoot(document.getElementById('app')).render(React.createElement(PreferencesWindow));`
          : null,
    },
  ],
  build: {
    write: false,
    minify: false,
    lib: { entry, name: 'MarkdownControlsWindow', formats: ['iife'] },
  },
});
const child = await build({
  ...common,
  build: {
    write: false,
    minify: false,
    lib: {
      entry: resolve('apps/desktop/src/features/settings/runtime-preferences/child-host.ts'),
      name: 'MarkdownControlsChild',
      formats: ['iife'],
    },
  },
});
function code(output) {
  return (Array.isArray(output) ? output : [output])
    .flatMap((value) => value.output)
    .find((value) => value.type === 'chunk')?.code;
}
const parentCode = code(parent),
  childCode = code(child);
assert.ok(parentCode && childCode);
const runtimeUrl =
  process.env.MARKDOWN_PREFERENCES_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html';
const childUrl = new URL('./preferences/child-host.js', runtimeUrl).href;
function installMock(runtimeUrl) {
  if (window.top !== window) return;
  window.isTauri = true;
  localStorage.setItem('marklyra-preferences-v1', '{"sentinel":"preserved"}');
  window.probe = {
    calls: [],
    messages: [],
    pending: null,
    value: { schemaVersion: 1, revision: 10, indentSize: 2, prettyIndent: false },
    finish(error) {
      const pending = this.pending;
      if (!pending) throw Error('No pending opener application');
      this.pending = null;
      if (error) return pending.reject(Error(error));
      this.value = { ...this.value, ...pending.change, revision: this.value.revision + 1 };
      pending.resolve({ ...this.value });
    },
  };
  window.addEventListener('message', (event) => {
    if (event.data?.protocol === 'marklyra/preferences/v1') probe.messages.push(event.data);
  });
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'preferences' }, currentWebview: { label: 'preferences' } },
    async invoke(command, args = {}) {
      probe.calls.push({ command, args });
      if (command === 'editor_runtime_url') return runtimeUrl;
      if (command === 'host_platform') return 'macos';
      if (command === 'list_theme_catalog')
        return {
          folderPath: '/mock/themes',
          themes: [{ id: 'marklyra-light', name: 'marklyra-light', builtin: true }],
        };
      if (command === 'get_file_preferences')
        return {
          revision: 0,
          defaultExtension: 'md',
          saveFileOnSwitch: false,
          noRecentFiles: false,
          alwaysConfirmsChanges: true,
        };
      if (command === 'get_startup_preferences')
        return {
          revision: 0,
          restoreWhenLaunch: 0,
          pinFolder: null,
        };
      if (command === 'get_markdown_preferences') return { ...probe.value };
      if (command === 'request_preference_markdown') {
        if (args.expectedRevision !== probe.value.revision) throw Error('revision conflict');
        return new Promise((resolve, reject) => {
          probe.pending = { ...args, resolve, reject };
        });
      }
      if (command === 'close_preferences_window') return;
      throw Error(`Unexpected Native command ${command}`);
    },
  };
}
const server = createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': req.url === '/parent.js' ? 'text/javascript' : 'text/html',
  });
  res.end(
    req.url === '/parent.js'
      ? parentCode
      : '<!doctype html><html><meta charset="utf-8"><style>html,body,#app,.preferences-window{margin:0;width:720px;height:480px}</style><div id="app"></div><script src="/parent.js"></script></html>',
  );
});
await new Promise((done) => server.listen(4198, '127.0.0.1', done));
const results = [];
let failure;
try {
  for (const [engine, launcher] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    const browser = await launcher.launch();
    try {
      for (const scenario of [
        'confirm',
        'reject',
        'late-confirm',
        'late-reject',
        'late-new-choice',
        'reload',
      ]) {
        const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
        const errors = [],
          outside = [];
        try {
          page.on('pageerror', (error) => errors.push(error.message));
          await page.clock.install();
          await page.addInitScript(installMock, runtimeUrl);
          await page.route('**/*', (route) => {
            const url = route.request().url();
            if (url === childUrl)
              return route.fulfill({ contentType: 'text/javascript', body: childCode });
            if (['http://127.0.0.1:4198', new URL(runtimeUrl).origin].includes(new URL(url).origin))
              return route.continue();
            outside.push(url);
            return route.abort();
          });
          await page.goto('http://127.0.0.1:4198/');
          const original = page.frameLocator('iframe');
          await original.locator('.nav-group-item').nth(1).click();
          const indent = original.locator('[data-marklyra-preference="indentSize"]');
          const pretty = original.locator('[data-marklyra-preference="prettyIndent"]');
          const status = original.locator('#marklyra-preferences-status');
          assert.equal(await indent.inputValue(), '2');
          assert.equal(await pretty.isChecked(), false);
          assert.equal(await indent.isEnabled(), true);
          assert.deepEqual(
            await indent.locator('option').evaluateAll((nodes) => nodes.map((n) => n.value)),
            ['0', '2', '3', '4', '5', '-1'],
          );
          if (scenario === 'confirm') {
            for (const value of ['0', '2', '3', '4', '5', '-1']) {
              await indent.selectOption(value);
              await page.waitForFunction(() => probe.pending !== null);
              assert.equal(
                await page.evaluate(() => typeof probe.pending.change.indentSize),
                'number',
              );
              await page.clock.fastForward(16000);
              assert.equal(await page.evaluate(() => probe.pending !== null), true);
              await page.evaluate(() => probe.finish());
              await status.waitFor({ state: 'hidden' });
              assert.equal(await indent.inputValue(), value);
              assert.equal(await page.evaluate(() => probe.value.indentSize), Number(value));
            }
            await pretty.check();
            await page.waitForFunction(() => probe.pending !== null);
            assert.equal(await page.evaluate(() => probe.value.prettyIndent), false);
            await page.evaluate(() => probe.finish());
            await status.waitFor({ state: 'hidden' });
            assert.equal(await pretty.isChecked(), true);
            assert.equal(await page.evaluate(() => probe.value.prettyIndent), true);
          } else if (scenario === 'reject') {
            await indent.selectOption('4');
            await page.waitForFunction(() => probe.pending !== null);
            assert.equal(await page.evaluate(() => probe.value.indentSize), 2);
            await page.evaluate(() => probe.finish('opener SDK rejected'));
            await status.filter({ hasText: 'opener SDK rejected' }).waitFor();
            assert.equal(await indent.inputValue(), '2');
            assert.equal(await indent.isDisabled(), true);
            assert.equal(await pretty.isChecked(), false);
          } else {
            await indent.selectOption('4');
            await page.waitForFunction(() => probe.pending !== null);
            await page.clock.fastForward(36_000);
            await status.filter({ hasText: '正在确认保存结果' }).waitFor();
            assert.equal(await indent.inputValue(), '4');
            assert.equal(await indent.isEnabled(), true);
            assert.equal(await page.evaluate(() => probe.value.indentSize), 2);
            const first = await page.evaluate(() =>
              probe.messages.find((m) => m.kind === 'request' && m.payload.operation === 'put'),
            );
            assert.ok(first);
            if (scenario === 'late-reject') {
              await page.evaluate(() => probe.finish('late storage rejected'));
              await status.filter({ hasText: 'late storage rejected' }).waitFor();
              assert.equal(await indent.inputValue(), '2');
              assert.equal(await indent.isDisabled(), true);
            } else if (scenario === 'late-confirm') {
              await page.evaluate(() => probe.finish());
              await status.waitFor({ state: 'hidden' });
              assert.equal(await indent.inputValue(), '4');
              assert.equal(await indent.isEnabled(), true);
            } else if (scenario === 'late-new-choice') {
              // This draft waits behind the unresolved request; the old ACK must not overwrite it.
              await indent.selectOption('5');
              assert.equal(await indent.inputValue(), '5');
              await status.filter({ hasText: '正在确认保存结果' }).waitFor();
              assert.equal(
                await page.evaluate(
                  () =>
                    probe.calls.filter((c) => c.command === 'request_preference_markdown').length,
                ),
                1,
              );
              await page.evaluate(() => probe.finish());
              await page.waitForFunction(() => probe.pending?.change.indentSize === 5);
              assert.equal(await indent.inputValue(), '5');
              await page.evaluate(
                (first) =>
                  document
                    .querySelector('iframe')
                    .contentWindow.postMessage(
                      { ...first, kind: 'reply', payload: { id: first.payload.id, ok: true } },
                      '*',
                    ),
                first,
              );
              assert.equal(await indent.inputValue(), '5');
              assert.equal(await page.evaluate(() => probe.value.indentSize), 4);
              await page.evaluate(() => probe.finish());
              await status.waitFor({ state: 'hidden' });
              assert.equal(await indent.inputValue(), '5');
            } else {
              const originalFrame = page
                .frames()
                .find((frame) => frame.url().startsWith(new URL(runtimeUrl).origin));
              assert.ok(originalFrame);
              await originalFrame.evaluate(() => location.reload());
              await page.waitForFunction(
                (first) =>
                  probe.messages.some((m) => m.kind === 'ready' && m.instance !== first.instance),
                first,
              );
              await status.filter({ hasText: '正在确认之前的保存结果' }).waitFor();
              assert.equal(await original.locator('.nav-group-item').count(), 0);
              assert.equal(await page.evaluate(() => probe.value.indentSize), 2);
              await page.evaluate(() => probe.finish());
              await original.locator('.nav-group-item').nth(1).click();
              assert.equal(await indent.inputValue(), '4');
              await indent.selectOption('5');
              await page.waitForFunction(() => probe.pending?.change.indentSize === 5);
              const latest = await page.evaluate(() =>
                probe.messages
                  .filter((m) => m.kind === 'request' && m.payload.operation === 'put')
                  .at(-1),
              );
              assert.equal(latest.payload.id, first.payload.id); // True document reload restarts ID 1.
              assert.notEqual(latest.instance, first.instance);
              await page.evaluate(
                (first) =>
                  document
                    .querySelector('iframe')
                    .contentWindow.postMessage(
                      { ...first, kind: 'reply', payload: { id: first.payload.id, ok: true } },
                      '*',
                    ),
                first,
              );
              await page.clock.fastForward(1);
              assert.equal(await status.isVisible(), true);
              assert.match(await status.innerText(), /正在保存/);
              assert.equal(await page.evaluate(() => probe.value.indentSize), 4);
              assert.equal(await indent.inputValue(), '5');
              await page.evaluate(() => probe.finish());
              await status.waitFor({ state: 'hidden' });
              assert.equal(await indent.inputValue(), '5');
            }
          }
          assert.equal(
            await page.evaluate(() =>
              probe.calls.some((c) =>
                ['put_markdown_preferences', 'preferences_changed'].includes(c.command),
              ),
            ),
            false,
          );
          assert.equal(
            await page.evaluate(() => localStorage.getItem('marklyra-preferences-v1')),
            '{"sentinel":"preserved"}',
          );
          assert.deepEqual(errors, []);
          assert.deepEqual(outside, []);
          results.push({
            engine,
            scenario,
            value: await page.evaluate(() => probe.value),
            errors,
            outside,
          });
        } catch (error) {
          results.push({ engine, scenario, error: String(error), errors, outside });
          throw error;
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  failure = error;
} finally {
  await new Promise((done) => server.close(done));
}
const artifacts = resolve(
  process.env.MARKDOWN_PREFERENCES_ARTIFACTS ??
    'artifacts/markdown-v24/preferences-ui-soft-timeout',
);
await mkdir(artifacts, { recursive: true });
await writeFile(
  resolve(artifacts, 'browser-results.json'),
  `${JSON.stringify(results, null, 2)}\n`,
);
if (failure) throw failure;
console.log(
  `${results.length} cases passed: original controls, soft deadline/late receipt, queued selection, real iframe reload and instance-bound ACK`,
);
