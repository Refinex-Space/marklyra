// Actual React/DOM and checked private font delivery; no native host or filesystem IPC.
import assert from 'node:assert/strict';
import { chromium, webkit } from '@playwright/test';

const baseURL = process.env.WORKSPACE_TEST_URL ?? 'http://127.0.0.1:4184';
const html = `<!doctype html><html lang="zh"><meta charset="utf-8">
<link rel="stylesheet" href="/__runtime-icons/icons.css"><div id="probe"></div>
<script type="module">
import React from '/@id/react';
import ReactDOM from '/@id/react-dom/client';
import { SidebarHeader } from '/src/features/file-explorer/SidebarHeader.tsx';
import { WorkspaceFooter } from '/src/features/file-explorer/WorkspaceFooter.tsx';
import { WorkspaceGlyph } from '/src/features/file-explorer/WorkspaceGlyph.tsx';
import { OutlinePanel } from '/src/features/outline/OutlinePanel.tsx';
import '/src/style.css';
function Harness(){
 const [mode,change]=React.useState('files');
 const [preferences,changePreferences]=React.useState({view:'tree',treeSort:0,articleSort:0,treeNoGroup:false,articleNoGroup:false});
 const [expanded,setExpanded]=React.useState(false);
 window.probe={mode,preferences};
 return React.createElement('aside',{className:'sidebar',style:{width:270,minWidth:270,height:600}},
  React.createElement(SidebarHeader,{mode,change,fileView:preferences.view}),
  React.createElement('div',{className:'workspace-sidebar workspace-sidebar-compact',style:{position:'relative',height:500}},
   React.createElement('button',{className:'workspace-tree-row','aria-expanded':expanded,onClick:()=>setExpanded(!expanded),'aria-label':'测试目录'},
    React.createElement('span',{className:'workspace-tree-disclosure'},React.createElement(WorkspaceGlyph,{name:'chevron'})),
    React.createElement(WorkspaceGlyph,{name:expanded?'folderOpen':'folder'}),'测试目录'),
   React.createElement(OutlinePanel,{entries:[{id:'parent',level:1,text:'Parent'},{id:'child',level:2,text:'Child'}],disabled:false,jump:async()=>{}}),
   React.createElement(WorkspaceFooter,{name:'Owned fixture',workspace:{id:'owned',name:'Owned fixture',path:'/owned'},path:'/owned',disabled:false,canChoose:false,choose:()=>{},refresh:()=>{},close:()=>{},newDocument:()=>{},preferences,changePreferences})));
}
ReactDOM.createRoot(document.getElementById('probe')).render(React.createElement(Harness));
</script></html>`;

async function check(type, name) {
  const browser = await type.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.route('**/__sidebar-icons-probe', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await page.goto(`${baseURL}/__sidebar-icons-probe`);
    await page.getByRole('button', { name: '测试目录', exact: true }).waitFor();
    const fonts = await page.evaluate(async () => {
      const examples = [
        ['MarkLyra FontAwesome', '\uf07b'],
        ['MarkLyra Ionicons', '\uf1d9'],
        ['MarkLyra Icons', '\ue902'],
      ];
      return Promise.all(
        examples.map(async ([family, glyph]) => {
          const faces = await document.fonts.load(`14px "${family}"`, glyph);
          return {
            family,
            count: faces.length,
            loaded: faces.every((face) => face.status === 'loaded'),
          };
        }),
      );
    });
    assert.ok(
      fonts.every((font) => font.count === 1 && font.loaded),
      JSON.stringify(fonts),
    );
    const source = page.locator('.marklyra-sidebar-header .sidebar-header-action').first();
    assert.equal(await source.locator('.shell-glyph').getAttribute('data-shell-glyph'), 'outline');
    await source.click();
    assert.equal(await source.locator('.shell-glyph').getAttribute('data-shell-glyph'), 'tree');
    await source.click();
    const search = page.getByRole('button', { name: '全文搜索', exact: true });
    assert.equal(await search.locator('.shell-glyph').getAttribute('data-shell-glyph'), 'search');
    await search.click();
    assert.equal(await source.locator('.shell-glyph').getAttribute('data-shell-glyph'), 'back');
    await source.click();
    assert.equal(await page.evaluate(() => window.probe.mode), 'files');

    const directory = page.getByRole('button', { name: '测试目录', exact: true });
    const arrow = directory.locator('.workspace-glyph-chevron');
    const content = () => arrow.evaluate((node) => getComputedStyle(node, '::before').content);
    assert.equal(await directory.textContent(), '测试目录');
    assert.ok((await content()).includes('\uf0da'));
    await directory.click();
    assert.ok((await content()).includes('\uf0d7'));
    assert.equal(
      await directory.locator('.workspace-glyph-folderOpen').getAttribute('data-character'),
      '\uf07b',
    );
    const parent = page.getByRole('treeitem', { name: 'Parent', exact: true });
    assert.equal(
      await parent.locator('.outline-disclosure .shell-glyph').getAttribute('data-shell-glyph'),
      'outlineDown',
    );
    await page.getByRole('button', { name: '折叠 Parent', exact: true }).click();
    assert.equal(
      await parent.locator('.outline-disclosure .shell-glyph').getAttribute('data-shell-glyph'),
      'outlineRight',
    );
    assert.equal(await page.getByRole('treeitem', { name: 'Child', exact: true }).count(), 0);

    await page.locator('.sidebar').hover();
    await page.getByRole('button', { name: '目录菜单', exact: true }).click();
    for (const [label, ascending, descending, sort] of [
      ['自然排序', 'naturalAscending', 'naturalDescending', -10],
      ['名称', 'nameAscending', 'nameDescending', -1],
      ['修改时间', 'modifiedAscending', 'modifiedDescending', -2],
      ['创建时间', 'createdAscending', 'createdDescending', -3],
    ]) {
      const button = page.getByRole('menuitemradio', { name: label, exact: true });
      assert.equal(
        await button.locator('.shell-glyph').getAttribute('data-shell-glyph'),
        ascending,
      );
      if (label !== '自然排序') await button.click();
      await button.click();
      assert.equal(
        await button.locator('.shell-glyph').getAttribute('data-shell-glyph'),
        descending,
      );
      assert.equal(await page.evaluate(() => window.probe.preferences.treeSort), sort);
    }
    await page.keyboard.press('Escape');
    assert.equal(
      await page
        .getByRole('button', { name: '目录菜单', exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.getByRole('button', { name: '切换到文档列表', exact: true }).click();
    await source.click();
    assert.equal(await source.locator('.shell-glyph').getAttribute('data-shell-glyph'), 'articles');
    assert.deepEqual(errors, []);
    return { browser: name, fonts, cases: 4, errors };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const [name, type] of [
  ['chromium', chromium],
  ['webkit', webkit],
])
  results.push(await check(type, name));
console.log(JSON.stringify(results, null, 2));
