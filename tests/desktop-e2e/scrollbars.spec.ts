import { expect, test } from '@playwright/test';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

// Always-visible scrollbars paint a track of their own colour down every pane. While the system
// uses them, a probe marks the root `data-scrollbars="classic"` and liquid-glass.css draws them
// with a clear track; overlay scrollbars stay the system's own and take no width.
test('only classic scrollbars get the clear-track style, the file tree included', async ({
  page,
  browserName,
}) => {
  await installLayout(page, 'Notes');
  await readyLayout(page, 'marklyra-dark');
  await openLayoutDocument(page);
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:files');
  const read = () =>
    page.evaluate(() => {
      const measure = (scroller: HTMLElement) => scroller.offsetWidth - scroller.clientWidth;
      const plain = document.createElement('div');
      plain.style.cssText = 'position:fixed;top:0;left:0;width:80px;height:80px;overflow:scroll';
      document.body.append(plain);
      const generic = measure(plain);
      plain.remove();
      // The file tree asks for thin scrollbars; a bare `scrollbar-width: thin` once made WebKit
      // drop the clear-track style there and paint the system track down the sidebar.
      const tree = document.querySelector<HTMLElement>('.workspace-panel:not([hidden])');
      if (!tree) throw Error('Missing file tree scroller');
      const filler = document.createElement('div');
      filler.style.height = '2000px';
      tree.append(filler);
      const fileTree = measure(tree);
      filler.remove();
      return { generic, fileTree, mark: document.documentElement.dataset.scrollbars ?? null };
    });
  // The browsers here use overlay scrollbars: nothing is marked and nothing takes width.
  expect(await read()).toEqual({ generic: 0, fileTree: 0, mark: null });
  if (browserName === 'webkit') {
    // Classic scrollbars are a WKWebView matter (WebView2 always uses Fluent overlay bars), so the
    // classic state is forced: every scroller, the file tree included, gets the 11px glass style.
    await page.evaluate(() => {
      document.documentElement.dataset.scrollbars = 'classic';
    });
    expect(await read()).toEqual({ generic: 11, fileTree: 11, mark: 'classic' });
  }
  // The probe measures the system's own scrollbar, not the style it switches on: a re-check sees
  // overlay scrollbars again and clears the mark.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await read()).mark).toBeNull();
});
