// Actual component DOM and font routes; workspace IPC only is mocked. Not a native AX/WK test.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, webkit } from '@playwright/test';

const oracle = JSON.parse(
  await readFile(
    new URL('../../../../test/fixtures/sidebar-appearance.json', import.meta.url),
    'utf8',
  ),
).rows;
const baseURL = process.env.WORKSPACE_TEST_URL ?? 'http://127.0.0.1:1423';
const recordOnly = process.env.SIDEBAR_RECORD_ONLY === '1';
const output = process.env.SIDEBAR_THEME_OUTPUT ?? 'artifacts/theme-v19/sidebar-component';
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><link rel="stylesheet" href="/__runtime-fonts/fonts.css"><div id="probe"></div><button id="outside" style="position:fixed;right:20px;top:100px">Outside</button><script type="module">
import React from '/@id/react';
import ReactDOM from '/@id/react-dom/client';
import {WorkspaceSidebar,SidebarHeader} from '/src/features/file-explorer/index.ts';
import {DocumentDetailsPanel} from '/src/features/document-details/DocumentDetailsPanel.tsx';
import {OutlinePanel} from '/src/features/outline/OutlinePanel.tsx';
import '/src/style.css';
function Harness(){const [mode,setMode]=React.useState('files'),[outlineOpen,setOutlineOpen]=React.useState(false),[prefs,setPrefs]=React.useState({view:'articles',treeSort:0,articleSort:0,treeNoGroup:false,articleNoGroup:false}),[theme,setTheme]=React.useState('github'),[vars,setVars]=React.useState({}),[height,setHeight]=React.useState(600),[width,setWidth]=React.useState(270);window.configure=(patch)=>{if(patch.mode){setOutlineOpen(patch.mode==='outline');if(patch.mode!=='outline')setMode(patch.mode);}if(patch.view)setPrefs(previous=>({...previous,view:patch.view}));if(patch.theme)setTheme(patch.theme);if(patch.vars)setVars(patch.vars);if(patch.height)setHeight(patch.height);if(patch.width)setWidth(patch.width);};return React.createElement('div',{className:'shell workspace','data-native-chrome':'true','data-theme-name':theme,style:{height,flexDirection:'row',...vars}},React.createElement('aside',{className:'sidebar','data-file-view':prefs.view,'data-sidebar-mode':mode,style:{width,maxWidth:'none'}},React.createElement(SidebarHeader,{mode,change:setMode,fileView:prefs.view}),React.createElement('div',{className:'sidebar-panel'},React.createElement(WorkspaceSidebar,{compact:true,mode:mode==='search'?'search':'files',onModeChange:setMode,filePreferences:prefs,onFilePreferencesChange:setPrefs,activePath:'/mock/B/a.md',onNewDocument:()=>window.probe.newDocuments++,onOpenDocument:(...args)=>window.probe.opened.push(args)}))),React.createElement(DocumentDetailsPanel,{open:outlineOpen,close:()=>setOutlineOpen(false),elementRef:()=>{}},React.createElement(OutlinePanel,{entries:[{id:'first',level:1,text:'Title'},{id:'child',level:2,text:'Child title'}],disabled:false,jump:async()=>{}})));}
ReactDOM.createRoot(document.getElementById('probe')).render(React.createElement(Harness));
</script></html>`;
function installMock() {
  window.isTauri = true;
  window.probe = { opened: [], newDocuments: 0 };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    transformCallback() {
      return 1;
    },
    unregisterCallback() {},
    async invoke(command, _args) {
      if (command === 'plugin:event|listen') return 1;
      if (command === 'plugin:event|unlisten') return null;
      if (command === 'select_workspace') return { id: 'one', name: 'Mock', path: '/mock' };
      if (command === 'get_workspace_file_undo') return null;
      if (command === 'snapshot_workspace') return null;
      if (command === 'close_workspace') return null;
      if (command === 'list_directory_history')
        return { revision: 0, noRecentFiles: false, entries: [] };
      if (command === 'list_directory')
        return {
          entries: [{ name: 'a.md', relativePath: 'B/a.md', kind: 'file', size: 0 }],
          truncated: false,
          skipped: 0,
        };
      if (command === 'list_workspace_documents')
        return {
          entries: [
            {
              name: 'a.md',
              relativePath: 'B/a.md',
              folderName: 'B',
              folderRelativePath: 'B',
              size: 0,
              modifiedAt: 0,
              createdAt: 0,
              summary: 'Two line summary\nSecond line',
              summaryTruncated: false,
            },
            {
              name: 'b.md',
              relativePath: 'A/b.md',
              folderName: 'A',
              folderRelativePath: 'A',
              size: 0,
              modifiedAt: 0,
              createdAt: 0,
              summary: 'Idle summary',
              summaryTruncated: false,
            },
          ],
          truncated: false,
          scannedFiles: 1,
          scannedEntries: 1,
          readBytes: 0,
          skipped: {
            symlinks: 0,
            unsupportedNames: 0,
            unreadable: 0,
            unsupportedEncoding: 0,
            ignored: 0,
          },
          truncationReasons: [],
        };
      throw Error(command);
    },
  };
}
async function documentFonts(page, family, weight) {
  await page.evaluate(
    async ({ family, weight }) => {
      await document.fonts.load(`${weight} 14px ${family}`, 'Latin summary');
      await document.fonts.ready;
    },
    { family, weight },
  );
}
async function popupVersusFooter(page) {
  return page.evaluate(() => {
    const footer = document.querySelector('.workspace-footer').getBoundingClientRect();
    const popup = document.querySelector('.workspace-location-popup').getBoundingClientRect();
    return { footerTop: footer.top, popupBottom: popup.bottom, popupTop: popup.top };
  });
}
async function check(browser, name) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 } }),
    errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.addInitScript(installMock);
    await page.route('**/__sidebar-theme', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await page.goto(`${baseURL}/__sidebar-theme`);
    await page.locator('.sidebar').hover();
    await page.getByRole('button', { name: '目录菜单', exact: true }).click();
    await page.getByRole('menuitem', { name: '打开文件夹…', exact: true }).click();
    await page.locator('.workspace-article').first().waitFor();
    await page.getByRole('button', { name: 'Outside', exact: true }).click();
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('.workspace-footer')).opacity === '0',
    );
    const hidden = await page.locator('.workspace-footer').evaluate((el) => ({
      display: getComputedStyle(el).display,
      opacity: getComputedStyle(el).opacity,
      pointer: getComputedStyle(el).pointerEvents,
    }));
    const hiddenRoles = await page.getByRole('button', { name: '目录菜单', exact: true }).count();
    if (!recordOnly) {
      assert.equal(hidden.display, 'none');
      assert.equal(hiddenRoles, 0);
    }
    // A real pointer enters the footer area; hover must enable the first physical click.
    const sidebar = await page.locator('.sidebar').boundingBox();
    await page.mouse.move(sidebar.x + sidebar.width / 2, sidebar.y + sidebar.height - 16);
    await page.getByRole('button', { name: '目录菜单', exact: true }).waitFor();
    await page.getByRole('button', { name: '目录菜单', exact: true }).click();
    await page.getByRole('menu', { name: '目录操作' }).waitFor();
    // The directory popup opens upward and leaves the footer row uncovered.
    const popupArticles = await popupVersusFooter(page);
    if (!recordOnly) {
      assert.ok(
        popupArticles.popupBottom <= popupArticles.footerTop,
        JSON.stringify(popupArticles),
      );
      assert.ok(popupArticles.popupTop >= 0, JSON.stringify(popupArticles));
    }
    await page.mouse.move(900, 500);
    assert.equal(await page.getByRole('menu', { name: '目录操作' }).isVisible(), true);
    await page.keyboard.press('Escape');
    await page.getByRole('menu', { name: '目录操作' }).waitFor({ state: 'hidden' });
    assert.equal(
      await page.getByRole('button', { name: '目录菜单', exact: true }).isVisible(),
      true,
    );
    await page.getByRole('button', { name: 'Outside', exact: true }).click();
    if (!recordOnly)
      await page
        .getByRole('button', { name: '目录菜单', exact: true })
        .waitFor({ state: 'hidden' });
    // Keyboard focus reveals controls without changing the mouse-only hidden state.
    await page.locator('.workspace-article').first().focus();
    await page.getByRole('button', { name: '目录菜单', exact: true }).waitFor();
    await page.getByRole('button', { name: '目录菜单', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menu', { name: '目录操作' }).waitFor();
    await page.keyboard.press('Escape');
    // Tree footer participates in layout, including the shortest supported viewport.
    for (const height of [280, 600])
      for (const width of [160, 270]) {
        await page.evaluate(
          ({ height, width }) => window.configure({ height, width, view: 'tree' }),
          { height, width },
        );
        await page.waitForFunction(
          ({ height, width }) => {
            const aside = document.querySelector('.sidebar');
            return (
              aside.dataset.fileView === 'tree' &&
              Math.abs(aside.getBoundingClientRect().height - height) < 1 &&
              aside.getBoundingClientRect().width === width
            );
          },
          { height, width },
        );
        await page.locator('.sidebar').hover();
        const bounds = await page.locator('.workspace-footer').evaluate((el) => {
          const a = el.closest('.sidebar').getBoundingClientRect(),
            f = el.getBoundingClientRect();
          return {
            position: getComputedStyle(el).position,
            bottom: f.bottom - a.bottom,
            top: f.top - a.top,
            height: f.height,
            padding: getComputedStyle(
              el.closest('.workspace-sidebar').querySelector('.workspace-directory-tree'),
            ).paddingBottom,
          };
        });
        assert.equal(bounds.position, 'relative');
        assert.ok(Math.abs(bounds.bottom) < 1, JSON.stringify(bounds));
        assert.ok(bounds.top >= 40, JSON.stringify(bounds));
        assert.equal(bounds.height, 34);
        assert.equal(bounds.padding, '25px');
      }
    // Tree footer stays in flow; its popup must also open above the bar.
    await page.locator('.sidebar').hover();
    await page.getByRole('button', { name: '目录菜单', exact: true }).click();
    await page.getByRole('menu', { name: '目录操作' }).waitFor();
    const popupTree = await popupVersusFooter(page);
    if (!recordOnly) {
      assert.ok(popupTree.popupBottom <= popupTree.footerTop, JSON.stringify(popupTree));
      assert.ok(popupTree.popupTop >= 0, JSON.stringify(popupTree));
    }
    await page.keyboard.press('Escape');
    await page.getByRole('menu', { name: '目录操作' }).waitFor({ state: 'hidden' });
    await page.evaluate(() => window.configure({ height: 600, width: 270, view: 'articles' }));
    await page.waitForFunction(
      () => document.querySelector('.sidebar').dataset.fileView === 'articles',
    );
    const fonts = await page.evaluate(async () => {
      const wanted = [
        ['Raleway', 400, 'normal'],
        ['Open Sans', 400, 'normal'],
        ['Open Sans', 700, 'normal'],
        ['TeXGyreAdventor', 400, 'normal'],
        ['PT Serif', 400, 'normal'],
        ['Merriweather', 400, 'normal'],
        ['Lato', 700, 'normal'],
      ];
      const loaded = [];
      for (const [family, weight, style] of wanted) {
        const faces = await document.fonts.load(`${style} ${weight} 14px "${family}"`, 'AĀ');
        loaded.push({
          family,
          weight,
          style,
          count: faces.length,
          statuses: faces.map((face) => face.status),
        });
      }
      return loaded;
    });
    if (!recordOnly)
      for (const font of fonts) {
        assert.ok(font.count > 0, JSON.stringify(font));
        assert.ok(
          font.statuses.every((status) => status === 'loaded'),
          JSON.stringify(font),
        );
      }
    const themeFacts = [];
    for (const row of oracle.filter((row) => row.engine === name)) {
      await page.evaluate(
        ({ theme, values }) =>
          window.configure({ theme, vars: values, view: 'articles', mode: 'files' }),
        row,
      );
      await page.waitForFunction(({ theme, values }) => {
        const shell = document.querySelector('.shell');
        return (
          shell.dataset.themeName === theme &&
          shell.style.getPropertyValue('--marklyra-summary-line-height') ===
            values['--marklyra-summary-line-height']
        );
      }, row);
      const measurements = await page.evaluate(() => {
        const read = (selector, properties) => {
          const style = getComputedStyle(document.querySelector(selector));
          return Object.fromEntries(properties.map((property) => [property, style[property]]));
        };
        return {
          header: read('.workspace-navigation-header', [
            'fontFamily',
            'fontSize',
            'fontWeight',
            'color',
          ]),
          sidebar: read('.sidebar', [
            'fontFamily',
            'fontSize',
            'fontWeight',
            'lineHeight',
            'color',
            'backgroundColor',
          ]),
          idle: read('.workspace-article:not([aria-current])', [
            'color',
            'backgroundColor',
            'opacity',
            'borderBottom',
            'paddingTop',
            'paddingBottom',
          ]),
          selected: read('.workspace-article[aria-current]', [
            'color',
            'backgroundColor',
            'opacity',
          ]),
          filename: read('.workspace-article:not([aria-current]) .workspace-article-name', [
            'fontWeight',
            'lineHeight',
          ]),
          selectedName: read('.workspace-article[aria-current] .workspace-article-name', [
            'fontWeight',
          ]),
          summary: read('.workspace-article-summary', [
            'fontFamily',
            'fontSize',
            'fontWeight',
            'height',
            'lineHeight',
            'opacity',
          ]),
          meta: read('.workspace-article-location', ['fontFamily', 'lineHeight']),
        };
      });
      const fields = {
        header: {
          fontFamily: 'sidebar-font-family',
          fontSize: 'sidebar-font-size',
          fontWeight: 'sidebar-font-weight',
          color: 'sidebar-text',
        },
        sidebar: {
          fontFamily: 'sidebar-font-family',
          fontSize: 'sidebar-font-size',
          fontWeight: 'sidebar-font-weight',
          lineHeight: 'sidebar-line-height',
          color: 'sidebar-text',
          backgroundColor: 'sidebar-bg',
        },
        idle: {
          color: 'article-text',
          backgroundColor: 'article-bg',
          opacity: 'article-opacity',
          borderBottom: 'article-border-bottom',
          paddingTop: 'article-folder-padding-top',
          paddingBottom: 'article-padding-bottom',
        },
        selected: {
          color: 'article-selected-text',
          backgroundColor: 'article-selected-bg',
          opacity: 'article-selected-opacity',
        },
        filename: { fontWeight: 'article-font-weight', lineHeight: 'article-line-height' },
        selectedName: { fontWeight: 'article-selected-font-weight' },
        summary: {
          fontFamily: 'summary-font-family',
          fontSize: 'summary-font-size',
          fontWeight: 'summary-font-weight',
          height: 'summary-height',
          lineHeight: 'summary-line-height',
          opacity: 'summary-opacity',
        },
        meta: { fontFamily: 'article-meta-font-family', lineHeight: 'article-meta-line-height' },
      };
      for (const [element, properties] of Object.entries(fields))
        for (const [property, key] of Object.entries(properties))
          assert.equal(
            measurements[element][property],
            row.values[`--marklyra-${key}`],
            `${name}/${row.theme}/${element}.${property}`,
          );
      await documentFonts(
        page,
        row.values['--marklyra-sidebar-font-family'],
        row.values['--marklyra-sidebar-font-weight'],
      );
      if (name === 'chromium') {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('DOM.enable');
        await cdp.send('CSS.enable');
        const { root } = await cdp.send('DOM.getDocument');
        const { nodeId } = await cdp.send('DOM.querySelector', {
          nodeId: root.nodeId,
          selector: '.workspace-article-summary',
        });
        const { fonts: actualFonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
        assert.ok(
          actualFonts.some((font) => font.isCustomFont && font.glyphCount > 0),
          JSON.stringify(actualFonts),
        );
        measurements.actualSummaryFonts = actualFonts;
        await cdp.detach();
      }
      await page.locator('.sidebar').hover();
      await page.getByRole('button', { name: '目录菜单', exact: true }).hover();
      measurements.footerHover = await page
        .getByRole('button', { name: '目录菜单', exact: true })
        .evaluate((el) => ({
          backgroundColor: getComputedStyle(el).backgroundColor,
          color: getComputedStyle(el).color,
        }));
      assert.equal(
        measurements.footerHover.backgroundColor,
        row.values['--marklyra-sidebar-footer-hover-bg'],
        `${name}/${row.theme}/footer bg`,
      );
      assert.equal(
        measurements.footerHover.color,
        row.values['--marklyra-sidebar-footer-hover-text'],
        `${name}/${row.theme}/footer text`,
      );
      await page.evaluate(() => window.configure({ view: 'tree' }));
      await page.waitForFunction(
        () => document.querySelector('.sidebar').dataset.fileView === 'tree',
      );
      measurements.tree = await page
        .locator('.workspace-tree-row[aria-current="page"]')
        .evaluate((el) => ({
          fontFamily: getComputedStyle(el).fontFamily,
          fontWeight: getComputedStyle(el).fontWeight,
          color: getComputedStyle(el).color,
          iconColor: getComputedStyle(el.querySelector('.workspace-glyph')).color,
          height: getComputedStyle(el).height,
          backgroundColor: getComputedStyle(el, '::before').backgroundColor,
        }));
      assert.equal(measurements.tree.fontFamily, row.values['--marklyra-sidebar-font-family']);
      assert.equal(measurements.tree.fontWeight, row.values['--marklyra-sidebar-font-weight']);
      assert.equal(measurements.tree.color, row.values['--marklyra-active-file-text']);
      assert.equal(measurements.tree.iconColor, measurements.tree.color);
      assert.equal(measurements.tree.height, row.values['--marklyra-tree-row-height']);
      assert.equal(measurements.tree.backgroundColor, row.values['--marklyra-active-file-bg']);
      await page.evaluate(() => window.configure({ mode: 'outline' }));
      await page.waitForFunction(() => !document.querySelector('.document-details-panel').hidden);
      await page.locator('.outline-row').first().hover();
      measurements.outline = await page
        .locator('.outline-row')
        .first()
        .evaluate((el) => ({
          fontSize: getComputedStyle(el).fontSize,
          lineHeight: getComputedStyle(el).lineHeight,
          fontWeight: getComputedStyle(el).fontWeight,
          color: getComputedStyle(el).color,
          backgroundColor: getComputedStyle(el).backgroundColor,
        }));
      assert.equal(measurements.outline.fontSize, row.values['--marklyra-outline-font-size']);
      assert.equal(measurements.outline.lineHeight, row.values['--marklyra-outline-line-height']);
      assert.equal(measurements.outline.fontWeight, row.values['--marklyra-outline-font-weight']);
      assert.equal(measurements.outline.color, row.values['--marklyra-outline-hover-text']);
      assert.equal(measurements.outline.backgroundColor, row.values['--marklyra-outline-hover-bg']);
      assert.equal(await page.getByRole('button', { name: '目录菜单', exact: true }).count(), 0);
      themeFacts.push({ theme: row.theme, measurements });
    }
    const facts = { name, hidden, hiddenRoles, fonts, themeFacts, errors };
    await mkdir(output, { recursive: true });
    await writeFile(
      `${output}/${name}${recordOnly ? '-before' : '-after'}.json`,
      `${JSON.stringify(facts, null, 2)}\n`,
    );
    assert.deepEqual(errors, []);
    console.log(`${name} sidebar footer checks passed${recordOnly ? ' (baseline recorded)' : ''}`);
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
