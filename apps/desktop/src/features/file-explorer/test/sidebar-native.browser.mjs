// Component coverage only: real React/DOM, mocked workspace IPC, no native host or editor runtime.
import assert from 'node:assert/strict';
import { chromium, webkit } from '@playwright/test';

const baseURL = process.env.WORKSPACE_TEST_URL ?? 'http://127.0.0.1:1421';
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><div id="probe"></div><script type="module">
import React from '/@id/react';
import ReactDOM from '/@id/react-dom/client';
import {WorkspaceSidebar} from '/src/features/file-explorer/WorkspaceSidebar.tsx';
import {SidebarHeader} from '/src/features/file-explorer/SidebarHeader.tsx';
import {DocumentDetailsPanel} from '/src/features/document-details/DocumentDetailsPanel.tsx';
import {OutlinePanel} from '/src/features/outline/OutlinePanel.tsx';
import {SidebarResize} from '/src/components/SidebarResize.tsx';
import '/src/style.css';
const root=ReactDOM.createRoot(document.getElementById('probe'));
function Harness(){
 const [mode,setMode]=React.useState('files'),[disabled,setDisabled]=React.useState(false),[width,setWidth]=React.useState(270),[hidden,setHidden]=React.useState(false),[outlineOpen,setOutlineOpen]=React.useState(false);
 Object.assign(window,{setMode,setDisabled,setOutlineOpen});
 return React.createElement('div',{className:'workspace',style:{display:'flex',height:600}},
  React.createElement('aside',{className:'sidebar',hidden,style:{width,minWidth:0,maxWidth:'none'}},
   React.createElement(SidebarHeader,{fileView:'tree',mode,change:setMode,disabled}),
   React.createElement('div',{style:{flex:1,minHeight:0}},React.createElement(WorkspaceSidebar,{filePreferences:{view:'tree',treeSort:0,articleSort:0,treeNoGroup:false,articleNoGroup:false},compact:true,mode:mode==='search'?'search':'files',onModeChange:setMode,disabled,activePath:'/mock/Else.md',onOpenDocument:(...args)=>window.probe.opened.push(args),onNewDocument:()=>window.probe.newDocuments++}))),
  React.createElement(SidebarResize,{native:true,width,change:(value)=>{window.probe.widths.push(value);setWidth(value);},hide:()=>{window.probe.hidden++;setHidden(true);}}),
  React.createElement('main',{style:{flex:1,minWidth:0}}),
  React.createElement(DocumentDetailsPanel,{open:outlineOpen,close:()=>setOutlineOpen(false),elementRef:()=>{}},
   React.createElement(OutlinePanel,{entries:[{id:'guide',level:1,text:'Guide'},{id:'start',level:3,text:'Start'},{id:'end',level:2,text:'End'},{id:'appendix',level:1,text:'Appendix'}],disabled,jump:async(id)=>window.probe.jumps.push(id)})));
}
root.render(React.createElement(Harness));window.dispose=()=>root.unmount();
</script></html>`;
function installMock() {
  window.probe = { calls: [], opened: [], jumps: [], widths: [], hidden: 0, newDocuments: 0 };
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
      if (command === 'get_workspace_file_undo') return null;
      if (command === 'snapshot_workspace') return null;
      if (command === 'select_workspace') return { id: 'ws1', name: '工作区', path: '/mock' };
      if (command === 'close_workspace' || command === 'finish_workspace_creation') return null;
      if (command === 'create_workspace_entry')
        return {
          name: 'Untitled.md',
          relativePath: 'Untitled.md',
          kind: 'file',
          size: 0,
          entryToken: args.operationId,
        };
      if (command === 'list_directory_history')
        return { revision: 0, noRecentFiles: false, entries: [] };
      if (command === 'list_directory')
        return {
          entries: args.relativePath
            ? [{ name: '笔记.md', relativePath: '资料/笔记.md', kind: 'file', size: 10 }]
            : [
                { name: '资料', relativePath: '资料', kind: 'directory', size: null },
                { name: 'Alpha.md', relativePath: 'Alpha.md', kind: 'file', size: 10 },
              ],
          truncated: false,
          skipped: 0,
        };
      if (command === 'search_workspace')
        return {
          matches: [],
          scannedFiles: 2,
          skipped: { nonUtf8: 0, tooLarge: 0, unreadable: 0, symlinks: 0, unsupportedNames: 0 },
          truncated: false,
        };
      throw Error(`Unexpected IPC command ${command}`);
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
    await page.route('**/__sidebar-native-probe', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await page.goto(`${baseURL}/__sidebar-native-probe`);
    await page.locator('.workspace-compact-empty').waitFor();
    assert.equal(
      await page
        .locator('.workspace-folder-header,.workspace-tabs,.outline-heading,.outline-heading-level')
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator('.marklyra-sidebar-header')
        .evaluate((el) => el.getBoundingClientRect().height),
      40,
    );
    await page.locator('.sidebar').hover();
    await page.getByRole('button', { name: '目录菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: '打开文件夹…', exact: true }).click();
    await page.getByRole('button', { name: '资料', exact: true }).waitFor();
    assert.equal(await page.locator('.workspace-root-row').textContent(), '工作区');
    await page.getByRole('button', { name: '资料', exact: true }).click();
    await page.getByRole('button', { name: '笔记.md', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.probe.opened[0]), [
      'ws1',
      '资料/笔记.md',
      undefined,
    ]);
    const listed = await page.evaluate(
      () => window.probe.calls.filter((item) => item.command === 'list_directory').length,
    );
    await page.evaluate(() => window.setOutlineOpen(true));
    const tree = page.getByRole('tree', { name: '文档标题' });
    await tree.getByRole('treeitem', { name: 'Guide', exact: true }).waitFor();
    await tree.getByRole('treeitem', { name: 'Guide', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await tree.getByRole('treeitem').count(), 2);
    await page.keyboard.press('ArrowRight');
    assert.equal(await tree.getByRole('treeitem').count(), 4);
    await tree.getByRole('treeitem', { name: 'End', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.probe.jumps), ['end']);
    await tree.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '全部折叠', exact: true }).click();
    assert.equal(await tree.getByRole('treeitem').count(), 2);
    await tree.click({ button: 'right' });
    await page.getByRole('menuitemcheckbox', { name: '筛选', exact: true }).click();
    await page.getByRole('searchbox', { name: '筛选大纲' }).fill('Start');
    await tree.getByRole('treeitem', { name: 'Start', exact: true }).waitFor();
    assert.equal(await tree.getByRole('treeitem').count(), 1);
    await page.getByRole('button', { name: '关闭大纲筛选' }).click();
    assert.equal(await tree.getByRole('treeitem').count(), 2);
    await tree.click({ button: 'right' });
    await page.getByRole('menuitemradio', { name: '平铺大纲', exact: true }).click();
    assert.equal(await tree.getByRole('treeitem').count(), 4);
    assert.equal(await tree.locator('.outline-disclosure').count(), 0);
    await tree.getByRole('treeitem', { name: 'Guide', exact: true }).focus();
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menu', { name: '大纲操作' }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(
      await tree
        .getByRole('treeitem', { name: 'Guide', exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.getByRole('button', { name: '关闭目录', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '笔记.md', exact: true }).count(), 1);
    assert.equal(
      await page.evaluate(
        () => window.probe.calls.filter((item) => item.command === 'list_directory').length,
      ),
      listed,
    );
    await page.getByRole('button', { name: '全文搜索', exact: true }).click();
    await page.getByRole('searchbox').fill('hello');
    await page.getByRole('searchbox', { name: '搜索文件', exact: true }).press('Enter');
    await page.waitForFunction(() =>
      window.probe.calls.some(
        (item) => item.command === 'search_workspace' && item.args.query === 'hello',
      ),
    );
    await page.getByRole('button', { name: '返回文件', exact: true }).click();
    await page.getByRole('button', { name: '新建文件', exact: true }).click();
    await page.getByRole('textbox', { name: '文件名', exact: true }).waitFor();
    await page.getByRole('textbox', { name: '文件名', exact: true }).press('Escape');
    assert.equal(
      await page.evaluate(
        () => window.probe.calls.filter((item) => item.command === 'create_workspace_entry').length,
      ),
      1,
    );
    assert.equal(await page.evaluate(() => window.probe.newDocuments), 0);
    await page.getByRole('button', { name: '目录菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: '刷新', exact: true }).click();
    await page.waitForFunction(
      (count) =>
        window.probe.calls.filter((item) => item.command === 'list_directory').length > count,
      listed,
    );
    await page.locator('.workspace-footer').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '关闭目录', exact: true }).click();
    await page.waitForFunction(() =>
      window.probe.calls.some(
        (item) => item.command === 'close_workspace' && item.args.workspaceId === 'ws1',
      ),
    );
    assert.equal(await page.locator('.workspace-root-row').count(), 0);
    const splitter = page.getByRole('separator', { name: '调整侧栏宽度' });
    await splitter.focus();
    await page.keyboard.press('Home');
    assert.equal(await splitter.getAttribute('aria-valuenow'), '160');
    await page.keyboard.press('End');
    assert.equal(await splitter.getAttribute('aria-valuenow'), '780');
    const bounds = await splitter.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, 200);
    await page.mouse.down();
    const initial = await page.evaluate(() => window.probe.widths.length);
    await page.mouse.move(400, 200);
    assert.equal(await page.evaluate(() => window.probe.widths.length), initial);
    await page.mouse.up();
    assert.equal(await splitter.getAttribute('aria-valuenow'), '400');
    const next = await splitter.boundingBox();
    await page.mouse.move(next.x + next.width / 2, 200);
    await page.mouse.down();
    await page.mouse.move(60, 200);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.probe.hidden), 1);
    assert.deepEqual(errors, []);
    return {
      browser: name,
      passed: true,
      scenarios: [
        'single header and controlled panels',
        'outline context menu/filter/flat/keyboard',
        'retained tree and real footer actions',
        'native drag preview/limits/hide',
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
