import { expect, type Page, test } from '@playwright/test';
import {
  emitLayoutMenu,
  installLayout,
  layoutHistory,
  layoutSelection,
  layoutThemes,
  openLayoutDocument,
  readyLayout,
  saveLayoutSource,
} from './layout.helpers.js';

const source =
  '\uFEFF# Reading\r\n\r\n' +
  Array.from(
    { length: 100 },
    (_, index) =>
      `## Section ${index}\r\n\r\nParagraph ${index}: keep **these bytes**, the selection and editing history.\r\n\r\n`,
  ).join('');
const editorFrame = (page: Page) => page.frameLocator('.runtime-area .marklyra-editor-frame');

async function expectButtonInsideDocument(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const button = document.querySelector('.document-scroll-top')?.getBoundingClientRect();
        const pane = document.querySelector<HTMLElement>('main.document-area');
        const area = pane?.getBoundingClientRect();
        const panel = document
          .querySelector('.document-details-panel[data-open]')
          ?.getBoundingClientRect();
        if (!button || !area || !pane) return false;
        // Absolute offsets use the pane's padding box, inside its one-pixel border.
        const right = area.left + pane.clientLeft + pane.clientWidth;
        const bottom = area.top + pane.clientTop + pane.clientHeight;
        return (
          Math.abs(right - button.right - 24) < 1 &&
          Math.abs(bottom - button.bottom - 36) < 1 &&
          (!panel || button.right < panel.left)
        );
      }),
    )
    .toBe(true);
}

for (const theme of layoutThemes) {
  test(`${theme}: back to top follows the document beside the directory and preserves rich and source editing state`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await openLayoutDocument(page, source);
    const iframe = await page.locator('.runtime-area iframe').elementHandle();
    const frame = editorFrame(page);
    const button = page.getByRole('button', { name: '回到顶部', exact: true });
    const content = frame.locator('content');
    await expect(button).toBeHidden();
    await content.evaluate((element) => {
      element.scrollTop = 80;
    });
    await content.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(button).toBeHidden();
    await content.evaluate((element) => {
      element.scrollTop = 1000;
    });
    await expect(button).toBeVisible();
    await expect(button).toHaveCSS('border-radius', '6px');
    await expectButtonInsideDocument(page);
    const closed = await button.boundingBox();
    await emitLayoutMenu(page, 'view:outline');
    await expect(page.getByRole('separator', { name: '调整目录宽度' })).toBeVisible();
    for (const key of ['Home', 'End']) {
      await page.getByRole('separator', { name: '调整目录宽度' }).press(key);
      await expectButtonInsideDocument(page);
    }
    const open = await button.boundingBox();
    if (!closed || !open) throw Error('Missing back-to-top button');
    expect(open.x).toBeLessThan(closed.x);
    for (const width of [960, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await expectButtonInsideDocument(page);
    }
    await frame.locator('#write > p').nth(60).click();
    const selection = await layoutSelection(page);
    const history = await layoutHistory(page);
    await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(500);
    await page.screenshot({ path: info.outputPath('back-to-top-with-directory.png') });
    await button.click();
    await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(button).toBeHidden();
    expect(await content.evaluate((element) => element.scrollTop)).toBe(0);
    expect(await layoutSelection(page)).toEqual(selection);
    expect(await layoutHistory(page)).toBe(history);
    await saveLayoutSource(page, info, 'back-to-top-preserves-rich-source', source);

    await emitLayoutMenu(page, 'view:source');
    await expect(frame.locator('#marklyra-source')).toBeVisible();
    const sourceState = () =>
      frame.locator('#marklyra-source').evaluate(() => {
        const runtime = Reflect.get(window, 'editor') as {
          sourceView: { cm: { getCursor(): { line: number; ch: number }; historySize(): unknown } };
        };
        return {
          cursor: runtime.sourceView.cm.getCursor(),
          history: runtime.sourceView.cm.historySize(),
        };
      });
    await frame.locator('#marklyra-source').evaluate(() => {
      const runtime = Reflect.get(window, 'editor') as {
        sourceView: {
          cm: {
            setCursor(line: number, ch: number): void;
            focus(): void;
            scrollTo(left: number, top: number): void;
          };
        };
      };
      const cm = runtime.sourceView.cm;
      cm.setCursor(150, 5);
      cm.focus();
      cm.scrollTo(0, 1600);
    });
    const before = await sourceState();
    const sourcePort = frame.locator('#marklyra-source .CodeMirror-scroll');
    await expect
      .poll(() => sourcePort.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(500);
    await button.click();
    await expect.poll(() => sourcePort.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(button).toBeHidden();
    expect(await sourceState()).toEqual(before);
    expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
    await saveLayoutSource(page, info, 'back-to-top-preserves-source-mode-bytes', source);
    await sourcePort.evaluate((element) => {
      element.scrollTop = 1200;
    });
    await expect(button).toBeVisible();
    await button.focus();
    await button.press('Enter');
    await expect.poll(() => sourcePort.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(button).toBeHidden();
    await sourcePort.evaluate((element) => {
      element.scrollTop = 1200;
    });
    await expect(button).toBeVisible();
    await emitLayoutMenu(page, 'view:outline');
    await expectButtonInsideDocument(page);
    await openLayoutDocument(page, '# Short\r\n\r\nOnly one paragraph.\r\n');
    await expect(button).toBeHidden();
    expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  });
}
