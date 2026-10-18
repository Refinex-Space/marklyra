// Real PreferencesWindow, bridge and original UI; only Native commands are controlled substitutes.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, webkit } from '@playwright/test';
import { build } from 'vite';

const require = createRequire(resolve('apps/desktop/package.json'));
const entry = 'recovery-file-controls-entry';
const mainOutput = await build({
  configFile: false,
  logLevel: 'error',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: {
    alias: { '@marklyra/editor-runtime': resolve('packages/editor-runtime/src/index.ts') },
  },
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
    lib: { entry, name: 'FileControlsWindow', formats: ['iife'] },
  },
});
const childOutput = await build({
  configFile: false,
  logLevel: 'error',
  resolve: {
    alias: { '@marklyra/editor-runtime': resolve('packages/editor-runtime/src/index.ts') },
  },
  build: {
    write: false,
    minify: false,
    lib: {
      entry: resolve('apps/desktop/src/features/settings/runtime-preferences/child-host.ts'),
      name: 'FileControlsChild',
      formats: ['iife'],
    },
  },
});
const code = (output) =>
  (Array.isArray(output) ? output : [output])
    .flatMap((value) => value.output)
    .find((value) => value.type === 'chunk')?.code;
const parentCode = code(mainOutput),
  childCode = code(childOutput);
if (!parentCode || !childCode) throw new Error('Missing in-memory source bundle');
const runtimeUrl = process.env.FILE_PREFERENCES_RUNTIME_URL ?? 'http://127.0.0.1:4199/index.html';
const childUrl = new URL('./preferences/child-host.js', runtimeUrl).href;
function installMock(runtimeUrl) {
  if (window.top !== window) return;
  const scenario = new URL(location.href).searchParams.get('scenario');
  localStorage.setItem('marklyra-preferences-v1', '{"sentinel":"preserved"}');
  window.isTauri = true;
  window.probe = {
    calls: [],
    pending: null,
    hold: false,
    clearPending: null,
    value: {
      revision: 7,
      defaultExtension: 'md',
      saveFileOnSwitch: false,
      noRecentFiles: false,
      alwaysConfirmsChanges: scenario !== 'forced',
    },
    release() {
      this.pending?.();
      this.pending = null;
    },
    clear(result) {
      if (!this.clearPending) throw Error('No clear dialog');
      this.clearPending(result);
      this.clearPending = null;
    },
  };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'preferences' }, currentWebview: { label: 'preferences' } },
    async invoke(command, args = {}) {
      probe.calls.push({ command, args });
      if (command === 'editor_runtime_url') return runtimeUrl;
      if (command === 'host_platform') return 'macos';
      if (command === 'get_application_preferences')
        return { schemaVersion: 1, revision: 0, values: {} };
      if (command === 'get_export_preferences')
        return { schemaVersion: 1, revision: 0, html: {}, pdf: {}, image: {} };
      if (command === 'list_theme_catalog')
        return {
          folderPath: '/mock/themes',
          themes: ['marklyra-light', 'marklyra-dark'].map((id) => ({
            id,
            name: id,
            builtin: true,
          })),
        };
      if (command === 'get_file_preferences') return { ...probe.value };
      if (command === 'get_markdown_preferences')
        return { schemaVersion: 1, revision: 0, indentSize: 2, prettyIndent: false };
      if (command === 'get_startup_preferences')
        return { revision: 0, restoreWhenLaunch: 0, pinFolder: null };
      if (command === 'put_file_preference') {
        if (probe.hold)
          await new Promise((resolve) => {
            probe.pending = resolve;
          });
        if (args.expectedRevision !== probe.value.revision) throw Error('revision conflict');
        const key = {
          defaultExtension: 'defaultExtension',
          save_file_on_switch: 'saveFileOnSwitch',
          noRecentFiles: 'noRecentFiles',
        }[args.change.key];
        if (!key) throw Error('unexpected preference');
        probe.value = {
          ...probe.value,
          [key]: args.change.value,
          revision: probe.value.revision + 1,
        };
        return { ...probe.value };
      }
      if (command === 'ask_clear_recent_history')
        return new Promise((resolve) => {
          probe.clearPending = resolve;
        });
      if (command === 'preferences_changed' || command === 'close_preferences_window') return;
      throw Error(`Unexpected native command ${command}`);
    },
  };
}
const html =
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body,#app,.preferences-window{margin:0;width:720px;height:480px}</style></head><body><div id="app"></div><script src="/parent.js"></script></body></html>';
const server = createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': req.url === '/parent.js' ? 'text/javascript' : 'text/html',
  });
  res.end(req.url === '/parent.js' ? parentCode : html);
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
      for (const scenario of ['normal', 'conflict', 'forced']) {
        const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
        const errors = [],
          outside = [];
        try {
          page.setDefaultTimeout(15000);
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
          await page.goto(`http://127.0.0.1:4198/?scenario=${scenario}`);
          const frame = page.frameLocator('iframe');
          await frame.locator('.nav-group-item').first().click();
          const extension = frame.locator('select[data-marklyra-preference="defaultExtension"]');
          const save = frame.locator('[data-marklyra-preference="save_file_on_switch"]');
          const recent = frame.locator('[data-marklyra-preference="noRecentFiles"]');
          const status = frame.locator('#marklyra-preferences-status');
          assert.equal(await extension.inputValue(), '');
          assert.equal(await recent.isChecked(), true);
          assert.equal(
            await frame.locator('[data-marklyra-preference="restoreWhenLaunch"]').isDisabled(),
            false,
          );
          assert.equal(
            await frame.locator('[data-marklyra-preference="restoreWhenLaunch"]').inputValue(),
            '0',
          );
          if (scenario === 'normal') {
            await page.evaluate(() => {
              probe.hold = true;
            });
            await extension.selectOption('text');
            await page.waitForFunction(() => probe.pending !== null);
            assert.equal(await page.evaluate(() => probe.value.defaultExtension), 'md');
            assert.equal(
              await page.evaluate(
                () => probe.calls.filter((c) => c.command === 'preferences_changed').length,
              ),
              0,
            );
            await page.evaluate(() => {
              probe.hold = false;
              probe.release();
            });
            await status.waitFor({ state: 'hidden' });
            await extension.selectOption('custom');
            await status.waitFor({ state: 'hidden' });
            const custom = frame.locator('input[data-marklyra-preference="defaultExtension"]');
            await custom.fill('.Foo.Bar ');
            assert.equal(await page.evaluate(() => probe.value.defaultExtension), 'custom');
            await custom.press('Tab');
            await status.waitFor({ state: 'hidden' });
            assert.equal(await page.evaluate(() => probe.value.defaultExtension), 'foo.bar');
            await save.check();
            await status.waitFor({ state: 'hidden' });
            await recent.uncheck();
            await status.waitFor({ state: 'hidden' });
            assert.deepEqual(
              await page.evaluate(() => ({
                ext: probe.value.defaultExtension,
                save: probe.value.saveFileOnSwitch,
                noRecent: probe.value.noRecentFiles,
              })),
              { ext: 'foo.bar', save: true, noRecent: true },
            );
            const puts = await page.evaluate(() =>
              probe.calls.filter((c) => c.command === 'put_file_preference'),
            );
            assert.deepEqual(
              puts.map((c) => c.args.expectedRevision),
              [7, 8, 9, 10, 11],
            );
            const clear = frame.locator('[data-marklyra-file-action="clear-recent-history"]');
            await clear.dblclick();
            await page.waitForFunction(() => probe.clearPending !== null);
            assert.equal(await clear.getAttribute('aria-disabled'), 'true');
            await page.clock.fastForward(16000);
            assert.equal(
              await page.evaluate(
                () => probe.calls.filter((c) => c.command === 'ask_clear_recent_history').length,
              ),
              1,
            );
            await page.evaluate(() => probe.clear(false));
            await frame
              .locator('[data-marklyra-file-action="clear-recent-history"]:not([aria-disabled])')
              .waitFor();
            await clear.click();
            await page.waitForFunction(() => probe.clearPending !== null);
            await page.evaluate(() => probe.clear(true));
            await frame
              .locator('[data-marklyra-file-action="clear-recent-history"]:not([aria-disabled])')
              .waitFor();
          } else if (scenario === 'conflict') {
            await page.evaluate(() => {
              probe.value.revision++;
            });
            await recent.click();
            await status.filter({ hasText: 'revision conflict' }).waitFor();
            assert.equal(await recent.isChecked(), true);
            assert.equal(await recent.isDisabled(), true);
            assert.equal(await page.evaluate(() => probe.value.noRecentFiles), false);
            assert.equal(
              await page.evaluate(
                () => probe.calls.filter((c) => c.command === 'preferences_changed').length,
              ),
              0,
            );
          } else {
            assert.equal(await save.isChecked(), false);
            assert.equal(await save.isDisabled(), false);
            await save.check();
            await status.waitFor({ state: 'hidden' });
            assert.equal(await page.evaluate(() => probe.value.saveFileOnSwitch), true);
            await save.uncheck();
            await status.waitFor({ state: 'hidden' });
            assert.equal(await page.evaluate(() => probe.value.saveFileOnSwitch), false);
            await recent.uncheck();
            await status.waitFor({ state: 'hidden' });
            assert.equal(await page.evaluate(() => probe.value.noRecentFiles), true);
          }
          const childFrame = page
            .frames()
            .find((value) => value.url().startsWith(new URL(runtimeUrl).origin));
          assert.ok(childFrame);
          assert.equal(await childFrame.evaluate(() => '__TAURI_INTERNALS__' in window), false);
          assert.equal(
            await page.evaluate(() => localStorage.getItem('marklyra-preferences-v1')),
            '{"sentinel":"preserved"}',
          );
          assert.deepEqual(errors, []);
          assert.deepEqual(outside, []);
          results.push({
            engine,
            scenario,
            probe: await page.evaluate(() => ({ calls: probe.calls, value: probe.value })),
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
const directory = resolve(
  process.env.FILE_PREFERENCES_ARTIFACTS ?? 'artifacts/file-preferences-v22/ui',
);
await mkdir(directory, { recursive: true });
await writeFile(
  resolve(directory, 'browser-results.json'),
  `${JSON.stringify(results, null, 2)}\n`,
);
if (failure) throw failure;
console.log(
  `${results.length} cases passed: native CAS, original extension blur, reverse/forced controls, clear once/cancel`,
);
