// Saved-preview, committed order and explicit-platform regressions; real DOM, mocked IPC.
import assert from 'node:assert/strict';
import { chromium, webkit } from '@playwright/test';

const baseURL = process.env.WORKSPACE_TEST_URL ?? 'http://127.0.0.1:1422';
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><div id="probe"></div><script type="module">
import React from '/@id/react';
import ReactDOM from '/@id/react-dom/client';
import {WorkspaceArticles} from '/src/features/file-explorer/WorkspaceArticles.tsx';
function Harness(){const [state,setState]=React.useState({id:'one',path:'/mock',activePath:'/mock/B/a.md',activeSource:'Disk A',activeSavedSource:'Disk A',refresh:0,sort:0,noGroup:false,platform:'browser'});window.configure=patch=>setState(previous=>({...previous,...patch}));React.useLayoutEffect(()=>{window.committedState=state;},[state]);return React.createElement(WorkspaceArticles,{workspace:{id:state.id,path:state.path,name:'Mock'},active:true,disabled:false,...state,onOpen:()=>{},onSwitchToTree:()=>{}});}
ReactDOM.createRoot(document.getElementById('probe')).render(React.createElement(Harness));
</script></html>`;
function installMock() {
  window.probe = {
    pending: [],
    calls: [],
    resolve(entries) {
      const request = this.pending.shift();
      if (!request) throw Error('No pending request');
      request.resolve({
        entries,
        truncated: false,
        scannedFiles: entries.length,
        scannedEntries: entries.length,
        readBytes: 0,
        skipped: {
          symlinks: 0,
          unsupportedNames: 0,
          unreadable: 0,
          unsupportedEncoding: 0,
          ignored: 7,
        },
        truncationReasons: [],
      });
    },
  };
  window.isTauri = true;
  window.__TAURI_INTERNALS__ = {
    invoke(command, args) {
      window.probe.calls.push({ command, args });
      if (command !== 'list_workspace_documents') throw Error(command);
      return new Promise((resolve) => window.probe.pending.push({ resolve }));
    },
  };
}
const doc = (name, folder, summary) => ({
  name,
  relativePath: folder ? `${folder}/${name}` : name,
  folderName: folder,
  folderRelativePath: folder,
  size: 0,
  modifiedAt: 0,
  createdAt: 0,
  summary,
  summaryTruncated: false,
});
const original = [doc('a.md', 'B', 'Disk A'), doc('b.md', 'A', 'Disk B')];
async function check(browser, name) {
  const page = await browser.newPage(),
    errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.addInitScript(installMock);
    await page.route('**/__articles-state', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await page.goto(`${baseURL}/__articles-state`);
    const configure = async (patch) => {
      await page.evaluate((patch) => window.configure(patch), patch);
      await page.waitForFunction(
        (patch) =>
          Object.entries(patch).every(([key, value]) => window.committedState?.[key] === value),
        patch,
      );
    };
    const resolve = async (entries) => {
      await page.waitForFunction(() => window.probe.pending.length === 1);
      await page.evaluate((entries) => window.probe.resolve(entries), entries);
    };
    const summary = async (path, text) =>
      page.waitForFunction(
        ({ path, text }) =>
          Array.from(document.querySelectorAll('[data-article-path]'))
            .find((row) => row.dataset.articlePath === path)
            ?.querySelector('.workspace-article-summary').textContent === text,
        { path, text },
      );
    const paths = () =>
      page
        .locator('[data-article-path]')
        .evaluateAll((rows) => rows.map((row) => row.dataset.articlePath));
    await resolve(original);
    await summary('B/a.md', 'Disk A');
    assert.equal(await page.getByText(/已跳过/).count(), 0);
    await configure({ activeSource: 'Saved changed A' });
    await summary('B/a.md', 'Saved changed A');
    await configure({ activeSavedSource: 'Saved changed A' });
    await configure({
      activePath: '/mock/A/b.md',
      activeSource: 'Disk B',
      activeSavedSource: 'Disk B',
    });
    await summary('B/a.md', 'Saved changed A');
    await configure({
      activePath: '/mock/B/a.md',
      activeSource: 'Dirty must not survive',
      activeSavedSource: 'Saved changed A',
    });
    await summary('B/a.md', 'Dirty must not survive');
    await configure({
      activePath: '/mock/A/b.md',
      activeSource: 'Disk B',
      activeSavedSource: 'Disk B',
    });
    await summary('B/a.md', 'Saved changed A');
    await configure({
      activePath: '/mock/B/a.md',
      activeSource: 'Saved changed A',
      activeSavedSource: 'Saved changed A',
    });
    await summary('B/a.md', 'Saved changed A');
    assert.equal(await page.evaluate(() => window.probe.calls.length), 1);
    // Request starts before the save ACK. Its stale metadata must not erase the confirmed saved preview.
    await configure({ refresh: 1, activeSource: 'Saved during held refresh' });
    await page.waitForFunction(() => window.probe.pending.length === 1);
    await configure({ activeSavedSource: 'Saved during held refresh' });
    await resolve([doc('a.md', 'B', 'Stale query snapshot'), doc('b.md', 'A', 'Disk B')]);
    await configure({
      activePath: '/mock/A/b.md',
      activeSource: 'Disk B',
      activeSavedSource: 'Disk B',
    });
    await summary('B/a.md', 'Saved during held refresh');
    // A later manual refresh clears that override; an unchanged saved baseline is not registered again.
    await configure({ refresh: 2 });
    await summary('B/a.md', 'Stale query snapshot');
    await resolve([doc('a.md', 'B', 'External disk A'), doc('b.md', 'A', 'Disk B')]);
    await summary('B/a.md', 'External disk A');
    await configure({
      activePath: '/mock/B/a.md',
      activeSource: 'External disk A',
      activeSavedSource: 'External disk A',
    });
    await configure({ activeSource: '', activeSavedSource: '' });
    await summary('B/a.md', '');
    await configure({
      activePath: '/mock/A/b.md',
      activeSource: 'Disk B',
      activeSavedSource: 'Disk B',
    });
    await summary('B/a.md', '');
    // A workspace change rejects the old generation even when relative names happen to match.
    await configure({
      id: 'two',
      refresh: 0,
      activePath: '/mock/not-indexed.md',
      activeSource: undefined,
      activeSavedSource: undefined,
    });
    await resolve([doc('a.md', 'B', 'Other workspace A'), doc('b.md', 'A', 'Other workspace B')]);
    await summary('B/a.md', 'Other workspace A');
    // off->on must build first-seen groups from the current flat order, not the previous report.
    await configure({ refresh: 1, sort: 0, noGroup: false });
    await resolve([doc('z.md', 'B', 'z'), doc('a.md', 'A', 'a')]);
    await page.waitForFunction(() => document.querySelectorAll('[data-article-path]').length === 2);
    assert.deepEqual(await paths(), ['B/z.md', 'A/a.md']);
    await configure({ noGroup: true });
    await page.waitForFunction(
      () => document.querySelector('[data-article-path]').dataset.articlePath === 'A/a.md',
    );
    await configure({ noGroup: false });
    assert.deepEqual(await paths(), ['A/a.md', 'B/z.md']);
    // Stable ties on a newly selected sort keep the last committed arrival order.
    await configure({ refresh: 2, noGroup: true, sort: 1 });
    await resolve([doc('a02.md', '', '02'), doc('a2.md', '', '2')]);
    await page.waitForFunction(
      () => document.querySelector('[data-article-path]').dataset.articlePath === 'a02.md',
    );
    await configure({ sort: -1 });
    await page.waitForFunction(
      () => document.querySelector('[data-article-path]').dataset.articlePath === 'a2.md',
    );
    await configure({ sort: 0 });
    assert.deepEqual(await paths(), ['a2.md', 'a02.md']);
    // Paths never choose the comparison branch: a valid Mac backslash and a Windows forward slash are explicit.
    await configure({ refresh: 3, path: '/mock\\literal', platform: 'macos', sort: 1 });
    await resolve([doc('A+.md', '', 'plus'), doc('A-.md', '', 'minus')]);
    await page.waitForFunction(
      () => document.querySelector('[data-article-path]').dataset.articlePath === 'A-.md',
    );
    const callsBeforePlatform = await page.evaluate(() => window.probe.calls.length);
    await configure({ platform: 'windows' });
    await page.waitForFunction(
      () => document.querySelector('[data-article-path]').dataset.articlePath === 'A+.md',
    );
    assert.equal(await page.evaluate(() => window.probe.calls.length), callsBeforePlatform);
    // A relocated capability changes the disk namespace and must invalidate its old catalog.
    await configure({ path: 'C:/mock' });
    await resolve([doc('Relocated.md', '', 'Relocated catalog')]);
    await summary('Relocated.md', 'Relocated catalog');
    assert.equal(await page.evaluate(() => window.probe.calls.length), callsBeforePlatform + 1);
    assert.deepEqual(errors, []);
    console.log(`${name} saved preview/order/platform component checks passed`);
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
