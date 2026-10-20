import { expect, type Page, test } from '@playwright/test';
import { installCreationMock } from './creation-test-util.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecentMock, type RecentMockWindow } from './recent.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

const runtimeUrl = process.env.CREATION_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html';

interface Options {
  label?: string;
  host?: 'windows' | 'macos';
  workspace?: boolean;
}
async function boot(page: Page, options: Options = {}) {
  await page.addInitScript(installMock, {
    label: options.label ?? 'main',
    nativeChrome: true,
    titlebar: (options.host === 'macos' ? 'appkit' : 'web') as 'web' | 'appkit',
    home: true,
  });
  await page.addInitScript(installRecoveryMock);
  if (options.workspace !== false) await page.addInitScript(installCreationMock, { runtimeUrl });
  await page.addInitScript(installRecentMock);
  await page.addInitScript(() => localStorage.setItem('marklyra-autosave', 'false'));
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
}
const seed = (page: Page, path: string, text: string) =>
  page.evaluate(
    ({ path, text }) => (window as unknown as RecentMockWindow).__recentMock.seed(path, text),
    { path, text },
  );
const home = (page: Page) => page.getByRole('region', { name: '开始' });
const search = (page: Page) => page.getByRole('dialog', { name: '快速打开' });
const calls = (page: Page, command: string) =>
  page.evaluate(
    (command) =>
      (window as TestWindow).__desktopMock.calls.filter((call) => call.command === command),
    command,
  );
const menu = (page: Page, action: string) =>
  page.evaluate((action) => (window as TestWindow).__desktopMock.emitMenu(action), action);

test('a window with nothing open starts on the home view and keeps the editor out of reach', async ({
  page,
}) => {
  await boot(page);
  await expect(home(page)).toBeVisible();
  await expect(home(page).getByRole('heading', { level: 1 })).toHaveText(/.+/);
  await expect(home(page).getByRole('button', { name: /新建笔记/ })).toContainText('Ctrl N');
  await expect(home(page).getByRole('button', { name: /打开笔记/ })).toContainText('Ctrl Shift P');
  await expect(home(page).getByText('最近打开的笔记会显示在这里。')).toBeVisible();
  await expect(page.locator('.runtime-editor-mount')).toHaveAttribute('inert', '');
  expect(
    (await calls(page, 'sync_editor_menu_state')).some((call) =>
      Boolean((call.args.snapshot as { home?: boolean }).home),
    ),
  ).toBe(true);
});

test('macOS wording uses the command symbols', async ({ page }) => {
  await boot(page, { host: 'macos' });
  await expect(home(page).getByRole('button', { name: /新建笔记/ })).toContainText('⌘N');
  await expect(home(page).getByRole('button', { name: /打开笔记/ })).toContainText('⌘⇧P');
});

test('recent notes are listed, newest first, and open from the home view', async ({ page }) => {
  await boot(page);
  await seed(page, '/mock/Notes/Older.md', '# Older');
  await seed(page, '/mock/Notes/Plan.md', '# Plan');
  const rows = home(page).locator('.home-recent button');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Plan');
  await expect(rows.first()).toContainText('Notes');
  await expect(rows.first()).toContainText('刚刚');
  await expect(rows.nth(1)).toContainText('Older');
  await rows.first().click();
  await expect(home(page)).toBeHidden();
  await expect(page.locator('.runtime-editor-mount')).not.toHaveAttribute('inert', /.*/);
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toContainText('Plan');
});

test('New Note and Ctrl+N start writing in this window instead of opening another', async ({
  page,
}) => {
  await boot(page);
  await home(page)
    .getByRole('button', { name: /新建笔记/ })
    .click();
  await expect(home(page)).toBeHidden();
  await page.frameLocator('.marklyra-editor-frame').locator('#write').click();
  await page.keyboard.type('第一行');
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toContainText(
    '第一行',
  );
  expect(await calls(page, 'create_editor_window')).toEqual([]);
});

test('Ctrl+N on the home view writes here; once writing, it opens a new window again', async ({
  page,
}) => {
  await boot(page);
  await menu(page, 'new');
  await expect(home(page)).toBeHidden();
  expect(await calls(page, 'create_editor_window')).toEqual([]);
  await menu(page, 'new');
  await expect.poll(async () => (await calls(page, 'create_editor_window')).length).toBe(1);
});

test('Open Note searches the folder and recent files; Enter opens the chosen one', async ({
  page,
}) => {
  await boot(page);
  await seed(page, '/mock/Notes/Plan.md', '# Plan');
  await home(page)
    .getByRole('button', { name: /打开笔记/ })
    .click();
  const window = search(page);
  await expect(window).toBeVisible();
  await expect(window.getByRole('tab', { name: '笔记' })).toHaveAttribute('aria-selected', 'true');
  await expect(window.getByRole('combobox', { name: '输入命令或搜索' })).toBeFocused();
  const options = window.getByRole('option');
  await expect(options.filter({ hasText: 'Plan' })).toHaveCount(1);
  await expect(options.filter({ hasText: 'Existing' })).toHaveCount(1);
  // Recent files come first; the typed words narrow the list and are marked in the title.
  await expect(options.first()).toContainText('Plan');
  await page.keyboard.type('exist');
  await expect(options).toHaveCount(1);
  await expect(options.first().locator('mark')).toHaveText('Exist');
  await page.keyboard.press('Enter');
  await expect(window).toBeHidden();
  await expect.poll(async () => (await calls(page, 'open_workspace_document')).length).toBe(1);
  expect((await calls(page, 'open_workspace_document'))[0]?.args).toMatchObject({
    relativePath: 'Existing.md',
  });
  await expect(home(page)).toBeHidden();
});

test('keyboard: arrows move, Tab changes the scope, Escape closes and returns to the home view', async ({
  page,
}) => {
  await boot(page);
  await seed(page, '/mock/Notes/A.md', 'a');
  await seed(page, '/mock/Notes/B.md', 'b');
  await menu(page, 'quick-open');
  const window = search(page);
  await expect(window.getByRole('tab', { name: '全部' })).toHaveAttribute('aria-selected', 'true');
  const options = window.getByRole('option');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Tab');
  await expect(window.getByRole('tab', { name: '操作' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Shift+Tab');
  await expect(window.getByRole('tab', { name: '全部' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.type('没有这个东西');
  await expect(window.getByText('没有匹配的结果')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(window).toBeHidden();
  await expect(home(page)).toBeFocused();
});

test('the all tab groups notes, actions, folders and settings; an action runs through the menu', async ({
  page,
}) => {
  await boot(page);
  await seed(page, '/mock/Notes/A.md', 'a');
  await menu(page, 'quick-open');
  const window = search(page);
  for (const heading of ['笔记', '操作', '工作区', '设置'])
    await expect(window.locator('.quick-open-heading', { hasText: heading })).toBeVisible();
  // Nothing that needs an open document is offered on the home view.
  await expect(window.getByRole('option', { name: /^保存/ })).toHaveCount(0);
  await expect(window.getByRole('option', { name: /重命名/ })).toHaveCount(0);
  await expect(window.getByRole('option', { name: /新建笔记/ })).toContainText('Ctrl+N');
  await page.keyboard.type('新建笔记');
  await page.keyboard.press('Enter');
  await expect(window).toBeHidden();
  await expect(home(page)).toBeHidden();
});

test('with a document open the actions that work on it appear', async ({ page }) => {
  await boot(page);
  await menu(page, 'open');
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write > p')).toHaveText(
    'Alpha',
  );
  await expect(home(page)).toHaveCount(0);
  await menu(page, 'quick-open');
  const window = search(page);
  await page.getByRole('tab', { name: '操作' }).click();
  await expect(window.getByRole('option', { name: /^保存/ })).toContainText('Ctrl+S');
  await expect(window.getByRole('option', { name: /另存为/ })).toBeVisible();
  await expect(window.getByRole('option', { name: /源代码模式/ })).toBeVisible();
  await page.keyboard.type('另存');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await calls(page, 'save_document_as')).length).toBe(1);
});

test('only the primary window shows the home view', async ({ page }) => {
  await boot(page, { label: 'editor-2', workspace: false });
  await expect(page.locator('.runtime-editor-mount')).not.toHaveAttribute('inert', /.*/);
  await expect(home(page)).toHaveCount(0);
  await page.frameLocator('.marklyra-editor-frame').locator('#write').click();
  await page.keyboard.type('直接写');
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toContainText(
    '直接写',
  );
});

const backHome = (page: Page) => page.getByRole('button', { name: '回到首页' });
const openAlpha = async (page: Page) => {
  await menu(page, 'open');
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write > p')).toHaveText(
    'Alpha',
  );
  await expect(home(page)).toHaveCount(0);
};

test('the titlebar Home button closes the document and returns to the home view', async ({
  page,
}) => {
  await boot(page);
  // There is nothing to go back from while the home view is showing.
  await expect(backHome(page)).toHaveCount(0);
  await openAlpha(page);
  await backHome(page).click();
  await expect(home(page)).toBeVisible();
  await expect(page.locator('.runtime-editor-mount')).toHaveAttribute('inert', '');
  await expect(backHome(page)).toHaveCount(0);
  await expect(page.locator('.titlebar-title-button')).toHaveCount(0);
  expect((await calls(page, 'close_document')).map((call) => call.args.id)).toContain('doc-a');
  // The window is usable again from there: Ctrl+N writes, Open works.
  await menu(page, 'open');
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write > p')).toHaveText(
    'Alpha',
  );
  await expect(home(page)).toHaveCount(0);
});

test('closing a document with unsaved changes asks first; Cancel keeps it, Discard goes home', async ({
  page,
}) => {
  await boot(page);
  await openAlpha(page);
  const editor = page.frameLocator('.marklyra-editor-frame');
  await editor.locator('#write > p').click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await backHome(page).click();
  const dialog = page.getByRole('dialog', { name: '保存当前更改？' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(home(page)).toHaveCount(0);
  await expect(editor.locator('#write > p')).toHaveText('AlphaX');
  await backHome(page).click();
  await dialog.getByRole('button', { name: '放弃修改', exact: true }).click();
  await expect(home(page)).toBeVisible();
  expect(await calls(page, 'save_document')).toEqual([]);
});

for (const host of ['windows', 'macos'] as const) {
  test(`${host}: File > Close Document returns home, and does nothing on the home view`, async ({
    page,
  }) => {
    await boot(page, { host });
    await menu(page, 'close-document');
    await expect(home(page)).toBeVisible();
    await openAlpha(page);
    await menu(page, 'close-document');
    await expect(home(page)).toBeVisible();
    expect((await calls(page, 'close_document')).length).toBe(1);
    await menu(page, 'close-document');
    await expect(home(page)).toBeVisible();
    expect((await calls(page, 'close_document')).length).toBe(1);
  });
}

test('the search window offers Home while a document is open, and not on the home view', async ({
  page,
}) => {
  await boot(page);
  await menu(page, 'quick-open');
  await expect(search(page).getByRole('option', { name: /回到首页/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await openAlpha(page);
  await menu(page, 'quick-open');
  await page.keyboard.type('首页');
  await page.keyboard.press('Enter');
  await expect(home(page)).toBeVisible();
});

test('any window returns to the home view after its document is closed', async ({ page }) => {
  await boot(page, { label: 'editor-2', workspace: false });
  await expect(home(page)).toHaveCount(0);
  await openAlpha(page);
  await backHome(page).click();
  await expect(home(page)).toBeVisible();
});
