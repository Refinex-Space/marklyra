// sidebar geometry/search checks: actual browser DOM with mock file IPC only.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from '@playwright/test';

const baseURL = process.env.WORKSPACE_TEST_URL ?? 'http://127.0.0.1:1421';
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><div id="probe"></div><script type="module">
import React from '/@id/react';
import ReactDOM from '/@id/react-dom/client';
import {WorkspaceSidebar,SidebarHeader} from '/src/features/file-explorer/index.ts';
import '/src/style.css';
function Harness(){
 const [mode,setMode]=React.useState('files'),[width,setWidth]=React.useState(270),[theme,setTheme]=React.useState('github'),[active,setActive]=React.useState('/mock/资料/深层/笔记.md');
 Object.assign(window,{setMode,setWidth,setTheme,setActive});
 return React.createElement('div',{className:'shell','data-native-chrome':'true','data-theme-name':theme,style:{height:600,flexDirection:'row'}},
 React.createElement('aside',{className:'sidebar',style:{width,maxWidth:'none'}},
 React.createElement(SidebarHeader,{fileView:'tree',mode,change:setMode,searchTargetId:'probe-search-controls'}),
 React.createElement('div',{style:{flex:1,minHeight:0}},React.createElement(WorkspaceSidebar,{filePreferences:{view:'tree',treeSort:0,articleSort:0,treeNoGroup:false,articleNoGroup:false},compact:true,mode:mode==='search'?'search':'files',onModeChange:setMode,searchTargetId:'probe-search-controls',activePath:active,onCurrentDocument:(match)=>window.probe.current.push(match),onOpenDocument:(...args)=>window.probe.opened.push(args)}))));
}
ReactDOM.createRoot(document.getElementById('probe')).render(React.createElement(Harness));
</script></html>`;
function installMock() {
  const pending = [];
  window.probe = {
    calls: [],
    opened: [],
    current: [],
    pending,
    resolve(query, text) {
      const index = pending.findIndex((item) => item.query === query);
      if (index < 0) throw Error(`Missing search ${query}`);
      pending.splice(index, 1)[0].resolve({
        matches: [
          {
            relativePath: '资料/深层/笔记.md',
            line: 2,
            column: 3,
            matchLength: query.length,
            preview: text,
          },
        ],
        scannedFiles: 1,
        skipped: { nonUtf8: 0, tooLarge: 0, unreadable: 0, symlinks: 0, unsupportedNames: 0 },
        truncated: false,
      });
    },
  };
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
      if (command === 'select_workspace') return { id: 'ws1', name: '工作区', path: '/mock' };
      if (command === 'get_workspace_file_undo') return null;
      if (command === 'snapshot_workspace') return null;
      if (command === 'close_workspace') return null;
      if (command === 'list_directory_history')
        return { revision: 0, noRecentFiles: false, entries: [] };
      if (command === 'list_directory')
        return {
          entries:
            args.relativePath === '资料/深层'
              ? [{ name: '笔记.md', relativePath: '资料/深层/笔记.md', kind: 'file', size: 10 }]
              : args.relativePath === '资料'
                ? [{ name: '深层', relativePath: '资料/深层', kind: 'directory', size: null }]
                : [
                    { name: '资料', relativePath: '资料', kind: 'directory', size: null },
                    { name: 'Top.md', relativePath: 'Top.md', kind: 'file', size: 2 },
                  ],
          truncated: false,
          skipped: 0,
        };
      if (command === 'search_workspace')
        return new Promise((resolve) => pending.push({ query: args.query, resolve }));
      throw Error(`Unexpected ${command}`);
    },
  };
}
async function check(browser, name) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.addInitScript(installMock);
    await page.route('**/__sidebar-alignment-probe', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await page.goto(`${baseURL}/__sidebar-alignment-probe`);
    await page.locator('.sidebar').hover();
    await page.getByRole('button', { name: '目录菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: '打开文件夹…', exact: true }).click();
    await page.getByRole('button', { name: '资料', exact: true }).click();
    await page.getByRole('button', { name: '深层', exact: true }).click();
    const row = page.getByRole('button', { name: '笔记.md', exact: true });
    await row.waitFor();
    for (const width of [160, 270, 500]) {
      await page.evaluate((width) => window.setWidth(width), width);
      for (const theme of ['github', 'night']) {
        await page.evaluate((theme) => window.setTheme(theme), theme);
        const geometry = await row.evaluate((element) => {
          const row = element.getBoundingClientRect(),
            sidebar = element.closest('.sidebar').getBoundingClientRect(),
            before = getComputedStyle(element, '::before');
          return {
            left: row.left + parseFloat(before.left) - sidebar.left,
            right: row.right - parseFloat(before.right) - sidebar.right,
            bg: before.backgroundColor,
            shadow: before.boxShadow,
            height: row.height,
          };
        });
        assert.ok(Math.abs(geometry.left) < 0.6, JSON.stringify(geometry));
        assert.ok(Math.abs(geometry.right) < 0.6, JSON.stringify(geometry));
        assert.equal(geometry.bg, theme === 'night' ? 'rgb(34, 34, 34)' : 'rgb(238, 238, 238)');
        assert.match(geometry.shadow, /inset/);
        assert.match(geometry.shadow, /4px/);
        assert.equal(geometry.height, theme === 'night' ? 32 : 29);
      }
    }
    await page.evaluate(() => {
      window.setWidth(270);
      window.setTheme('github');
    });
    const beforeLists = await page.evaluate(
      () => window.probe.calls.filter((call) => call.command === 'list_directory').length,
    );
    await page.getByRole('button', { name: '全文搜索', exact: true }).click();
    const input = page.getByRole('searchbox', { name: '搜索文件', exact: true });
    await input.waitFor();
    await page.waitForFunction(
      () => document.activeElement === document.querySelector('#probe-search-controls input'),
    );
    assert.equal(await page.locator('.sidebar-current-title:visible').count(), 0);
    assert.equal(await page.locator('.workspace-search form').count(), 0);
    assert.equal(await page.getByRole('button', { name: '立即搜索', exact: true }).count(), 0);
    const header = await page.locator('.marklyra-sidebar-header').boundingBox(),
      inputBounds = await input.boundingBox();
    assert.equal(header.height, 40);
    assert.ok(
      inputBounds.y >= header.y && inputBounds.y + inputBounds.height <= header.y + header.height,
    );
    await input.fill('old');
    await page.waitForFunction(() => window.probe.pending.some((item) => item.query === 'old'));
    await input.fill('new');
    await input.press('Enter');
    await page.waitForFunction(() => window.probe.pending.some((item) => item.query === 'new'));
    await page.evaluate(() => window.probe.resolve('new', '新结果'));
    await page.getByText('新结果', { exact: true }).waitFor();
    await page.evaluate(() => window.probe.resolve('old', '旧结果不得覆盖'));
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.equal(await page.getByText('旧结果不得覆盖', { exact: true }).count(), 0);
    await page.getByRole('button', { name: '区分大小写', exact: true }).click();
    await page.waitForFunction(() =>
      window.probe.calls.some(
        (call) => call.command === 'search_workspace' && call.args.caseSensitive === true,
      ),
    );
    await page.evaluate(() => window.probe.resolve('new', '小写结果'));
    await page.getByText('小写结果', { exact: true }).waitFor();
    const inputNode = await input.elementHandle();
    await input.press('Escape');
    await page.getByRole('button', { name: '全文搜索', exact: true }).waitFor();
    assert.equal(await inputNode.evaluate((node) => node.isConnected), true);
    assert.equal(await row.count(), 1);
    assert.equal(
      await page.evaluate(
        () => window.probe.calls.filter((call) => call.command === 'list_directory').length,
      ),
      beforeLists,
    );
    await page.getByRole('button', { name: '全文搜索', exact: true }).click();
    assert.equal(await input.inputValue(), 'new');
    assert.equal(
      await inputNode.evaluate(
        (node) => node === document.querySelector('#probe-search-controls input'),
      ),
      true,
    );
    await page.waitForFunction(() => window.probe.pending.some((item) => item.query === 'new'));
    await page.evaluate(() => window.probe.resolve('new', '重开结果'));
    await page.getByText('重开结果', { exact: true }).waitFor();
    await page.locator('.workspace-results button').click();
    assert.deepEqual(await page.evaluate(() => window.probe.current.at(-1)), {
      line: 2,
      column: 3,
      matchLength: 3,
    });
    assert.equal(await page.evaluate(() => window.probe.opened.length), 0);
    await page.getByRole('button', { name: '返回文件', exact: true }).click();
    if (process.env.WORKSPACE_SCREENSHOTS) {
      await mkdir(process.env.WORKSPACE_SCREENSHOTS, { recursive: true });
      await page.locator('.sidebar').screenshot({
        path: `${process.env.WORKSPACE_SCREENSHOTS}/${name}-sidebar-selection.png`,
      });
      await page.getByRole('button', { name: '全文搜索', exact: true }).click();
      await page.locator('.sidebar').screenshot({
        path: `${process.env.WORKSPACE_SCREENSHOTS}/${name}-sidebar-search.png`,
      });
    }
    assert.deepEqual(errors, []);
    return {
      browser: name,
      passed: true,
      scenarios: [
        'full width nested selection at 160/270/500 pixels in github/night',
        'search header same 40px row with real input/case/Enter',
        'stale search, Escape, retained input/tree and match position',
      ],
    };
  } catch (error) {
    console.error(
      JSON.stringify({ browser: name, errors, body: await page.locator('#probe').innerText() }),
    );
    throw error;
  } finally {
    await page.close();
  }
}
const results = [];
for (const [name, type] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await type.launch();
  try {
    results.push(await check(browser, name));
  } finally {
    await browser.close();
  }
}
console.log(JSON.stringify(results, null, 2));
