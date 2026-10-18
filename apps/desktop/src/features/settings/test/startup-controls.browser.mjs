// Real PreferencesWindow, bridge and original UI; only Native commands are controlled substitutes.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, webkit } from '@playwright/test';
import { build } from 'vite';

const require = createRequire(resolve('apps/desktop/package.json'));
const entry = 'recovery-startup-controls-entry';
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
const runtimeUrl =
  process.env.STARTUP_PREFERENCES_RUNTIME_URL ?? 'http://127.0.0.1:4199/index.html';
const childUrl = new URL('./preferences/child-host.js', runtimeUrl).href;
function installMock(runtimeUrl) {
  if (window.top !== window) {
    window.addEventListener('message', (event) => {
      if (event.data?.kind === 'initialize') window.testPreferencesInstance = event.data.instance;
    });
    return;
  }
  const scenario = new URL(location.href).searchParams.get('scenario');
  localStorage.setItem('marklyra-preferences-v1', '{"sentinel":"preserved"}');
  window.isTauri = true;
  window.probe = {
    calls: [],
    pending: null,
    value: {
      revision: 10,
      restoreWhenLaunch: scenario === 'folder-error' ? 3 : scenario === 'mode-error' ? 1 : 0,
      pinFolder: scenario === 'cancel' ? null : '/native/已有目录',
    },
    complete(folder, error) {
      const pending = this.pending;
      if (!pending) throw Error('Missing native picker');
      this.pending = null;
      if (error) {
        pending.reject(Error(error));
        return;
      }
      if (folder === null) {
        pending.resolve(null);
        return;
      }
      if (pending.expectedRevision !== this.value.revision) {
        pending.reject(Error('revision conflict'));
        return;
      }
      this.value = { revision: this.value.revision + 1, restoreWhenLaunch: 3, pinFolder: folder };
      pending.resolve({ ...this.value });
    },
  };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'preferences' }, currentWebview: { label: 'preferences' } },
    async invoke(command, args = {}) {
      probe.calls.push({ command, args });
      if (command === 'editor_runtime_url') return runtimeUrl;
      if (command === 'host_platform') return 'macos';
      if (command === 'list_theme_catalog')
        return {
          folderPath: '/mock/themes',
          themes: ['github', 'night'].map((id) => ({ id, name: id, builtin: true })),
        };
      if (command === 'get_file_preferences')
        return {
          revision: 4,
          defaultExtension: 'md',
          saveFileOnSwitch: false,
          noRecentFiles: false,
          alwaysConfirmsChanges: true,
        };
      if (command === 'get_markdown_preferences')
        return { schemaVersion: 1, revision: 0, indentSize: 2, prettyIndent: false };
      if (command === 'get_startup_preferences') return { ...probe.value };
      if (command === 'set_startup_mode' || command === 'choose_startup_folder') {
        if (args.expectedRevision !== probe.value.revision) throw Error('revision conflict');
        if (
          command === 'choose_startup_folder' ||
          (args.mode === 3 && !probe.value.pinFolder) ||
          scenario === 'mode-error'
        )
          return new Promise((resolve, reject) => {
            probe.pending = { resolve, reject, expectedRevision: args.expectedRevision };
          });
        probe.value = {
          ...probe.value,
          revision: probe.value.revision + 1,
          restoreWhenLaunch: args.mode,
        };
        return { ...probe.value };
      }
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
      for (const scenario of ['cancel', 'existing', 'mode-error', 'folder-error']) {
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
          const mode = frame.locator('select[data-marklyra-preference="restoreWhenLaunch"]');
          const status = frame.locator('#marklyra-preferences-status');
          const choose = frame.locator('[data-marklyra-startup-action="choose-folder"]');
          assert.equal(await mode.isEnabled(), true);
          assert.deepEqual(
            await mode
              .locator('option')
              .evaluateAll((options) => options.map((option) => option.value)),
            ['0', '1', '2', '3'],
          );
          const original = await page.evaluate(() => ({ ...probe.value }));
          if (scenario === 'cancel') {
            await mode.selectOption('3');
            await page.waitForFunction(() => probe.pending !== null);
            assert.equal(await mode.isDisabled(), true);
            await page.clock.fastForward(16000);
            assert.deepEqual(await page.evaluate(() => probe.value), original);
            assert.equal(
              await page.evaluate(
                () => probe.calls.filter((call) => call.command === 'preferences_changed').length,
              ),
              0,
            );
            await page.evaluate(() => probe.complete(null));
            await status.waitFor({ state: 'hidden' });
            assert.equal(await mode.inputValue(), '0');
            assert.equal(await mode.isEnabled(), true);
            assert.equal(await choose.count(), 0);
            await mode.selectOption('3');
            await page.waitForFunction(() => probe.pending !== null);
            await page.evaluate(() => probe.complete('/native/已选择目录'));
            await status.waitFor({ state: 'hidden' });
            assert.equal(await mode.inputValue(), '3');
            assert.match(
              await frame.locator('.dir-path[aria-readonly="true"]').innerText(),
              /已选择目录/,
            );
            for (const value of ['0', '1', '2', '3']) {
              await mode.selectOption(value);
              await status.waitFor({ state: 'hidden' });
              assert.equal(await mode.inputValue(), value);
            }
          } else if (scenario === 'existing') {
            await mode.selectOption('3');
            await status.waitFor({ state: 'hidden' });
            assert.equal(await page.evaluate(() => probe.pending), null);
            assert.equal(await page.evaluate(() => probe.value.pinFolder), '/native/已有目录');
            const readonly = frame.locator('.dir-path[aria-readonly="true"]');
            assert.equal(await readonly.getAttribute('aria-readonly'), 'true');
            assert.equal(await readonly.getAttribute('contenteditable'), null);
            const calls = await page.evaluate(() => probe.calls.length);
            const pathBox = await readonly.boundingBox();
            assert.ok(pathBox);
            await page.mouse.click(pathBox.x + pathBox.width / 2, pathBox.y + pathBox.height / 2);
            assert.equal(await page.evaluate(() => probe.calls.length), calls);
            await choose.click();
            await page.waitForFunction(() => probe.pending !== null);
            await page.evaluate(() => probe.complete(null));
            await status.waitFor({ state: 'hidden' });
            assert.equal(await mode.inputValue(), '3');
            assert.match(await readonly.innerText(), /已有目录/);
            await choose.click();
            await page.waitForFunction(() => probe.pending !== null);
            await page.evaluate(() => probe.complete('/native/新目录'));
            await status.waitFor({ state: 'hidden' });
            assert.match(await readonly.innerText(), /新目录/);
          } else {
            if (scenario === 'mode-error') await mode.selectOption('2');
            else await choose.click();
            await page.waitForFunction(() => probe.pending !== null);
            await page.evaluate(() => probe.complete(null, 'revision conflict'));
            await status.filter({ hasText: 'revision conflict' }).waitFor();
            assert.equal(await mode.inputValue(), String(original.restoreWhenLaunch));
            assert.equal(await mode.isDisabled(), true);
            assert.deepEqual(await page.evaluate(() => probe.value), original);
            assert.equal(
              await page.evaluate(
                () => probe.calls.filter((call) => call.command === 'preferences_changed').length,
              ),
              0,
            );
          }
          assert.equal((await frame.locator('.nav-group-item.active').innerText()).trim(), '文件');
          const calls = await page.evaluate(() => probe.calls);
          assert.equal(calls.filter((call) => call.command === 'put_file_preference').length, 0);
          for (const call of calls.filter((call) =>
            ['set_startup_mode', 'choose_startup_folder'].includes(call.command),
          )) {
            assert.equal('pinFolder' in call.args, false);
            assert.equal('path' in call.args, false);
            assert.equal(typeof call.args.expectedRevision, 'number');
          }
          const childFrame = page
            .frames()
            .find((value) => value.url().startsWith(new URL(runtimeUrl).origin));
          assert.ok(childFrame);
          assert.equal(await childFrame.evaluate(() => '__TAURI_INTERNALS__' in window), false);
          const beforeForged = await page.evaluate(() => probe.calls.length);
          await childFrame.evaluate(() => {
            window.startupRejected = false;
            addEventListener('message', (event) => {
              if (event.data?.kind === 'reply' && event.data.payload?.id === 999)
                window.startupRejected = event.data.payload.ok === false;
            });
            parent.postMessage(
              {
                protocol: 'marklyra/preferences/v1',
                channel: new URL(location.href).searchParams.get('channel'),
                instance: window.testPreferencesInstance,
                kind: 'request',
                payload: {
                  id: 999,
                  operation: 'startup-action',
                  action: { kind: 'choose-folder', path: '/forged' },
                },
              },
              '*',
            );
          });
          await childFrame.waitForFunction(() => window.startupRejected);
          assert.equal(await page.evaluate(() => probe.calls.length), beforeForged);
          assert.equal(
            await page.evaluate(() => localStorage.getItem('marklyra-preferences-v1')),
            '{"sentinel":"preserved"}',
          );
          assert.deepEqual(errors, []);
          assert.deepEqual(outside, []);
          results.push({
            engine,
            scenario,
            calls,
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
const output = resolve(
  process.env.STARTUP_PREFERENCES_ARTIFACTS ?? 'artifacts/startup-v23/preferences-ui',
);
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'browser-results.json'), `${JSON.stringify(results, null, 2)}\n`);
if (failure) throw failure;
console.log(
  `${results.length} cases passed: startup modes, atomic picker ACK/cancel, readonly path, CAS rollback`,
);
