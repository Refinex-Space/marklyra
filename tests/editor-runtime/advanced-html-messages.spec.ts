import { readFile } from 'node:fs/promises';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';
import {
  advancedErrors,
  advancedFrame,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';

const source =
  '<script src="https://platform.twitter.com/widgets.js"></script>\n<div>Owned preview</div>\n\nTail\n';
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && ['4173', '4174'].includes(url.port)
      ? route.continue()
      : route.abort();
  });
  const main = process.env.ADVANCED_BASELINE_MAIN,
    index = process.env.ADVANCED_BASELINE_INDEX;
  if (main)
    await page.route('http://127.0.0.1:4174/appsrc/main.js', async (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(main) }),
    );
  if (index)
    await page.route('http://127.0.0.1:4174/index.html*', async (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: await readFile(index) }),
    );
});
test('generated HTML preview reports height to its immediate editor and retains its real editing gesture', async ({
  page,
}, info) => {
  await mountAdvanced(page, source);
  const frame = advancedFrame(page),
    iframe = frame.locator('#write iframe.md-html-iframe'),
    child = frame.frameLocator('#write iframe.md-html-iframe');
  await expect(iframe).toHaveCount(1);
  await child.locator('body').waitFor({ state: 'attached' });
  const attributes = await iframe.evaluate((node) => ({
    sandbox: node.getAttribute('sandbox'),
    cid: node.closest('[cid]')?.getAttribute('cid'),
    height: node.getAttribute('height'),
  }));
  await child.locator('body').evaluate((body) => {
    const tall = document.createElement('div');
    tall.style.height = '333px';
    tall.textContent = 'Tall preview';
    body.append(tall);
  });
  await expect
    .poll(() => iframe.evaluate((node) => node.getBoundingClientRect().height))
    .toBeGreaterThan(330);
  expect(await advancedSource(page)).toBe(source);
  await info.attach('owned-html-preview', {
    body: JSON.stringify(
      { attributes, height: await iframe.evaluate((node) => node.getBoundingClientRect().height) },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  await child.getByText('Owned preview', { exact: true }).click({ modifiers: ['Meta'] });
  await expect(frame.locator('#write [mdtype="html_block"] .CodeMirror')).toBeVisible();
  expect(await advancedSource(page)).toBe(source);
  expect(await advancedErrors(page)).toEqual([]);
});
test('outer and malformed HTML control messages cannot edit the document or fault the SDK', async ({
  page,
}) => {
  await mountAdvanced(page, source);
  const frame = advancedFrame(page),
    iframe = frame.locator('#write iframe.md-html-iframe'),
    child = frame.frameLocator('#write iframe.md-html-iframe');
  await expect(iframe).toHaveCount(1);
  await child.locator('body').waitFor({ state: 'attached' });
  const cid = await iframe.evaluate((node) => node.closest('[cid]')?.getAttribute('cid'));
  if (!cid) throw Error('Missing owned HTML block');
  await page.evaluate((cid) => {
    const editor = (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor,
      target = editor.element.contentWindow;
    target?.postMessage(null, '*');
    target?.postMessage({ msg: 'startEditing', cid }, '*');
    target?.postMessage({ msg: 'changeHeight', cid: 'missing', height: 7 }, '*');
  }, cid);
  await child.locator('body').evaluate((_, cid) => {
    parent.postMessage({ msg: 'changeHeight', cid, height: 'invalid' }, '*');
    parent.postMessage({ msg: 'startEditing', cid: 'missing' }, '*');
    parent.postMessage({ msg: 'contextmenu', cid, event: null }, '*');
  }, cid);
  await frame
    .locator('#write')
    .evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 30)));
  await expect(frame.locator('#write [mdtype="html_block"] .CodeMirror')).toHaveCount(0);
  expect(await advancedSource(page)).toBe(source);
  expect(await advancedErrors(page)).toEqual([]);
});
