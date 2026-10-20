import { expect, type Page, test } from '@playwright/test';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

// Every part of the window must change to the new theme in the same step. The sampler records,
// per painted frame, the moment each watched value first differs from the one before it.
const sampler = `
(() => {
  const flips = {};
  const read = () => ({
    sidebar: getComputedStyle(document.querySelector('aside.sidebar') || document.body).backgroundColor,
    shell: document.querySelector('.shell')?.getAttribute('data-theme-name') ?? '',
    palette: document.documentElement.dataset.theme ?? '',
    titlebar: document.querySelector('header.titlebar')
      ? getComputedStyle(document.querySelector('header.titlebar')).color
      : '',
    document: getComputedStyle(document.body).backgroundColor,
  });
  let last = read();
  window.__flips = flips;
  const loop = () => {
    const now = read();
    for (const key of Object.keys(now)) {
      if (now[key] !== last[key]) flips[key] = performance.timeOrigin + performance.now();
    }
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
`;

type Flips = Record<string, number>;
const flipsOf = (target: Page | ReturnType<Page['frames']>[number]) =>
  target.evaluate(() => (window as unknown as { __flips: Flips }).__flips);

async function switchTheme(page: Page, theme: string) {
  const frame = page
    .frames()
    .find((candidate) => candidate.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing editor frame');
  await page.evaluate(sampler);
  await frame.evaluate(sampler);
  await emitLayoutMenu(page, `theme:${theme}`);
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', theme);
  await expect(page.locator('[data-theme-loading]')).toHaveCount(0);
  await page.waitForTimeout(500);
  return {
    ...(await flipsOf(page)),
    ...Object.fromEntries(Object.entries(await flipsOf(frame)).map(([k, v]) => [`frame-${k}`, v])),
  };
}

for (const host of ['windows', 'macos'] as const) {
  for (const reduced of [false, true]) {
    test(`${host}${reduced ? ' with reduced motion' : ''}: the document and the whole shell change theme in one step`, async ({
      page,
    }) => {
      if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(() => {
        if (window !== window.top) return;
        const calls = { count: 0 };
        Reflect.set(window, '__viewTransitions', calls);
        const original = document.startViewTransition?.bind(document);
        if (original)
          document.startViewTransition = ((update: never) => {
            calls.count++;
            return original(update);
          }) as typeof document.startViewTransition;
      });
      await installLayout(page, undefined, host === 'windows' ? 'web' : undefined);
      await readyLayout(page, 'marklyra-light');
      await openLayoutDocument(page);
      await emitLayoutMenu(page, 'open-folder');
      await emitLayoutMenu(page, 'view:outline');
      await expect(page.locator('.document-details-panel')).toBeVisible();
      for (const theme of ['marklyra-dark', 'marklyra-light']) {
        const countOf = () =>
          page.evaluate(
            () =>
              (window as unknown as { __viewTransitions: { count: number } }).__viewTransitions
                .count,
          );
        const before = await countOf();
        const flips = await switchTheme(page, theme);
        // The shell's colours, its palette, its theme name and the document all moved.
        for (const key of ['sidebar', 'shell', 'palette', 'frame-document'])
          expect(flips[key], `${key} did not change`).toBeGreaterThan(0);
        const times = Object.values(flips);
        const spread = Math.max(...times) - Math.min(...times);
        const transitions = (await countOf()) - before;
        if (reduced) {
          // No animation, but still one commit step; the shell used to trail the document by 350ms+.
          expect(transitions).toBe(0);
          expect(spread).toBeLessThanOrEqual(250);
        } else {
          // The old picture is held while the new theme is prepared, then everything fades in together.
          expect(transitions).toBe(1);
          expect(spread).toBeLessThanOrEqual(50);
        }
      }
    });
  }
}

test('a failed theme load leaves the whole window on the old theme', async ({ page }) => {
  await installLayout(page);
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page);
  await page.evaluate(() => {
    const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const previous = internal.invoke;
    internal.invoke = async (command, args = {}) => {
      if (command === 'load_theme_styles' && args.themeId === 'marklyra-dark')
        throw new Error('主题文件不可用');
      return previous(command, args);
    };
  });
  const frame = page.frameLocator('.marklyra-editor-frame');
  await emitLayoutMenu(page, 'theme:marklyra-dark');
  await page.waitForTimeout(800);
  // Nothing half-applied: shell name, palette and the document all still belong to the light theme.
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', 'marklyra-light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(frame.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});
