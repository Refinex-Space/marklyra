import { expect, type Page, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

const home = (page: Page) => page.getByRole('region', { name: '开始' });
const editorText = (page: Page) =>
  page.frameLocator('.runtime-area .marklyra-editor-frame').locator('#write');

test('opening a folder in an empty window lands on its home view', async ({ page }) => {
  // A secondary window starts in the editor, ready to write.
  await installLayout(page, undefined, 'web', { label: 'editor-2', home: true });
  await readyLayout(page, 'marklyra-light');
  await expect(home(page)).toHaveCount(0);
  await emitLayoutMenu(page, 'open-folder');
  await expect(home(page)).toBeVisible();
  await expect(page.locator('.runtime-editor-mount')).toHaveAttribute('inert', '');
  await expect(page.locator('.sidebar')).toContainText('Layout Fixtures');
  // 新建笔记 still starts writing from there.
  await home(page)
    .getByRole('button', { name: /新建笔记/ })
    .click();
  await expect(home(page)).toHaveCount(0);
});

test('written text keeps the editor when a folder opens', async ({ page }) => {
  await installLayout(page, undefined, 'web', { label: 'editor-2', home: true });
  await readyLayout(page, 'marklyra-light');
  await editorText(page).click();
  await page.keyboard.type('还没保存的想法');
  await emitLayoutMenu(page, 'open-folder');
  await expect(page.locator('.sidebar')).toContainText('Layout Fixtures');
  await expect(home(page)).toHaveCount(0);
  await expect(editorText(page)).toContainText('还没保存的想法');
});

test('a window the system opened for a folder starts on the home view', async ({ page }) => {
  await installLayout(page, undefined, 'web', { label: 'editor-2', home: true });
  await page.addInitScript(() => {
    if (window !== window.top) return;
    (window as TestWindow).__desktopMock.startupBoot = {
      document: null,
      workspace: { id: 'layout-workspace', name: 'Layout Fixtures', path: '/mock/layout' },
      warnings: [],
      home: true,
    } as never;
  });
  await readyLayout(page, 'marklyra-light');
  await expect(home(page)).toBeVisible();
  await expect(page.locator('.sidebar')).toContainText('Layout Fixtures');
});
