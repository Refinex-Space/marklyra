// Isolated component checks against a mock Tauri IPC host. Start the desktop
// Vite server on port 1421 first. This does not test native dialogs or disk IO.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from '@playwright/test';

const baseURL = process.env.WORKSPACE_TEST_URL ?? 'http://127.0.0.1:1421';
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><div id="probe" style="width:240px;height:600px"></div><script type="module">
import React from '/@id/react';
import ReactDOM from '/@id/react-dom/client';
import {WorkspaceSidebar} from '/src/features/file-explorer/WorkspaceSidebar.tsx';
import '/src/style.css';
const root=ReactDOM.createRoot(document.getElementById('probe'));
function Harness(){const [disabled,setDisabled]=React.useState(false);window.setDisabled=setDisabled;
return React.createElement(WorkspaceSidebar,{filePreferences:{view:'tree',treeSort:0,articleSort:0,treeNoGroup:false,articleNoGroup:false},disabled,activePath:'/mock/资料/笔记.md',onCurrentDocument:(match)=>window.probe.current.push(match),onOpenDocument:(...args)=>window.probe.opened.push(args)});}
root.render(React.createElement(Harness));window.dispose=()=>root.unmount();
</script></html>`;

function installMock() {
  const pending = [];
  window.probe = {
    calls: [],
    opened: [],
    current: [],
    cancel: false,
    removeNested: false,
    failNested: false,
    deferSelection: false,
    resolveSelection: null,
    pending,
    resolve(query, preview) {
      const index = pending.findIndex((entry) => entry.query === query);
      assertPending(index);
      pending.splice(index, 1)[0].resolve({
        matches: [{ relativePath: '资料/笔记.md', line: 2, column: 5, matchLength: 3, preview }],
        scannedFiles: 2,
        skipped: { nonUtf8: 1, tooLarge: 0, unreadable: 0, symlinks: 1, unsupportedNames: 0 },
        truncated: true,
      });
    },
  };
  function assertPending(index) {
    if (index < 0) throw new Error('Expected a pending search');
  }
  window.isTauri = true;
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    transformCallback() {
      return 1;
    },
    unregisterCallback() {},
    async invoke(command, args = {}) {
      window.probe.calls.push({ command, args });
      if (command === 'plugin:event|listen') return 1;
      if (command === 'plugin:event|unlisten') return null;
      if (command === 'select_workspace') {
        if (window.probe.cancel) throw new Error('已取消选择目录');
        const selected = { id: 'ws1', name: '工作区', path: '/mock' };
        if (window.probe.deferSelection) {
          return new Promise((resolve) => {
            window.probe.resolveSelection = () => resolve(selected);
          });
        }
        return selected;
      }
      if (command === 'get_workspace_file_undo') return null;
      if (command === 'snapshot_workspace') return null;
      if (command === 'close_workspace') return null;
      if (command === 'list_directory') {
        if (args.relativePath && window.probe.failNested) throw new Error('目录暂时不可读');
        return {
          entries:
            args.relativePath === ''
              ? [
                  { name: '资料', relativePath: '资料', kind: 'directory', size: null },
                  {
                    name: '<img src=x onerror=alert(1)>.md',
                    relativePath: '<img src=x onerror=alert(1)>.md',
                    kind: 'file',
                    size: 5,
                  },
                  { name: 'Alpha.md', relativePath: 'Alpha.md', kind: 'file', size: 18 },
                ]
              : window.probe.removeNested
                ? []
                : [{ name: '笔记.md', relativePath: '资料/笔记.md', kind: 'file', size: 10 }],
          truncated: false,
          skipped: 0,
        };
      }
      if (command === 'search_workspace') {
        return new Promise((resolve) => pending.push({ query: args.query, resolve }));
      }
      throw new Error(`Unexpected IPC command ${command}`);
    },
  };
}

async function mount(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(installMock);
  await page.route('**/__workspace-probe', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await page.goto(`${baseURL}/__workspace-probe`);
  await page.getByRole('button', { name: '选择文件夹', exact: true }).waitFor();
  return { page, errors };
}

async function checkInteractions(browser) {
  const { page, errors } = await mount(browser);
  try {
    await page.evaluate(() => {
      window.probe.cancel = true;
    });
    await page.getByRole('button', { name: '选择文件夹', exact: true }).click();
    await page.getByRole('button', { name: '选择文件夹', exact: true }).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.evaluate(() => {
      window.probe.cancel = false;
    });
    await page.getByRole('button', { name: '选择文件夹', exact: true }).click();
    const folder = page.getByRole('button', { name: '资料', exact: true });
    await folder.waitFor();
    assert.equal(await page.getByRole('button', { name: '笔记.md', exact: true }).count(), 0);
    assert.equal(await page.locator('img').count(), 0);
    await folder.focus();
    await page.keyboard.press('ArrowRight');
    const file = page.getByRole('button', { name: '笔记.md', exact: true });
    await file.waitFor();
    await file.click();
    assert.equal(await page.evaluate(() => window.probe.current.length), 1);
    assert.equal(await page.evaluate(() => window.probe.current[0]), undefined);
    assert.equal(await page.evaluate(() => window.probe.opened.length), 0);
    assert.equal(await file.getAttribute('aria-current'), 'page');
    await page.getByRole('tab', { name: '全文搜索', exact: true }).click();
    await page.getByRole('searchbox').fill('old');
    await page.waitForFunction(() => window.probe.pending.some((entry) => entry.query === 'old'));
    await page.getByRole('searchbox').fill('new');
    await page.waitForFunction(() => window.probe.pending.some((entry) => entry.query === 'new'));
    await page.evaluate(() => window.probe.resolve('new', '新结果 <img src=x>'));
    await page.getByText('新结果 <img src=x>', { exact: true }).waitFor();
    await page.evaluate(() => window.probe.resolve('old', '旧结果不得覆盖'));
    // Allow any incorrectly accepted stale result to reach a React paint.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.equal(await page.getByText('旧结果不得覆盖', { exact: true }).count(), 0);
    assert.equal(await page.locator('img').count(), 0);
    assert.match(await page.locator('.workspace-search').innerText(), /结果不完整/);
    assert.match(await page.locator('.workspace-search').innerText(), /不支持的编码文件/);
    await page.locator('.workspace-results button').click();
    assert.deepEqual(await page.evaluate(() => window.probe.current.at(-1)), {
      line: 2,
      column: 5,
      matchLength: 3,
    });
    assert.equal(await page.evaluate(() => window.probe.opened.length), 0);
    await page.getByRole('checkbox', { name: '区分大小写' }).uncheck();
    await page.waitForFunction(() =>
      window.probe.calls.some(
        (call) => call.command === 'search_workspace' && call.args.caseSensitive === false,
      ),
    );
    await page.evaluate(() => window.probe.resolve('new', '不区分大小写结果'));
    await page.getByText('不区分大小写结果', { exact: true }).waitFor();
    await page.evaluate(() => window.setDisabled(true));
    await page.waitForFunction(
      () => document.querySelector('.workspace-results button')?.disabled === true,
    );
    await page.evaluate(() => window.dispose());
    await page.waitForFunction(() =>
      window.probe.calls.some(
        (call) => call.command === 'close_workspace' && call.args.workspaceId === 'ws1',
      ),
    );
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

async function checkLatePickerResult(browser) {
  const { page, errors } = await mount(browser);
  try {
    await page.evaluate(() => {
      window.probe.deferSelection = true;
    });
    await page.getByRole('button', { name: '选择文件夹', exact: true }).click();
    await page.waitForFunction(() => window.probe.resolveSelection !== null);
    await page.evaluate(() => {
      window.dispose();
      window.probe.resolveSelection();
    });
    await page.waitForFunction(() =>
      window.probe.calls.some(
        (call) => call.command === 'close_workspace' && call.args.workspaceId === 'ws1',
      ),
    );
    assert.equal(await page.locator('#probe').textContent(), '');
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

async function checkTreeKeyboardAndLayout(browser, name) {
  const { page, errors } = await mount(browser);
  try {
    await page.getByRole('button', { name: '选择文件夹', exact: true }).click();
    const folder = page.getByRole('button', { name: '资料', exact: true });
    await folder.waitFor();
    await folder.focus();
    await page.keyboard.press('ArrowRight');
    const file = page.getByRole('button', { name: '笔记.md', exact: true });
    await file.waitFor();
    await page.keyboard.press('ArrowRight');
    assert.equal(await file.evaluate((element) => document.activeElement === element), true);
    assert.equal(await page.locator('[data-workspace-row][tabindex="0"]').count(), 1);
    assert.equal(await file.getAttribute('tabindex'), '0');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await folder.evaluate((element) => document.activeElement === element), true);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await folder.getAttribute('aria-expanded'), 'false');
    assert.equal(await file.count(), 0);
    await page.keyboard.press('a');
    assert.equal(
      await page
        .getByRole('button', { name: 'Alpha.md', exact: true })
        .evaluate((element) => document.activeElement === element),
      true,
    );
    await page.keyboard.press('Home');
    assert.equal(await folder.evaluate((element) => document.activeElement === element), true);
    await page.keyboard.press('ArrowRight');
    await file.waitFor();
    await page.keyboard.press('ArrowRight');
    await page.evaluate(() => {
      window.probe.removeNested = true;
    });
    await page.getByRole('button', { name: '刷新目录', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-name="笔记.md"]'));
    assert.equal(await folder.getAttribute('tabindex'), '0');
    await page.evaluate(() => {
      window.probe.removeNested = false;
    });
    await page.getByRole('button', { name: '刷新目录', exact: true }).click();
    await file.waitFor();
    await file.focus();
    await page.evaluate(() => {
      window.probe.failNested = true;
    });
    await page.getByRole('button', { name: '刷新目录', exact: true }).click();
    await page.getByRole('alert').getByText('Error: 目录暂时不可读', { exact: true }).waitFor();
    assert.equal(await folder.getAttribute('tabindex'), '0');
    await page.evaluate(() => {
      window.probe.failNested = false;
    });
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await file.waitFor();
    assert.equal(await file.getAttribute('aria-current'), 'page');
    assert.equal(await page.locator('.workspace-folder-header [role="tablist"]').count(), 1);
    assert.equal(await page.locator('.workspace-tree-row > .workspace-glyph').count(), 4);
    await page.locator('#probe').evaluate((element) => {
      element.style.width = '180px';
    });
    assert.equal(
      await page
        .locator('.workspace-folder-header')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
      true,
    );
    if (process.env.WORKSPACE_SCREENSHOTS) {
      await mkdir(process.env.WORKSPACE_SCREENSHOTS, { recursive: true });
      await page
        .locator('#probe')
        .screenshot({ path: `${process.env.WORKSPACE_SCREENSHOTS}/${name}-sidebar-180.png` });
    }
    await page.locator('#probe').evaluate((element) => {
      element.style.width = '240px';
    });
    if (process.env.WORKSPACE_SCREENSHOTS) {
      await page
        .locator('#probe')
        .screenshot({ path: `${process.env.WORKSPACE_SCREENSHOTS}/${name}-sidebar-light.png` });
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
      });
      await page
        .locator('#probe')
        .screenshot({ path: `${process.env.WORKSPACE_SCREENSHOTS}/${name}-sidebar-dark.png` });
    }
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

const results = [];
for (const [name, browserType] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await browserType.launch();
  try {
    await checkInteractions(browser);
    await checkLatePickerResult(browser);
    await checkTreeKeyboardAndLayout(browser, name);
    results.push({
      browser: name,
      scenarios: [
        'directory/search/keyboard/escaping/stale responses',
        'late picker disposal',
        'roving focus/typeahead/refresh/narrow header/icons',
      ],
      passed: true,
    });
  } finally {
    await browser.close();
  }
}
console.log(JSON.stringify(results, null, 2));
