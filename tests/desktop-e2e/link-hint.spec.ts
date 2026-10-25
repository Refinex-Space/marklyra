import { expect, type Page, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import {
  emitLayoutMenu,
  installLayout,
  layoutHistory,
  layoutThemes,
  openLayoutDocument,
  readyLayout,
  saveLayoutSource,
} from './layout.helpers.js';

const source =
  '\uFEFF# Links\r\n\r\n[打开说明](guide.md)\r\n\r\n[外部说明](https://example.test/guide)\r\n';
const frame = (page: Page) => page.frameLocator('.runtime-area .marklyra-editor-frame');
const stored = (page: Page) =>
  page.evaluate(
    () => (window as TestWindow).__desktopMock.applicationPreferences.values.noHintForOpenLink,
  );
async function link(page: Page, text = '打开说明') {
  await frame(page).locator('#write > h1').click();
  await frame(page).getByRole('link', { name: text, exact: true }).click();
}

for (const theme of layoutThemes) {
  test(`${theme}: link hint text and right-aligned actions stay above both sidebars and suppression survives reload`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await openLayoutDocument(page, source);
    await emitLayoutMenu(page, 'open-folder');
    await emitLayoutMenu(page, 'view:files');
    await emitLayoutMenu(page, 'view:outline');
    const iframe = await page.locator('.runtime-area iframe').elementHandle();
    const history = await layoutHistory(page);
    await link(page);
    const notice = frame(page).locator('#md-notification');
    const title = notice.locator('.marklyra-enter-mode-warning-header');
    const suppress = notice.locator('#marklyra-suppress-mode-warning-input');
    const close = notice.locator('#marklyra-suppress-mode-warning-close-btn');
    await expect(title).toContainText('您可以按下');
    await expect(title).toContainText('点击');
    await expect(close).toBeVisible();
    await expect.poll(() => stored(page)).toBe(true);
    const port = () =>
      frame(page)
        .locator('#write')
        .evaluate(() => {
          const file = Reflect.get(window, 'File') as unknown as {
            option: { noHintForOpenLink: boolean };
          };
          return file.option.noHintForOpenLink;
        });
    await expect.poll(port).toBe(true);
    for (const width of [1280, 760]) {
      await page.setViewportSize({ width, height: 800 });
      await expect
        .poll(() =>
          notice.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const button = element
              .querySelector('#marklyra-suppress-mode-warning-close-btn')
              ?.getBoundingClientRect();
            if (!button) return -1;
            return document.documentElement.clientWidth - button.right;
          }),
        )
        .toBeGreaterThanOrEqual(10);
      const geometry = await title.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const boxes = [...range.getClientRects()].filter((box) => box.width && box.height);
        const notice = document.getElementById('md-notification');
        const close = notice
          ?.querySelector('#marklyra-suppress-mode-warning-close-btn')
          ?.getBoundingClientRect();
        const checkbox = notice
          ?.querySelector('#marklyra-suppress-mode-warning-input')
          ?.getBoundingClientRect();
        if (!close || !checkbox) throw Error('Missing hint actions');
        if (!notice) throw Error('Missing hint');
        const bar = notice.getBoundingClientRect();
        const title = element.getBoundingClientRect();
        const bell = getComputedStyle(notice, '::before');
        return {
          textLeft: Math.min(...boxes.map((box) => box.left)),
          textRight: Math.max(...boxes.map((box) => box.right)),
          right: innerWidth - close.right,
          order: checkbox.right < close.left,
          height: bar.height,
          titleCenter: title.top + title.height / 2,
          actionCenter: close.top + close.height / 2,
          bellCenter: bar.top + Number.parseFloat(bell.top),
          bellTransform: bell.transform,
        };
      });
      expect(geometry.textLeft).toBeGreaterThanOrEqual(0);
      expect(geometry.textRight).toBeLessThanOrEqual(width);
      expect(geometry.right).toBeLessThanOrEqual(24);
      expect(geometry.order).toBe(true);
      expect(geometry.height).toBeLessThanOrEqual(50);
      expect(Math.abs(geometry.titleCenter - geometry.actionCenter)).toBeLessThanOrEqual(1);
      expect(geometry.bellTransform).not.toBe('none');
      expect(Math.abs(geometry.titleCenter - geometry.bellCenter)).toBeLessThanOrEqual(1);
      const closeBox = await close.boundingBox();
      if (!closeBox) throw Error('Missing close button');
      const hit = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('marklyra-editor-frame'),
        { x: closeBox.x + closeBox.width / 2, y: closeBox.y + closeBox.height / 2 },
      );
      expect(hit).toBe(true);
      const titleBox = await title.boundingBox();
      if (!titleBox) throw Error('Missing hint title');
      expect(
        await page.evaluate(
          ({ x, y }) =>
            document.elementFromPoint(x, y)?.classList.contains('marklyra-editor-frame'),
          { x: 60, y: titleBox.y + titleBox.height / 2 },
        ),
      ).toBe(true);
      await page.screenshot({ path: info.outputPath(`link-hint-${width}.png`) });
    }
    await suppress.uncheck();
    await expect.poll(() => stored(page)).toBe(false);
    await expect.poll(port).toBe(false);
    await emitLayoutMenu(page, 'find');
    const search = frame(page).locator('#md-searchpanel');
    await expect(search).toBeVisible();
    await expect(notice).toBeHidden();
    await search.locator('.close-btn').click();
    await expect(search).toBeHidden();
    await link(page);
    await expect(notice).toBeVisible();
    await suppress.uncheck();
    await expect.poll(() => stored(page)).toBe(false);
    await expect.poll(port).toBe(false);
    await close.click();
    await expect(notice).toBeHidden();
    await link(page, '外部说明');
    await expect(notice).toBeVisible();
    await suppress.uncheck();
    await suppress.check();
    await expect.poll(() => stored(page)).toBe(true);
    await expect.poll(port).toBe(true);
    await close.click();
    await link(page);
    await expect(notice).toBeHidden();
    expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
    expect(await layoutHistory(page)).toBe(history);
    await saveLayoutSource(page, info, 'link-hint-preserves-document', source);
    await page.reload();
    await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
    await openLayoutDocument(page, source);
    await expect.poll(port).toBe(true);
    await link(page);
    await expect(notice).toBeHidden();
  });
}
