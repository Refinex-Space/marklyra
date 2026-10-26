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
const host = await bundle('host.ts', 'IndentPreferencesHost');
const child = await bundle('child-host.ts', 'IndentPreferencesChild');
const runtimeUrl = process.env.INDENT_RUNTIME_URL ?? 'http://127.0.0.1:4199/index.html';
const preferencesUrl = new URL('./preferences/setting.html', runtimeUrl).href;
const childUrl = new URL('./child-host.js', preferencesUrl).href;
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><div id="preferences" style="width:720px;height:480px"></div><script src="/host.js"></script><script>
window.state={puts:[],errors:[],hold:false,reject:false};
window.preferences=new IndentPreferencesHost.RuntimePreferencesHost(document.getElementById('preferences'),{
runtimeUrl:${JSON.stringify(preferencesUrl)},platform:'macos',initialOptions:{locale:'zh-Hans'},
onPut:async(key,value)=>{if(state.hold)await new Promise(resolve=>state.release=resolve);if(state.reject)throw Error('test persistence rejected');state.puts.push({key,value});},
onClose:()=>{},onError:error=>state.errors.push(error.message)});</script></body></html>`;
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': req.url === '/host.js' ? 'text/javascript' : 'text/html' });
  res.end(req.url === '/host.js' ? host : html);
});
await new Promise((done) => server.listen(4198, '127.0.0.1', done));
const results = [];
try {
  for (const [engine, launcher] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    const browser = await launcher.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      // Load the new adapter over an existing immutable UI, without rewriting its files.
      await page.route(childUrl, (route) =>
        route.fulfill({ contentType: 'text/javascript', body: child }),
      );
      await page.goto('http://127.0.0.1:4198/');
      const frame = page.frameLocator('iframe');
      await frame.locator('.nav-group-item').nth(3).click();
      const width = frame.locator('[data-marklyra-preference="codeIndentSize"]');
      const shift = frame.locator('[data-marklyra-preference="shiftTabAutoIndent"]');
      assert.equal(await width.isEnabled(), true);
      assert.equal(await width.inputValue(), '4');
      assert.equal(await shift.isEnabled(), true);
      assert.equal(await shift.isChecked(), false);
      await page.evaluate(() => {
        state.hold = true;
      });
      await width.selectOption('2');
      await frame.locator('#marklyra-preferences-status').filter({ hasText: '正在保存' }).waitFor();
      assert.deepEqual(await page.evaluate(() => state.puts), []);
      await page.waitForFunction(() => typeof state.release === 'function');
      await page.evaluate(() => {
        state.hold = false;
        state.release();
      });
      await frame.locator('#marklyra-preferences-status').waitFor({ state: 'hidden' });
      await shift.check();
      await frame.locator('#marklyra-preferences-status').waitFor({ state: 'hidden' });
      assert.deepEqual(await page.evaluate(() => state.puts), [
        { key: 'codeIndentSize', value: 2 },
        { key: 'shiftTabAutoIndent', value: true },
      ]);
      await page.evaluate(() => {
        state.reject = true;
      });
      await width.selectOption('5');
      await frame.locator('#marklyra-preferences-status').filter({ hasText: '未保存' }).waitFor();
      assert.equal(await width.inputValue(), '2');
      assert.equal(await width.isDisabled(), true);
      assert.equal(await shift.isChecked(), true);
      assert.equal((await frame.locator('.nav-group-item.active').innerText()).trim(), 'Markdown');
      const state = await page.evaluate(() => window.state);
      assert.deepEqual(state.puts, [
        { key: 'codeIndentSize', value: 2 },
        { key: 'shiftTabAutoIndent', value: true },
      ]);
      assert.equal(state.errors.length, 1);
      assert.match(state.errors[0], /test persistence rejected/);
      assert.deepEqual(errors, []);
      results.push({
        engine,
        state,
        errors,
        width: await width.inputValue(),
        shift: await shift.isChecked(),
      });
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((done) => server.close(done));
}
const directory = resolve(process.env.INDENT_ARTIFACTS ?? 'artifacts/indent-v20/preferences-ui');
await mkdir(directory, { recursive: true });
await writeFile(
  resolve(directory, 'browser-results.json'),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.log(
  `${results.length} engines passed: original controls, typed ACK delay, failed save rollback`,
);
