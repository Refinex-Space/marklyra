import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium, webkit } from '@playwright/test';
import { build } from 'vite';

const base = 'apps/desktop/src/features/settings/runtime-preferences/';
async function bundle(entry, name) {
  const output = await build({
    configFile: false,
    logLevel: 'error',
    resolve: {
      alias: {
        '@marklyra/editor-runtime': resolve('packages/editor-runtime/src/index.ts'),
      },
    },
    build: {
      write: false,
      minify: false,
      lib: { entry: resolve(base + entry), name, formats: ['iife'] },
    },
  });
  const code = (Array.isArray(output) ? output : [output])
    .flatMap((value) => value.output)
    .find((value) => value.type === 'chunk')?.code;
  if (!code) throw new Error(`Missing in-memory ${name}`);
  return code;
}
const host = await bundle('host.ts', 'CodePreferencesHost');
const child = await bundle('child-host.ts', 'CodePreferencesChild');
const runtimeUrl = process.env.CODE_RUNTIME_URL ?? 'http://127.0.0.1:4199/index.html';
const preferencesUrl = new URL('./preferences/setting.html', runtimeUrl).href;
const childUrl = new URL('./child-host.js', preferencesUrl).href;
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><div id="preferences" style="width:720px;height:480px"></div><script src="/host.js"></script><script>
window.state={puts:[],errors:[],hold:false,reject:false};
window.preferences=new CodePreferencesHost.RuntimePreferencesHost(document.getElementById('preferences'),{
runtimeUrl:${JSON.stringify(preferencesUrl)},platform:'macos',initialOptions:{locale:'zh-Hans'},
onPut:async(key,value)=>{if(state.hold)await new Promise(resolve=>state.release=resolve);if(state.reject)throw Error('test persistence rejected');state.puts.push({key,value});},
onClose:()=>{},onError:error=>state.errors.push(error.message)});</script></body></html>`;
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': req.url === '/host.js' ? 'text/javascript' : 'text/html' });
  res.end(req.url === '/host.js' ? host : html);
});
await new Promise((done) => server.listen(4198, '127.0.0.1', done));
const results = [];
const fields = [
  { key: 'show_line_numbers_for_fence', page: 3, label: 'Markdown', reverse: false },
  { key: 'no_line_wrapping', page: 3, label: 'Markdown', reverse: true },
  { key: 'lineWiseCopyCut', page: 1, label: '编辑器', reverse: false },
];
try {
  for (const [engine, launcher] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    const browser = await launcher.launch();
    try {
      for (const field of fields) {
        const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
        try {
          const errors = [],
            outside = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.route('**/*', (route) => {
            const url = route.request().url();
            if (url === childUrl)
              return route.fulfill({ contentType: 'text/javascript', body: child });
            if (
              [new URL(preferencesUrl).origin, 'http://127.0.0.1:4198'].includes(
                new URL(url).origin,
              )
            )
              return route.continue();
            outside.push(url);
            return route.abort();
          });
          await page.goto('http://127.0.0.1:4198/');
          const frame = page.frameLocator('iframe');
          await frame.locator('.nav-group-item').nth(field.page).click();
          const control = frame.locator(`[data-marklyra-preference="${field.key}"]`);
          assert.equal(await control.isEnabled(), true);
          assert.equal(await control.isChecked(), field.reverse);
          await page.evaluate(() => {
            state.hold = true;
          });
          await control.setChecked(!field.reverse);
          await frame
            .locator('#marklyra-preferences-status')
            .filter({ hasText: '正在保存' })
            .waitFor();
          await page.waitForFunction(() => typeof state.release === 'function');
          assert.deepEqual(await page.evaluate(() => state.puts), []);
          await page.evaluate(() => {
            state.hold = false;
            state.release();
          });
          await frame.locator('#marklyra-preferences-status').waitFor({ state: 'hidden' });
          assert.deepEqual(await page.evaluate(() => state.puts), [
            { key: field.key, value: true },
          ]);
          assert.equal(await control.isChecked(), !field.reverse);
          await page.evaluate(() => {
            state.reject = true;
          });
          // setChecked waits for the rejected value and retries the correctly restored control.
          await control.click();
          await frame
            .locator('#marklyra-preferences-status')
            .filter({ hasText: '未保存' })
            .waitFor();
          assert.equal(await control.isChecked(), !field.reverse);
          assert.equal(await control.isDisabled(), true);
          assert.equal(
            (await frame.locator('.nav-group-item.active').innerText()).trim(),
            field.label,
          );
          const state = await page.evaluate(() => window.state);
          assert.deepEqual(state.puts, [{ key: field.key, value: true }]);
          assert.equal(state.errors.length, 1);
          assert.match(state.errors[0], /test persistence rejected/);
          assert.deepEqual(errors, []);
          assert.deepEqual(outside, []);
          results.push({
            engine,
            field,
            state,
            errors,
            outside,
            checked: await control.isChecked(),
          });
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((done) => server.close(done));
}
const directory = resolve(process.env.CODE_ARTIFACTS ?? 'artifacts/code-v21/preferences-ui');
await mkdir(directory, { recursive: true });
await writeFile(
  resolve(directory, 'browser-results.json'),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.log(
  `${results.length} cases passed: original checkboxes, reverse value, delayed ACK, failed save rollback`,
);
