import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import {
  captureLayout,
  emitLayoutMenu,
  installLayout,
  layoutCaret,
  layoutHistory,
  layoutSelection,
  layoutSizes,
  layoutSource,
  layoutThemes,
  openLayoutDocument,
  readyLayout,
  saveLayoutSource,
} from './layout.helpers.js';

for (const theme of layoutThemes) {
  test(`${theme}: visual fixture preserves its document bytes and desktop layout`, async ({
    page,
  }, testInfo) => {
    const source = readFileSync(new URL('../fixtures/visual.md', import.meta.url), 'utf8');
    await installLayout(page);
    await page.setViewportSize(layoutSizes[2]);
    await readyLayout(page, theme);
    await openLayoutDocument(page, source);
    await page.mouse.move(layoutSizes[2].width - 10, 80);
    await captureLayout(page, testInfo, `${theme}-visual-fixture-1484x1021`);
    await saveLayoutSource(page, testInfo, `${theme}-visual-fixture-save`, source);
  });

  test(`${theme}: empty, normal and dirty layout at three viewport sizes`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await installLayout(page);
    for (const size of layoutSizes) {
      await page.setViewportSize(size);
      await readyLayout(page, theme);
      const prefix = `${theme}-${size.width}x${size.height}`;
      await captureLayout(page, testInfo, `${prefix}-empty`);
      await openLayoutDocument(page);
      const iframe = await page.locator('.runtime-area .marklyra-editor-frame').elementHandle();
      await layoutCaret(page);
      const selection = await layoutSelection(page),
        history = await layoutHistory(page);
      await captureLayout(page, testInfo, `${prefix}-normal`);
      expect(await layoutSelection(page)).toEqual(selection);
      expect(await layoutHistory(page)).toBe(history);
      await page.keyboard.type('X');
      await expect(
        page.frameLocator('.runtime-area .marklyra-editor-frame').locator('#write > p').last(),
      ).toHaveText('TailX');
      await captureLayout(page, testInfo, `${prefix}-dirty`);
      await saveLayoutSource(
        page,
        testInfo,
        `${prefix}-edited`,
        layoutSource.replace('Tail', 'TailX'),
      );
      await emitLayoutMenu(page, 'undo');
      await expect(
        page.frameLocator('.runtime-area .marklyra-editor-frame').locator('#write > p').last(),
      ).toHaveText('Tail');
      await saveLayoutSource(page, testInfo, `${prefix}-undo`, layoutSource);
      await emitLayoutMenu(page, 'redo');
      await expect(
        page.frameLocator('.runtime-area .marklyra-editor-frame').locator('#write > p').last(),
      ).toHaveText('TailX');
      await saveLayoutSource(
        page,
        testInfo,
        `${prefix}-redo`,
        layoutSource.replace('Tail', 'TailX'),
      );
      await emitLayoutMenu(page, 'undo');
      await expect(
        page.frameLocator('.runtime-area .marklyra-editor-frame').locator('#write > p').last(),
      ).toHaveText('Tail');
      await saveLayoutSource(page, testInfo, `${prefix}-restored`, layoutSource);
      expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
    }
    expect(errors).toEqual([]);
  });

  test(`${theme}: sidebar, search, menu and modal keep editor history and selection`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await installLayout(page);
    const size = layoutSizes[layoutThemes.indexOf(theme) % layoutSizes.length];
    await page.setViewportSize(size ?? layoutSizes[1]);
    await readyLayout(page, theme);
    await openLayoutDocument(page);
    const iframe = await page.locator('.runtime-area .marklyra-editor-frame').elementHandle();
    await layoutCaret(page);
    await page.keyboard.type('X');
    const editedHistory = await layoutHistory(page);
    await emitLayoutMenu(page, 'open-folder');
    await expect(page.locator('[data-article-path]')).toHaveCount(2);
    await emitLayoutMenu(page, 'view:files');
    await expect(page.locator('.sidebar-current-title')).toHaveCount(0);
    const root = await page
      .getByRole('navigation', { name: 'Layout Fixtures 文件目录' })
      .elementHandle();
    await captureLayout(page, testInfo, `${theme}-tree`);
    await emitLayoutMenu(page, 'view:articles');
    await expect(page.locator('[data-article-path]')).toHaveCount(2);
    await captureLayout(page, testInfo, `${theme}-articles`);
    await emitLayoutMenu(page, 'view:outline');
    await expect(page.getByRole('tree', { name: '文档标题' }).getByRole('treeitem')).toHaveCount(2);
    await captureLayout(page, testInfo, `${theme}-outline`);
    await emitLayoutMenu(page, 'view:workspace-search');
    const search = page.getByRole('searchbox', { name: '搜索文件', exact: true });
    await expect(search).toBeFocused();
    await search.fill('Alpha');
    await search.press('Enter');
    await expect(page.getByRole('list', { name: '全文搜索结果' })).toBeVisible();
    await captureLayout(page, testInfo, `${theme}-search`);
    await search.press('Escape');
    await expect(search).toBeHidden();
    await emitLayoutMenu(page, 'view:files');
    expect(await root?.evaluate((element) => element.isConnected)).toBe(true);
    await page.locator('.sidebar').hover();
    await page.getByRole('button', { name: '目录菜单', exact: true }).click();
    const menu = page.getByRole('menu', { name: '目录操作', exact: true });
    await expect(menu).toBeVisible();
    await captureLayout(page, testInfo, `${theme}-menu`);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    expect(await layoutHistory(page)).toBe(editedHistory);
    await layoutCaret(page);
    const caret = await layoutSelection(page);
    await emitLayoutMenu(page, 'recent-open:00000000-0000-4000-8000-000000000002');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await captureLayout(page, testInfo, `${theme}-modal`);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => layoutSelection(page)).toEqual(caret);
    await page.keyboard.type('Y');
    await expect(
      page.frameLocator('.runtime-area .marklyra-editor-frame').locator('#write > p').last(),
    ).toHaveText('TailYX');
    await saveLayoutSource(
      page,
      testInfo,
      `${theme}-cancel-then-input`,
      layoutSource.replace('Tail', 'TailYX'),
    );
    await emitLayoutMenu(page, 'undo');
    await expect(
      page.frameLocator('.runtime-area .marklyra-editor-frame').locator('#write > p').last(),
    ).toHaveText('TailX');
    await saveLayoutSource(
      page,
      testInfo,
      `${theme}-input-undo`,
      layoutSource.replace('Tail', 'TailX'),
    );
    await emitLayoutMenu(page, 'redo');
    await expect(
      page.frameLocator('.runtime-area .marklyra-editor-frame').locator('#write > p').last(),
    ).toHaveText('TailYX');
    await saveLayoutSource(
      page,
      testInfo,
      `${theme}-input-redo`,
      layoutSource.replace('Tail', 'TailYX'),
    );
    expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('content inset, fullscreen, theme breakpoints and long-document scrolling preserve state', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await installLayout(page);
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page);
  await layoutCaret(page);
  const iframe = await page.locator('.runtime-area .marklyra-editor-frame').elementHandle();
  const selection = await layoutSelection(page),
    history = await layoutHistory(page);
  for (const [width, max] of [
    [1399, '860px'],
    [1400, '1024px'],
    [1799, '1024px'],
    [1800, '1200px'],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    const snapshot = await captureLayout(page, testInfo, `github-breakpoint-${width}`);
    expect(snapshot.editor.write?.maxWidth).toBe(max);
    // The document card supplies the 28px titlebar offset and its 4px top gap.
    expect((snapshot.shell.documentPane?.y ?? 0) - 4).toBe(28);
    expect(snapshot.editor.content?.y).toBe(0);
    expect(await layoutSelection(page)).toEqual(selection);
    expect(await layoutHistory(page)).toBe(history);
  }
  for (const fullscreen of [true, false]) {
    await page.evaluate((value) => {
      Reflect.set(window, '__marklyraLayoutFullscreen', value);
      (window as TestWindow).__desktopMock.emitEvent('tauri://resize', {
        width: innerWidth,
        height: innerHeight,
      });
    }, fullscreen);
    await expect(page.locator('.shell')).toHaveAttribute('data-fullscreen', String(fullscreen));
    const snapshot = await captureLayout(page, testInfo, `github-fullscreen-${fullscreen}`);
    const cardGap = fullscreen ? 8 : 4;
    expect((snapshot.shell.documentPane?.y ?? 0) - cardGap).toBe(fullscreen ? 0 : 28);
    expect(snapshot.editor.content?.y).toBe(0);
    expect(await layoutSelection(page)).toEqual(selection);
    expect(await layoutHistory(page)).toBe(history);
  }
  const longSource =
    '# Long Document\n\n' +
    Array.from(
      { length: 80 },
      (_, index) =>
        `Paragraph ${index + 1} has enough text to wrap when the document viewport becomes narrow.`,
    ).join('\n\n') +
    '\n\nLast marker';
  await openLayoutDocument(page, longSource);
  await layoutCaret(page);
  const longSelection = await layoutSelection(page),
    longHistory = await layoutHistory(page);
  const tail = page
    .frameLocator('.runtime-area .marklyra-editor-frame')
    .locator('#write > p')
    .last();
  await expect(tail).toHaveText('Last marker');
  await tail.scrollIntoViewIfNeeded();
  await expect(tail).toBeInViewport();
  await captureLayout(page, testInfo, 'github-long-document-bottom');
  expect(await layoutSelection(page)).toEqual(longSelection);
  expect(await layoutHistory(page)).toBe(longHistory);
  await saveLayoutSource(page, testInfo, 'long-document-no-edit', longSource);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
});
