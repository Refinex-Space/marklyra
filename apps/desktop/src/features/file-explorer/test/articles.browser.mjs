// Real React/DOM with mocked capability IPC. Does not replace native WK/WebView2 checks.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from '@playwright/test';

const baseURL = process.env.WORKSPACE_TEST_URL ?? 'http://127.0.0.1:1422';
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><div id="probe"></div><script type="module">
import React from '/@id/react';
import ReactDOM from '/@id/react-dom/client';
import {WorkspaceSidebar,SidebarHeader} from '/src/features/file-explorer/index.ts';
import {defaultFileSidebarPreferences} from '/src/features/file-explorer/file-preferences.ts';
import '/src/style.css';
function Harness(){const [mode,setMode]=React.useState('files'),[prefs,setPrefs]=React.useState({...defaultFileSidebarPreferences}),[choose,setChoose]=React.useState(0),[active,setActive]=React.useState('/mock/B/b2.md'),[mounted,setMounted]=React.useState(true),[theme,setTheme]=React.useState('github'),[source,setSource]=React.useState(undefined);
Object.assign(window,{setMode,setPrefs,setChoose,setActive,setMounted,setTheme,setSource});window.probe.preferences=prefs;
return React.createElement('div',{className:'shell','data-native-chrome':'true','data-theme-name':theme,style:{height:600,flexDirection:'row'}},React.createElement('aside',{className:'sidebar',style:{width:270,maxWidth:'none'}},React.createElement(SidebarHeader,{mode,change:setMode,fileView:prefs.view}),mounted&&React.createElement('div',{style:{flex:1,minHeight:0},hidden:mode==='outline'},React.createElement(WorkspaceSidebar,{compact:true,mode:mode==='search'?'search':'files',onModeChange:setMode,filePreferences:prefs,onFilePreferencesChange:setPrefs,chooseRequest:choose,activePath:active,activeSource:source,onOpenDocument:(...args)=>window.probe.opened.push(args)}))));}
ReactDOM.createRoot(document.getElementById('probe')).render(React.createElement(Harness));
</script></html>`;
function installMock() {
  window.probe = {
    calls: [],
    opened: [],
    pending: [],
    nextId: 1,
    cancel: false,
    fail: false,
    resolve(index, entries) {
      const request = this.pending.splice(index, 1)[0];
      if (!request) throw Error('Missing pending articles');
      request.resolve({
        entries,
        truncated: true,
        scannedFiles: 400,
        scannedEntries: 450,
        readBytes: 1200,
        skipped: {
          symlinks: 1,
          unsupportedNames: 0,
          unreadable: 0,
          unsupportedEncoding: 0,
          ignored: 2,
        },
        truncationReasons: ['documents'],
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
      const p = window.probe;
      p.calls.push({ command, args });
      if (command === 'plugin:event|listen') return 1;
      if (command === 'plugin:event|unlisten') return null;
      if (command === 'select_workspace') {
        if (p.cancel) {
          p.cancel = false;
          throw Error('已取消选择目录');
        }
        return { id: `ws${p.nextId++}`, name: '工作区', path: '/mock' };
      }
      if (command === 'get_workspace_file_undo') return null;
      if (command === 'snapshot_workspace') return null;
      if (command === 'close_workspace') return null;
      if (command === 'list_directory_history')
        return {
          revision: 0,
          noRecentFiles: false,
          entries: [
            {
              target: { kind: 'history', id: 'next' },
              name: 'Next',
              path: '/next',
              pinned: false,
              current: false,
              reopenable: true,
            },
          ],
        };
      if (command === 'open_directory_history') return { id: 'ws2', name: 'Next', path: '/next' };
      if (command === 'list_directory')
        return {
          entries:
            args.relativePath === 'B'
              ? [{ name: 'b2.md', relativePath: 'B/b2.md', kind: 'file', size: 0 }]
              : args.relativePath
                ? [{ name: 'note.md', relativePath: 'Folder/note.md', kind: 'file', size: 0 }]
                : [
                    { name: 'Folder', relativePath: 'Folder', kind: 'directory', size: null },
                    { name: 'B', relativePath: 'B', kind: 'directory', size: null },
                    { name: 'a10.md', relativePath: 'a10.md', kind: 'file', size: 0 },
                    { name: 'a2.md', relativePath: 'a2.md', kind: 'file', size: 0 },
                  ],
          truncated: false,
          skipped: 0,
        };
      if (command === 'list_workspace_documents') {
        if (p.fail) {
          p.fail = false;
          throw Error('暂时无法读取摘要');
        }
        return new Promise((resolve) => p.pending.push({ id: args.workspaceId, resolve }));
      }
      if (command === 'search_workspace')
        return {
          matches: [],
          truncated: false,
          scannedFiles: 0,
          skipped: { nonUtf8: 0, tooLarge: 0, unreadable: 0, symlinks: 0, unsupportedNames: 0 },
        };
      throw Error(`Unexpected ${command}`);
    },
  };
}
const doc = (name, folder, summary = 'body') => ({
  name,
  relativePath: folder ? `${folder}/${name}` : name,
  folderName: folder || '工作区',
  folderRelativePath: folder,
  size: 100,
  modifiedAt: 0,
  createdAt: 0,
  summary,
  summaryTruncated: true,
});
const entries = [
  doc('b10.md', 'B'),
  doc('a2.md', 'A'),
  doc(
    'b2.md',
    'B',
    '---\ntitle: 中文标题😀\nsubtitle: 副标题\n---\n<script>window.pwned=true</script> ![alt](x)',
  ),
  doc('b02.md', 'B'),
  doc('plain.txt', '', '<img src=x onerror="window.pwned=true">'),
];
async function check(browser, name) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 } }),
    errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.addInitScript(installMock);
    await page.route('**/__articles-probe', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await page.goto(`${baseURL}/__articles-probe`);
    await page.locator('.sidebar').hover();
    assert.equal(await page.locator('.sidebar-current-title').textContent(), '文档');
    await page.getByRole('button', { name: '目录菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: '打开文件夹…', exact: true }).click();
    await page.waitForFunction(() => window.probe.pending.length === 1);
    // Hiding an in-flight Articles request invalidates its reply; no cached false success.
    await page.getByRole('button', { name: '切换到文件树', exact: true }).click();
    await page.getByRole('button', { name: 'Folder', exact: true }).click();
    await page.getByRole('button', { name: 'note.md', exact: true }).waitFor();
    const note = await page.getByRole('button', { name: 'note.md', exact: true }).elementHandle();
    await page.evaluate((entries) => window.probe.resolve(0, entries), [doc('late.md', '')]);
    assert.equal(await page.locator('.workspace-article').count(), 0);
    await page.getByRole('button', { name: '切换到文档列表', exact: true }).click();
    await page.waitForFunction(() => window.probe.pending.length === 1);
    await page.evaluate((entries) => window.probe.resolve(0, entries), entries);
    await page.locator('.workspace-article').first().waitFor();
    const paths = () =>
      page
        .locator('.workspace-article')
        .evaluateAll((rows) => rows.map((row) => row.dataset.articlePath));
    assert.deepEqual(await paths(), ['B/b2.md', 'B/b02.md', 'B/b10.md', 'A/a2.md', 'plain.txt']);
    assert.equal(
      await page
        .locator('.workspace-article[aria-current="page"]')
        .getAttribute('data-article-path'),
      'B/b2.md',
    );
    assert.equal(await page.locator('.workspace-article-location:visible').count(), 5);
    assert.equal(await page.locator('.workspace-article img,.workspace-article script').count(), 0);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    await page.getByText('已跳过 1 个符号链接、不可读或不支持的条目。', { exact: true }).waitFor();
    const summary = await page
      .locator('[data-article-path="B/b2.md"] .workspace-article-summary')
      .textContent();
    assert.match(summary, /中文标题😀/);
    assert.match(summary, /<script>/);
    // Live edits and history snapshots only project the selected file's first 500 JS code units.
    const originalSummary = await page
      .locator('[data-article-path="B/b2.md"] .workspace-article-summary')
      .textContent();
    const otherSummary = await page
      .locator('[data-article-path="B/b10.md"] .workspace-article-summary')
      .textContent();
    const ioBeforeLive = await page.evaluate(() => window.probe.calls.length);
    await page.evaluate(() => window.setSource('# 正在编辑😀 **Bravo**'));
    await page.waitForFunction(() =>
      document
        .querySelector('[data-article-path="B/b2.md"] .workspace-article-summary')
        .textContent.includes('正在编辑😀 Bravo'),
    );
    assert.equal(
      await page.locator('[data-article-path="B/b10.md"] .workspace-article-summary').textContent(),
      otherSummary,
    );
    await page.evaluate(() => window.setSource('Undo snapshot'));
    await page.waitForFunction(
      () =>
        document.querySelector('[data-article-path="B/b2.md"] .workspace-article-summary')
          .textContent === 'Undo snapshot',
    );
    await page.evaluate(() => window.setSource('# 正在编辑😀 **Bravo**'));
    await page.waitForFunction(() =>
      document
        .querySelector('[data-article-path="B/b2.md"] .workspace-article-summary')
        .textContent.includes('正在编辑😀 Bravo'),
    );
    await page.evaluate(() => window.setSource(''));
    await page.waitForFunction(
      () =>
        document.querySelector('[data-article-path="B/b2.md"] .workspace-article-summary')
          .textContent === '',
    );
    await page.evaluate(() => window.setSource(`${'x'.repeat(500)}must not show`));
    await page.waitForFunction(
      () =>
        document.querySelector('[data-article-path="B/b2.md"] .workspace-article-summary')
          .textContent.length === 500,
    );
    await page.evaluate(() => window.setActive('/mock/not-in-index.md'));
    await page.waitForFunction(
      (expected) =>
        document.querySelector('[data-article-path="B/b2.md"] .workspace-article-summary')
          .textContent === expected,
      originalSummary,
    );
    await page.evaluate(() => {
      window.setSource(undefined);
      window.setActive('/mock/B/b2.md');
    });
    assert.equal(await page.evaluate(() => window.probe.calls.length), ioBeforeLive);
    const geometry = await page
      .locator('.workspace-article')
      .first()
      .evaluate((el) => {
        const c = getComputedStyle(el),
          s = getComputedStyle(el.querySelector('.workspace-article-summary'));
        return {
          padding: [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft],
          height: s.height,
          line: s.lineHeight,
          font: s.fontSize,
        };
      });
    assert.deepEqual(geometry, {
      padding: ['8px', '8px', '12px', '24px'],
      height: '38px',
      line: '18px',
      font: '13px',
    });
    // Original oversize recovery switches the view; it does not replace the workspace or report.
    const retainedCard = await page.locator('[data-article-path="B/b2.md"]').elementHandle();
    const articlesBeforeOversize = await page.evaluate(
      () => window.probe.calls.filter((c) => c.command === 'list_workspace_documents').length,
    );
    const opensBeforeOversize = await page.evaluate(() => window.probe.opened.length);
    await page.getByRole('button', { name: '切换到文件树视图', exact: true }).click();
    await page.getByRole('button', { name: 'note.md', exact: true }).waitFor();
    assert.equal(await note.evaluate((node) => node.isConnected), true);
    await page.getByRole('button', { name: 'B', exact: true }).click();
    await page.getByRole('button', { name: 'b2.md', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'b2.md', exact: true }).getAttribute('aria-current'),
      'page',
    );
    assert.equal(await page.evaluate(() => window.probe.opened.length), opensBeforeOversize);
    assert.equal(
      await page.evaluate(
        () => window.probe.calls.filter((c) => c.command === 'close_workspace').length,
      ),
      0,
    );
    await page.getByRole('button', { name: '切换到文档列表', exact: true }).click();
    await page.getByRole('button', { name: '切换到文件树视图', exact: true }).waitFor();
    assert.equal(await retainedCard.evaluate((node) => node.isConnected), true);
    assert.equal(
      await page.locator('[data-article-path="B/b2.md"]').getAttribute('aria-current'),
      'page',
    );
    assert.equal(
      await page.evaluate(
        () => window.probe.calls.filter((c) => c.command === 'list_workspace_documents').length,
      ),
      articlesBeforeOversize,
    );
    assert.equal(
      await page.evaluate(
        () => window.probe.calls.filter((c) => c.command === 'select_workspace').length,
      ),
      1,
    );
    await page.locator('.workspace-article').first().focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.probe.opened.at(-1)), [
      'ws1',
      'B/b02.md',
      undefined,
    ]);
    await page.keyboard.press('End');
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.articlePath),
      'plain.txt',
    );
    await page.getByRole('button', { name: '目录菜单', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: '按文件夹分组', exact: true }).click();
    await page.getByRole('menuitemradio', { name: '名称', exact: true }).click();
    assert.deepEqual(await paths(), ['A/a2.md', 'B/b02.md', 'B/b10.md', 'B/b2.md', 'plain.txt']);
    await page.getByRole('menuitemradio', { name: '名称', exact: true }).click();
    assert.deepEqual(await paths(), ['plain.txt', 'B/b2.md', 'B/b10.md', 'B/b02.md', 'A/a2.md']);
    await page.keyboard.press('Escape');
    await page.getByRole('menu', { name: '目录操作' }).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '切换到文件树', exact: true }).click();
    assert.equal(await note.evaluate((node) => node.isConnected), true);
    assert.equal(await page.getByRole('button', { name: 'note.md', exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => window.probe.preferences.treeSort), 0);
    assert.equal(await page.evaluate(() => window.probe.preferences.articleSort), -1);
    await page.getByRole('button', { name: '切换侧栏视图', exact: true }).click();
    assert.equal(await page.locator('.sidebar-current-title').textContent(), '大纲');
    assert.equal(await page.getByRole('menu', { name: '侧栏视图' }).count(), 0);
    await page.getByRole('button', { name: '切换侧栏视图', exact: true }).click();
    await page.getByRole('button', { name: '切换到文档列表', exact: true }).click();
    const calls = await page.evaluate(
      () => window.probe.calls.filter((c) => c.command === 'list_workspace_documents').length,
    );
    assert.equal(calls, 2);
    // The same mode/sort controls are reachable from the list context menu and keyboard.
    await page.locator('.workspace-article').first().click({ button: 'right' });
    await page.getByRole('menu', { name: '目录操作' }).waitFor();
    assert.equal(
      await page
        .getByRole('menuitemradio', { name: '文档列表', exact: true })
        .getAttribute('aria-checked'),
      'true',
    );
    await page.keyboard.press('Escape');
    await page.getByRole('menu', { name: '目录操作' }).waitFor({ state: 'hidden' });
    await page.locator('.workspace-article').first().focus();
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menu', { name: '目录操作' }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('menu', { name: '目录操作' }).waitFor({ state: 'hidden' });
    for (const theme of ['github', 'night']) {
      await page.evaluate((theme) => window.setTheme(theme), theme);
      await page.waitForFunction(
        (theme) => document.querySelector('.shell').dataset.themeName === theme,
        theme,
      );
      const visual = await page.locator('[data-article-path="B/b2.md"]').evaluate((el) => ({
        bg: getComputedStyle(el).backgroundColor,
        opacity: getComputedStyle(el.querySelector('.workspace-article-summary')).opacity,
      }));
      assert.equal(visual.bg, theme === 'night' ? 'rgb(34, 34, 34)' : 'rgb(238, 238, 238)');
      assert.equal(visual.opacity, theme === 'night' ? '1' : '0.8');
      if (process.env.WORKSPACE_SCREENSHOTS) {
        await mkdir(process.env.WORKSPACE_SCREENSHOTS, { recursive: true });
        await page.locator('.sidebar').screenshot({
          path: `${process.env.WORKSPACE_SCREENSHOTS}/${name}-articles-${theme}.png`,
        });
      }
    }
    // Cancelled directory chooser preserves old workspace and list.
    await page.evaluate(() => {
      window.probe.cancel = true;
      window.setChoose(1);
    });
    await page.waitForFunction(
      () => window.probe.calls.filter((c) => c.command === 'select_workspace').length === 2,
    );
    assert.equal((await paths()).length, 5);
    // Switching workspace rejects old pending generation; errors, retry, and empty are visible.
    await page.getByRole('button', { name: '目录菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: '刷新', exact: true }).click();
    await page.waitForFunction(() => window.probe.pending.length === 1);
    await page.getByRole('button', { name: '目录菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Next', exact: true }).click();
    await page.waitForFunction(() => window.probe.pending.length === 2);
    await page.evaluate(() =>
      window.probe.resolve(0, [
        {
          name: 'stale.md',
          relativePath: 'stale.md',
          folderName: '',
          folderRelativePath: '',
          size: 0,
          modifiedAt: 0,
          createdAt: 0,
          summary: 'stale',
          summaryTruncated: false,
        },
      ]),
    );
    assert.equal(await page.locator('[data-article-path="stale.md"]').count(), 0);
    await page.evaluate(() => window.probe.resolve(0, []));
    await page.waitForFunction(
      () => document.querySelector('.workspace-articles').getAttribute('aria-busy') === 'false',
    );
    assert.equal(await page.getByText('没有支持的文档', { exact: true }).count(), 0);
    assert.equal(await page.locator('.workspace-article').count(), 0);
    await page.evaluate(() => (window.probe.fail = true));
    await page.getByRole('button', { name: '目录菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: '刷新', exact: true }).click();
    await page.getByRole('alert').waitFor();
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.waitForFunction(() => window.probe.pending.length === 1);
    await page.evaluate((entries) => window.probe.resolve(0, entries), entries);
    await page.locator('.workspace-article').first().waitFor();
    await page.getByRole('button', { name: '目录菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: '刷新', exact: true }).click();
    await page.waitForFunction(() => window.probe.pending.length === 1);
    await page.evaluate(() => window.setMounted(false));
    await page.evaluate((entries) => window.probe.resolve(0, entries), entries);
    await page.waitForFunction(() =>
      window.probe.calls.some(
        (c) => c.command === 'close_workspace' && c.args.workspaceId === 'ws2',
      ),
    );
    assert.equal(await page.locator('.workspace-articles').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`${name} article component checks passed`);
  } finally {
    await page.close();
  }
}
for (const [name, engine] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await engine.launch();
  try {
    await check(browser, name);
  } finally {
    await browser.close();
  }
}
