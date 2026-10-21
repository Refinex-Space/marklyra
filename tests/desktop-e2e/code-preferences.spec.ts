import { expect, type Page, test } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

type CodeWindow = Window & {
  editor: LegacyEditor;
  File: { option: Record<string, unknown> };
};
const markdown = '\uFEFF```javascript\r\nconst value = 1;\r\n```\n';
async function openCode(page: Page, id = 'code-a') {
  await page.evaluate(
    ({ markdown, id }) => {
      const mock = (window as TestWindow).__desktopMock;
      mock.nextDocument = { id, path: `/mock/${id}.md`, text: markdown, encoding: 'UTF-8 BOM' };
      mock.emitMenu('open');
    },
    { markdown, id },
  );
  await expect(
    page.frameLocator('.marklyra-editor-frame').locator('#write .CodeMirror'),
  ).toHaveCount(1);
}
async function view(page: Page) {
  return page
    .frameLocator('.marklyra-editor-frame')
    .locator('#write')
    .evaluate((area) => {
      const child = window as unknown as CodeWindow;
      const cm = Object.values(child.editor.fences.queue ?? {})[0];
      return {
        global: {
          numbers: child.File.option.showLineNumbersForFence,
          noWrap: child.File.option.noLineWrapping,
          lineWise: child.File.option.lineWiseCopyCut,
        },
        cm: {
          numbers: cm?.getOption('lineNumbers'),
          wrap: cm?.getOption('lineWrapping'),
          lineWise: cm?.getOption('lineWiseCopyCut'),
        },
        noWrapClass: area.classList.contains('fences-no-line-wrapping'),
      };
    });
}

test('original code controls keep restart-only settings out of the current WebView and initialize the next window', async ({
  page,
  context,
}) => {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await openCode(page);
  const instance = await page.locator('.marklyra-editor-frame').elementHandle();
  expect(await view(page)).toEqual({
    global: { numbers: false, noWrap: false, lineWise: false },
    cm: { numbers: false, wrap: true, lineWise: false },
    noWrapClass: false,
  });
  const preferences = await context.newPage();
  let nextWindow: Page | undefined;
  try {
    await preferences.addInitScript(installMock, { label: 'preferences', nativeChrome: true });
    await preferences.goto('/?view=preferences');
    const ui = preferences.frameLocator('.runtime-preferences-frame');
    await expect(ui.locator('.nav-group-item')).toHaveCount(11);
    await ui.locator('.nav-group-item').nth(3).click();
    await ui.locator('[data-marklyra-preference="show_line_numbers_for_fence"]').check();
    await expect(ui.locator('#marklyra-preferences-status')).toBeHidden();
    // The original control is reverse: checked means wrapping is enabled.
    await ui.locator('[data-marklyra-preference="no_line_wrapping"]').uncheck();
    await expect(ui.locator('#marklyra-preferences-status')).toBeHidden();
    await ui.locator('.nav-group-item').nth(1).click();
    await ui.locator('[data-marklyra-preference="lineWiseCopyCut"]').check();
    await expect(ui.locator('#marklyra-preferences-status')).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem('mock-application-preferences') ?? '{}').values,
        ),
      )
      .toMatchObject({
        show_line_numbers_for_fence: true,
        no_line_wrapping: true,
        lineWiseCopyCut: true,
      });
    await expect
      .poll(() => view(page))
      .toEqual({
        global: { numbers: false, noWrap: false, lineWise: true },
        cm: { numbers: false, wrap: true, lineWise: false },
        noWrapClass: false,
      });
    expect(await instance?.evaluate((element) => element.isConnected)).toBe(true);
    // Opening another file reuses the current WebView and its startup display values.
    await openCode(page, 'code-b');
    await expect
      .poll(() => view(page))
      .toEqual({
        global: { numbers: false, noWrap: false, lineWise: true },
        cm: { numbers: false, wrap: true, lineWise: true },
        noWrapClass: false,
      });
    expect(await instance?.evaluate((element) => element.isConnected)).toBe(true);
    nextWindow = await context.newPage();
    await nextWindow.addInitScript(installMock, { label: 'editor-code-next', nativeChrome: true });
    await nextWindow.addInitScript(installRecoveryMock);
    await nextWindow.goto('/');
    await expect(nextWindow.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
    await openCode(nextWindow, 'code-next');
    await expect
      .poll(() => view(nextWindow as Page))
      .toEqual({
        global: { numbers: true, noWrap: true, lineWise: true },
        cm: { numbers: true, wrap: false, lineWise: true },
        noWrapClass: true,
      });
    expect(await view(page)).toMatchObject({
      global: { numbers: false, noWrap: false, lineWise: true },
    });
    for (const targetPage of [page, nextWindow])
      expect(
        await targetPage.evaluate(() =>
          (window as TestWindow).__desktopMock.calls.filter(
            (call) => call.command === 'save_document',
          ),
        ),
      ).toEqual([]);
  } finally {
    await nextWindow?.close();
    await preferences.close();
  }
});
