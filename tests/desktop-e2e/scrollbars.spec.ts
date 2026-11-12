import { expect, test } from '@playwright/test';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

// The system's always-visible scrollbar paints a track of its own colour down every pane. WKWebView
// always draws the same clear-track, capsule-thumb scrollbar instead (liquid-glass.css), from the
// first frame; WebView2 (Chromium here) keeps its own Fluent bars untouched.
test('WebKit scrollers, the file tree included, use the clear-track glass scrollbar', async ({
  page,
  browserName,
}) => {
  await installLayout(page, 'Notes');
  await readyLayout(page, 'marklyra-dark');
  await openLayoutDocument(page);
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:files');
  const widths = await page.evaluate(() => {
    const measure = (scroller: HTMLElement) => scroller.offsetWidth - scroller.clientWidth;
    const plain = document.createElement('div');
    plain.style.cssText = 'position:fixed;top:0;left:0;width:80px;height:80px;overflow:scroll';
    document.body.append(plain);
    const generic = measure(plain);
    plain.remove();
    // The file tree once asked for `scrollbar-width: thin`, which made WebKit drop the glass
    // scrollbar and paint the system track down the sidebar.
    const tree = document.querySelector<HTMLElement>('.workspace-panel:not([hidden])');
    if (!tree) throw Error('Missing file tree scroller');
    const filler = document.createElement('div');
    filler.style.height = '2000px';
    tree.append(filler);
    const fileTree = measure(tree);
    filler.remove();
    return { generic, fileTree };
  });
  const expected = browserName === 'webkit' ? 11 : 0;
  expect(widths).toEqual({ generic: expected, fileTree: expected });
});
