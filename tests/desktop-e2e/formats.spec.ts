import { expect, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { draftSource, installRecoveryMock } from './recovery-test-util.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
});

test('image and plain HTML snapshots consume confirmed options and preserve draft/history', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.nextDocument.text = '\uFEFF# Image\r\n\n中文 tail';
    mock.exportPreferences.image = {
      imageWidth: 800,
      quality: 2,
      useThemeFontSize: 0,
      imageFontSize: 24,
      exportTheme: 'night',
    };
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  const frame = page.frameLocator('.marklyra-editor-frame');
  await frame.locator('#write > p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  const dirty = '\uFEFF# Image\r\n\n中文 tailX';
  await expect.poll(() => draftSource(page)).toBe(dirty);
  const identity = await page.locator('.marklyra-editor-frame').getAttribute('src');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('export-image'));
  await expect(page.locator('.statusbar')).toContainText('已导出图片', { timeout: 20000 });
  const call = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls
      .filter((c) => c.command === 'save_export_image')
      .at(-1),
  );
  expect(call?.args.options).toEqual({
    imageWidth: 800,
    quality: 2,
    useThemeFontSize: 0,
    imageFontSize: 24,
    exportTheme: 'night',
  });
  expect(call?.args.sourceId).toBe('doc-a');
  expect(String(call?.args.html)).toContain('tailX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('export-html-plain'));
  await expect(page.locator('.statusbar')).toContainText('已导出 HTML', { timeout: 20000 });
  await expect.poll(() => draftSource(page)).toBe(dirty);
  expect(await page.locator('.marklyra-editor-frame').getAttribute('src')).toBe(identity);
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter(
        (c) => c.command === 'save_document' || c.command === 'save_document_as',
      ),
    ),
  ).toEqual([]);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect.poll(() => draftSource(page)).toBeNull();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
  await expect.poll(() => draftSource(page)).toBe(dirty);
});

test('missing converter and cancelled raster output preserve source and history', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await page.frameLocator('.marklyra-editor-frame').locator('#write > p').click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect.poll(() => draftSource(page)).toBe('AlphaX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('export-docx'));
  await expect(page.locator('.statusbar')).toContainText('未检测到Pandoc');
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter((c) => c.command === 'save_export_format'),
    ),
  ).toEqual([]);
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.exportError = '已取消导出';
    mock.emitMenu('export-image');
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls.filter(
            (c) => c.command === 'save_export_image',
          ).length,
      ),
    )
    .toBe(1);
  await expect.poll(() => draftSource(page)).toBe('AlphaX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect.poll(() => draftSource(page)).toBeNull();
});

test('all nine confirmed converter actions use finite typed consumers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.formatCapabilities = {
      pandoc: {
        status: 'available',
        path: '/mock/pandoc',
        version: '3.0',
        message: 'Mock capability only',
      },
      formats: ['docx', 'odt', 'rtf', 'epub', 'latex', 'wiki', 'rst', 'textile', 'opml'],
      importExtensions: [],
      image: true,
    };
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write > p')).toHaveText(
    'Alpha',
  );
  await expect(page.getByRole('button', { name: '导出 HTML', exact: true })).toBeEnabled();
  for (const format of ['docx', 'odt', 'rtf', 'epub', 'latex', 'wiki', 'rst', 'textile', 'opml']) {
    await page.evaluate(
      (format) => (window as TestWindow).__desktopMock.emitMenu(`export-${format}`),
      format,
    );
    await expect(page.locator('.statusbar')).toContainText(`已导出 ${format.toUpperCase()}`, {
      timeout: 20000,
    });
  }
  const calls = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls.filter((c) => c.command === 'save_export_format'),
  );
  expect(calls.map((c) => c.args.format)).toEqual([
    'docx',
    'odt',
    'rtf',
    'epub',
    'latex',
    'wiki',
    'rst',
    'textile',
    'opml',
  ]);
  for (const call of calls) {
    expect(Object.keys(call.args).sort()).toEqual(['format', 'html', 'sourceId', 'suggestedName']);
    expect(String(call.args.html)).toContain('Alpha');
  }
  expect(await draftSource(page)).toBeNull();
});

test('imported candidate uses existing dirty confirmation and closes on cancel', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await page.frameLocator('.marklyra-editor-frame').locator('#write > p').click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect.poll(() => draftSource(page)).toBe('AlphaX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('import-document'));
  const dialog = page.getByRole('dialog', { name: '保存当前更改？' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => draftSource(page)).toBe('AlphaX');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls
          .filter((c) => c.command === 'close_document')
          .map((c) => c.args.id),
      ),
    )
    .toContain('imported');
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write > p')).toHaveText(
    'AlphaX',
  );
});

test('original image controls persist and Pandoc selector has a finite native action', async ({
  page,
}) => {
  await page.goto('/?view=preferences');
  const original = page.frameLocator('.runtime-preferences-frame');
  await expect(original.locator('.nav-group-item')).toHaveCount(7);
  await original.locator('.nav-group-item').nth(4).click();
  await original
    .locator('.export-item')
    .filter({ hasText: /^Image$|^图片$/ })
    .click();
  const width = original.locator('[data-marklyra-preference="export.image:imageWidth"]');
  await expect(width).toBeEnabled();
  await width.fill('800');
  const quality = original.locator('[data-marklyra-preference="export.image:quality"]');
  await quality.selectOption('2');
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.exportPreferences.image))
    .toMatchObject({ imageWidth: 800, quality: 2 });
  await expect(original.locator('#marklyra-preferences-status')).toBeHidden();
  await original
    .locator('.export-item')
    .filter({ hasText: /^General$|^通用$/ })
    .click();
  const pandoc = original.locator('[data-marklyra-preference="pandocPath"]');
  await expect(pandoc).toHaveAttribute('readonly', '');
  await original.locator('[data-marklyra-pandoc-action="choose"]').click();
  await expect(pandoc).toHaveValue('/mock/pandoc');
  expect(
    await page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls.filter((c) => c.command === 'choose_pandoc_path')
          .length,
    ),
  ).toBe(1);
});
