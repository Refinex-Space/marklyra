// Current PreferencesWindow + prepared child; native requests are controlled mocks.
// Run after a single immutable runtime preparation; never starts or rewrites shared servers.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, webkit } from '@playwright/test';

const base = process.env.PREFERENCES_TEST_URL ?? 'http://127.0.0.1:4184';
const runtimeUrl = process.env.PREFERENCES_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html';
const output = process.env.PREFERENCES_TEST_OUTPUT ?? 'artifacts/theme-v19/preferences-review.json';
const snapshot = process.env.PREFERENCES_SNAPSHOT ?? 'private/runtime-snapshots/theme-v19-final-1';
const manifest = JSON.parse(
  await readFile(`${snapshot}/preferences/preferences-manifest.json`, 'utf8'),
);

const childResponse = await fetch(new URL('./preferences/child-host.js', runtimeUrl));
assert.equal(childResponse.ok, true, 'Prepared preferences child must be reachable');
assert.equal(
  createHash('sha256')
    .update(new Uint8Array(await childResponse.arrayBuffer()))
    .digest('hex'),
  manifest.adapterSha256,
  'Served child must match the immutable snapshot',
);

function installMock(runtimeUrl) {
  localStorage.setItem('marklyra-theme', 'marklyra-light');
  localStorage.removeItem('marklyra-theme-choice-v1');
  window.isTauri = true;
  window.probe = {
    calls: [],
    pending: null,
    complete(error) {
      const request = this.pending;
      if (!request) throw Error('No pending theme confirmation');
      this.pending = null;
      if (error) request.reject(Error(error));
      else {
        // Represents editor persistence + native acceptance, never a Prefs-side write.
        localStorage.setItem(
          'marklyra-theme-choice-v1',
          JSON.stringify({ theme: request.themeId, revision: 'mock-confirmed' }),
        );
        localStorage.setItem('marklyra-theme', request.themeId);
        request.resolve();
      }
    },
  };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'preferences' }, currentWebview: { label: 'preferences' } },
    async invoke(command, args = {}) {
      window.probe.calls.push({ command, args });
      if (command === 'editor_runtime_url') return runtimeUrl;
      if (command === 'host_platform') return 'macos';
      if (command === 'get_file_preferences')
        return {
          revision: 0,
          defaultExtension: 'md',
          saveFileOnSwitch: false,
          noRecentFiles: false,
          alwaysConfirmsChanges: true,
        };
      if (command === 'get_markdown_preferences')
        return { schemaVersion: 1, revision: 0, indentSize: 2, prettyIndent: false };
      if (command === 'get_startup_preferences')
        return { revision: 0, restoreWhenLaunch: 0, pinFolder: null };
      if (command === 'list_theme_catalog')
        return {
          folderPath: '/mock/themes',
          themes: ['marklyra-light', 'marklyra-dark', 'dark', 'ocean'].map((id) => ({
            id,
            name: id,
            builtin: !['dark', 'ocean'].includes(id),
          })),
        };
      if (command === 'request_preference_theme')
        return new Promise((resolve, reject) => {
          window.probe.pending = { resolve, reject, themeId: args.themeId };
        });
      if (
        [
          'preferences_changed',
          'close_preferences_window',
          'open_theme_folder',
          'open_theme_gallery',
          'sync_theme_menu',
        ].includes(command)
      )
        return;
      throw Error(`Unexpected native command ${command}`);
    },
  };
}

const results = [];
for (const [engine, type] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await type.launch();
  try {
    for (const outcome of ['success', 'failure', 'custom']) {
      const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
      page.setDefaultTimeout(15000);
      const errors = [],
        popups = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('popup', (popup) => {
        popups.push(popup.url());
        void popup.close();
      });
      try {
        await page.clock.install();
        await page.addInitScript(installMock, runtimeUrl);
        await page.goto(`${base}/?view=preferences`);
        const original = page.frameLocator('.runtime-preferences-frame');
        await original.locator('.nav-group-item').last().waitFor();
        assert.equal(await original.locator('.nav-group-item').count(), 7);
        await original.locator('.nav-group-item').nth(5).click();
        const select = original.locator('[data-marklyra-preference="theme"]');
        await select.waitFor();
        assert.ok(
          (
            await select.locator('option').evaluateAll((nodes) => nodes.map((node) => node.value))
          ).includes('dark.css'),
        );
        const selected = outcome === 'custom' ? 'dark.css' : 'marklyra-dark.css';
        await select.selectOption(selected);
        await page.waitForFunction(() => window.probe.pending !== null);
        assert.equal(
          await page.evaluate(() => window.probe.pending.themeId),
          selected.slice(0, -4),
        );
        assert.equal(
          await page.evaluate(() => localStorage.getItem('marklyra-theme')),
          'marklyra-light',
        );
        assert.equal(
          await page.evaluate(() => localStorage.getItem('marklyra-theme-choice-v1')),
          null,
        );
        const status = original.locator('#marklyra-preferences-status');
        await status.filter({ hasText: '正在保存' }).waitFor();
        // The former 15s child timeout must not reject a still-pending 30s native transaction.
        // This advances the actual child clock, not a real system IME or a native deadline.
        await page.clock.fastForward(16000);
        assert.match(await status.textContent(), /正在保存/);
        assert.equal(
          await page.evaluate(() => localStorage.getItem('marklyra-theme')),
          'marklyra-light',
        );
        assert.equal(
          await page.evaluate(
            () =>
              window.probe.calls.filter((call) => call.command === 'preferences_changed').length,
          ),
          0,
        );
        await page.evaluate(
          (error) => window.probe.complete(error),
          outcome === 'failure' ? '编辑器主题加载失败' : null,
        );
        if (outcome === 'failure') {
          await status.filter({ hasText: '未保存' }).waitFor();
          assert.equal(await select.inputValue(), 'marklyra-light.css');
          assert.equal(
            await page.evaluate(() => localStorage.getItem('marklyra-theme')),
            'marklyra-light',
          );
          assert.equal(
            await page.evaluate(() => localStorage.getItem('marklyra-theme-choice-v1')),
            null,
          );
        } else {
          await status.waitFor({ state: 'hidden' });
          assert.equal(await select.inputValue(), selected);
          assert.equal(
            await page.evaluate(() => localStorage.getItem('marklyra-theme')),
            selected.slice(0, -4),
          );
          for (const [action, command] of [
            ['open-theme-folder', 'open_theme_folder'],
            ['theme-gallery', 'open_theme_gallery'],
          ]) {
            const button = original.locator(`[data-marklyra-theme-action="${action}"]`);
            await button.waitFor();
            assert.notEqual(await button.getAttribute('aria-disabled'), 'true');
            await button.click();
            await page.waitForFunction(
              (command) => window.probe.calls.some((call) => call.command === command),
              command,
            );
            const calls = await page.evaluate(
              (command) => window.probe.calls.filter((call) => call.command === command),
              command,
            );
            assert.equal(calls.length, 1);
            assert.deepEqual(calls[0].args, {});
          }
          assert.equal(await status.isVisible(), false);
        }
        assert.equal(
          await page.evaluate(
            () =>
              window.probe.calls.filter((call) => call.command === 'preferences_changed').length,
          ),
          0,
        );
        assert.deepEqual(popups, []);
        assert.deepEqual(errors, []);
        results.push({
          engine,
          outcome,
          selected,
          waitedPastOldTimeout: true,
          themeAfter: await select.inputValue(),
          storedAfter: await page.evaluate(() => localStorage.getItem('marklyra-theme')),
          calls: await page.evaluate(() => window.probe.calls),
          errors,
          popups,
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
await mkdir(output.slice(0, output.lastIndexOf('/')), { recursive: true });
await writeFile(
  output,
  JSON.stringify(
    {
      scope:
        'current real parent + V19 immutable original child; native/editor completion mocked, no actual browser or folder opened',
      snapshot,
      adapterSha256: manifest.adapterSha256,
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify(
    results.map(({ engine, outcome, themeAfter }) => ({
      engine,
      outcome,
      themeAfter,
      passed: true,
    })),
    null,
    2,
  ),
);
