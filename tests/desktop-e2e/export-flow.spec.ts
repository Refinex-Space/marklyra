import { expect, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { draftSource, installRecoveryMock } from './recovery-test-util.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  // Isolate export writes from the independently enabled background-save policy.
  await page.addInitScript(() => localStorage.setItem('marklyra-autosave', 'false'));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
});

test('HTML and print menus consume their own confirmed settings without saving the dirty Markdown', async ({
  page,
}) => {
  const raw = '\uFEFF# First\r\n\r\n[TOC]\n\n# Second\n\nTail';
  await page.evaluate((raw) => {
    const mock = (window as TestWindow).__desktopMock;
    mock.nextDocument.text = raw;
    mock.exportPreferences = {
      schemaVersion: 1,
      revision: 2,
      html: { exportTheme: 'marklyra-light' },
      pdf: {
        paper: 'A5',
        'paper.margin': 'custom',
        'paper.marginTop': 12,
        'paper.marginBottom': 14,
        'paper.marginLeft': 10,
        'paper.marginRight': 11,
        splitPages: true,
        exportTheme: 'marklyra-dark',
      },
    };
  }, raw);
  await page.getByRole('button', { name: '打开', exact: true }).click();
  const frame = page.frameLocator('.marklyra-editor-frame');
  await frame.locator('#write > p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect.poll(() => draftSource(page)).toBe(`${raw}X`);
  const iframe = await page.locator('.marklyra-editor-frame').getAttribute('src');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('print-preview'));
  await expect(page.locator('.notice-host')).toContainText('已打开打印预览');
  const printed = await page.evaluate(
    () =>
      (window as TestWindow).__desktopMock.calls
        .filter((c) => c.command === 'open_print_preview')
        .at(-1)?.args,
  );
  expect(printed?.options).toEqual({
    paperSize: 'A5',
    marginsMm: { top: 12, right: 11, bottom: 14, left: 10 },
  });
  expect(String(printed?.html)).toContain('marklyra-print');
  expect(String(printed?.html)).toContain('TailX');
  expect(String(printed?.html)).not.toMatch(/(?:af|at):\/\//);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('export-html'));
  // The isolated renderer allows up to 15s for font/image readiness.
  await expect(page.locator('.notice-host')).toContainText('已导出 HTML', { timeout: 20_000 });
  const html = await page.evaluate(
    () =>
      (window as TestWindow).__desktopMock.calls
        .filter((c) => c.command === 'save_export_html')
        .at(-1)?.args.html,
  );
  expect(String(html)).not.toContain('marklyra-print-layout');
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter(
        (c) => c.command === 'save_document' || c.command === 'save_document_as',
      ),
    ),
  ).toEqual([]);
  expect(await page.locator('.marklyra-editor-frame').getAttribute('src')).toBe(iframe);
  await expect(page.locator('.document-title')).toHaveText('A.md •');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect.poll(() => draftSource(page)).toBeNull();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((c) => c.command === 'save_document')
            .at(-1)?.args.text,
      ),
    )
    .toBe(raw);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
  await expect.poll(() => draftSource(page)).toBe(`${raw}X`);
});

test('unreadable export preferences stop output and leave the current draft usable', async ({
  page,
}) => {
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.exportPreferencesError = '导出设置损坏';
  });
  await page.getByRole('button', { name: '导出 HTML', exact: true }).click();
  await expect(page.locator('.notice-host')).toContainText('导出设置损坏');
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter(
        (c) => c.command === 'save_export_html' || c.command === 'open_print_preview',
      ),
    ),
  ).toEqual([]);
  await expect.poll(() => draftSource(page)).toBeNull();
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toHaveText('Alpha');
});
