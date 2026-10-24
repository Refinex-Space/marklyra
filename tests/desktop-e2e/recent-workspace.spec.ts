import { expect, type Page, test } from '@playwright/test';
import { installCreationMock } from './creation-test-util.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecentMock, type RecentMockWindow } from './recent.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

async function boot(page: Page, titlebar: 'appkit' | 'web' = 'appkit', existing = false) {
  await page.addInitScript(installMock, { nativeChrome: true, titlebar, home: true });
  await page.addInitScript(installRecoveryMock);
  if (existing)
    await page.addInitScript(installCreationMock, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
    });
  await page.addInitScript(installRecentMock);
  await page.addInitScript(() =>
    localStorage.setItem(
      'marklyra-preferences-v1',
      JSON.stringify({ fileSidebar: { view: 'tree' } }),
    ),
  );
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => {
    const mock = (window as RecentMockWindow).__recentMock;
    mock.seed('/mock/Notes/Plan.md', '# Plan');
    mock.seed('/mock/Elsewhere/Other.md', '# Other');
  });
}
const calls = (page: Page, command: string) =>
  page.evaluate(
    (command) =>
      (window as TestWindow).__desktopMock.calls.filter((call) => call.command === command),
    command,
  );
const menu = (page: Page, action: string) =>
  page.evaluate((action) => (window as TestWindow).__desktopMock.emitMenu(action), action);
const choose = (page: Page, name = 'Plan') =>
  page.locator('.home-recent button').filter({ hasText: name }).click();
const write = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');

for (const titlebar of ['appkit', 'web'] as const) {
  test(`${titlebar}: no folder keeps recent notes visible and opens the clicked note's parent`, async ({
    page,
  }) => {
    await boot(page, titlebar);
    await expect(page.getByText('没有打开的文件夹', { exact: true })).toBeVisible();
    await choose(page);
    await expect(write(page)).toHaveText('Plan');
    await expect(page.locator('.workspace-navigation-header')).toContainText('Notes');
    await expect(page.locator('[data-entry-path="Plan.md"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect((await calls(page, 'open_document_workspace')).map((call) => call.args)).toEqual([
      { documentId: expect.stringMatching(/^recent-doc-/) },
    ]);
    await page
      .locator('.workspace-navigation-header')
      .getByRole('button', { name: '目录菜单' })
      .click();
    await page.getByRole('menuitem', { name: '关闭文件夹', exact: true }).click();
    await expect(page.getByText('没有打开的文件夹', { exact: true })).toBeVisible();
    await expect(write(page)).toHaveText('Plan');
    await menu(page, 'close-document');
    await expect(page.getByRole('region', { name: '开始' })).toBeVisible();
    await choose(page, 'Other');
    await expect(page.locator('.workspace-navigation-header')).toContainText('Elsewhere');
  });
}

test('an existing folder is kept when opening a recent note outside it', async ({ page }) => {
  await boot(page, 'appkit', true);
  await expect(page.locator('.workspace-navigation-header')).toContainText('Creation');
  await choose(page);
  await expect(write(page)).toHaveText('Plan');
  await expect(page.locator('.workspace-navigation-header')).toContainText('Creation');
  expect(await calls(page, 'open_document_workspace')).toEqual([]);
});

test('missing or rejected notes do not open a directory', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    delete (window as RecentMockWindow).__recentMock.files['/mock/Notes/Plan.md'];
  });
  await choose(page);
  await expect(page.getByRole('region', { name: '开始' })).toBeVisible();
  expect(await calls(page, 'open_document_workspace')).toEqual([]);
  await page.evaluate(() =>
    (window as RecentMockWindow).__recentMock.seed('/mock/Bad.md', 'Unsupported \uE027 marker'),
  );
  await choose(page, 'Bad');
  await expect(page.getByRole('region', { name: '开始' })).toBeVisible();
  expect(await calls(page, 'open_document_workspace')).toEqual([]);
});

test('a folder failure preserves the successfully opened document', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    (window as RecentMockWindow).__recentMock.folderError = '目录已移动';
  });
  await choose(page);
  await expect(write(page)).toHaveText('Plan');
  await expect(
    page.getByText('文档已打开，但无法打开所在文件夹：Error: 目录已移动', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('没有打开的文件夹', { exact: true })).toBeVisible();
});

test('a late folder result is released after leaving its document', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    (window as RecentMockWindow).__recentMock.holdFolder = true;
  });
  await choose(page);
  await expect
    .poll(() => page.evaluate(() => (window as RecentMockWindow).__recentMock.pendingFolders))
    .toBe(1);
  await menu(page, 'close-document');
  await expect(page.getByRole('region', { name: '开始' })).toBeVisible();
  await page.evaluate(() => (window as RecentMockWindow).__recentMock.releaseFolder());
  await expect.poll(() => calls(page, 'close_workspace')).toHaveLength(1);
  await expect(page.getByText('没有打开的文件夹', { exact: true })).toBeVisible();
});

test('an explicit folder choice wins over a pending recent-document folder', async ({ page }) => {
  await boot(page, 'appkit', true);
  await page.getByRole('button', { name: '目录菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '关闭文件夹', exact: true }).click();
  await page.evaluate(() => {
    (window as RecentMockWindow).__recentMock.holdFolder = true;
    const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const previous = internal.invoke;
    internal.invoke = async (command, args) =>
      command === 'select_workspace'
        ? { id: 'manual-folder', name: 'Manual', path: '/mock/Manual' }
        : previous(command, args);
  });
  await choose(page);
  await expect
    .poll(() => page.evaluate(() => (window as RecentMockWindow).__recentMock.pendingFolders))
    .toBe(1);
  await menu(page, 'open-folder');
  await expect(page.locator('.workspace-navigation-header')).toContainText('Manual');
  await page.evaluate(() => (window as RecentMockWindow).__recentMock.releaseFolder());
  await expect
    .poll(async () =>
      (await calls(page, 'close_workspace')).some((call) =>
        String(call.args.workspaceId).startsWith('recent-folder-'),
      ),
    )
    .toBe(true);
  await expect(page.locator('.workspace-navigation-header')).toContainText('Manual');
  await expect(write(page)).toHaveText('Plan');
});

test('only the newest accepted recent document can fill an empty sidebar', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    (window as RecentMockWindow).__recentMock.holdFolder = true;
  });
  await choose(page);
  await expect
    .poll(() => page.evaluate(() => (window as RecentMockWindow).__recentMock.pendingFolders))
    .toBe(1);
  await menu(page, 'close-document');
  await choose(page, 'Other');
  await expect
    .poll(() => page.evaluate(() => (window as RecentMockWindow).__recentMock.pendingFolders))
    .toBe(2);
  await page.evaluate(() => (window as RecentMockWindow).__recentMock.releaseFolder());
  await expect.poll(() => calls(page, 'close_workspace')).toHaveLength(1);
  await expect(page.getByText('没有打开的文件夹', { exact: true })).toBeVisible();
  await page.evaluate(() => (window as RecentMockWindow).__recentMock.releaseFolder());
  await expect(page.locator('.workspace-navigation-header')).toContainText('Elsewhere');
  await expect(write(page)).toHaveText('Other');
});
