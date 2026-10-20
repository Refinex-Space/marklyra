import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

/** `windows` models the WebView host that draws its own titlebar; `macos` the AppKit one. */
async function boot(page: Page, host: 'windows' | 'macos', open = true) {
  await page.addInitScript(installMock, {
    nativeChrome: true,
    titlebar: (host === 'windows' ? 'web' : 'appkit') as 'web' | 'appkit',
  });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(() => localStorage.setItem('marklyra-autosave', 'false'));
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  if (open) {
    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('open'));
    await expect(page.frameLocator('.marklyra-editor-frame').locator('#write > p')).toHaveText(
      'Alpha',
    );
  }
}

const renameCalls = (page: Page) =>
  page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls.filter((c) => c.command === 'rename_document_file'),
  );
const popover = (page: Page) => page.getByRole('dialog', { name: '重命名文稿' });

test('windows: the title opens a flyout with the stem selected and Enter renames the file', async ({
  page,
}) => {
  await boot(page, 'windows');
  const title = page.locator('.titlebar-title-button');
  await expect(title).toContainText('A.md');
  await title.hover();
  await expect(page.locator('.titlebar-title-chevron')).toHaveCSS('opacity', '1');
  await title.click();
  const flyout = popover(page);
  await expect(flyout).toBeVisible();
  await expect(flyout).toHaveAttribute('data-platform', 'windows');
  const input = flyout.getByRole('textbox');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('A.md');
  expect(
    await input.evaluate((field: HTMLInputElement) => [field.selectionStart, field.selectionEnd]),
  ).toEqual([0, 1]);
  await page.keyboard.type('季度报告');
  await page.keyboard.press('Enter');
  await expect(flyout).toBeHidden();
  await expect(title).toContainText('季度报告.md');
  const [call] = await renameCalls(page);
  expect(call?.args).toMatchObject({ documentId: 'doc-a', newName: '季度报告.md' });
  expect(typeof call?.args.operationId).toBe('string');
  // The editor is handed back its caret and the text is untouched.
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write > p')).toHaveText(
    'Alpha',
  );
});

test('windows: a name without a Markdown extension keeps the old one', async ({ page }) => {
  await boot(page, 'windows');
  await page.locator('.titlebar-title-button').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('日记');
  await page.keyboard.press('Enter');
  await expect(page.locator('.titlebar-title-button')).toContainText('日记.md');
  expect((await renameCalls(page))[0]?.args.newName).toBe('日记.md');
});

test('windows: Escape cancels, an unchanged name asks nothing of the host', async ({ page }) => {
  await boot(page, 'windows');
  const title = page.locator('.titlebar-title-button');
  await title.click();
  await page.keyboard.type('other');
  await page.keyboard.press('Escape');
  await expect(popover(page)).toBeHidden();
  await expect(title).toContainText('A.md');
  await title.click();
  await page.keyboard.press('Enter');
  await expect(popover(page)).toBeHidden();
  expect(await renameCalls(page)).toEqual([]);
});

test('windows: clicking elsewhere confirms, and pressing the title again closes it', async ({
  page,
}) => {
  await boot(page, 'windows');
  const title = page.locator('.titlebar-title-button');
  await title.click();
  await page.keyboard.type('moved');
  await page
    .locator('.sidebar, .workspace')
    .first()
    .click({ position: { x: 20, y: 300 } });
  await expect(popover(page)).toBeHidden();
  await expect(title).toContainText('moved.md');
  await title.click();
  await expect(popover(page)).toBeVisible();
  await title.click();
  await expect(popover(page)).toBeHidden();
  expect(await renameCalls(page)).toHaveLength(1);
});

test('windows: illegal characters and host refusals show inline and keep the flyout open', async ({
  page,
}) => {
  await boot(page, 'windows');
  await page.locator('.titlebar-title-button').click();
  const flyout = popover(page);
  await page.keyboard.type('a:b');
  await page.keyboard.press('Enter');
  await expect(flyout.getByRole('alert')).toHaveText('名称不能包含 : * ? " < > |');
  expect(await renameCalls(page)).toEqual([]);
  // Editing clears the message; a host refusal is shown the same way.
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('taken');
  await expect(flyout.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.renameError = '已存在同名文件';
  });
  await page.keyboard.press('Enter');
  await expect(flyout.getByRole('alert')).toHaveText('已存在同名文件');
  await expect(flyout).toBeVisible();
  await expect(flyout.getByRole('textbox')).toHaveValue('taken');
  // Fixing the name completes the rename on the next try.
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('free');
  await page.keyboard.press('Enter');
  await expect(flyout).toBeHidden();
  await expect(page.locator('.titlebar-title-button')).toContainText('free.md');
});

test('windows: Enter that confirms an IME candidate does not rename', async ({ page }) => {
  await boot(page, 'windows');
  await page.locator('.titlebar-title-button').click();
  const input = popover(page).getByRole('textbox');
  await input.evaluate((field) => {
    field.dispatchEvent(new CompositionEvent('compositionstart'));
    field.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        keyCode: 229,
        bubbles: true,
        isComposing: true,
      }),
    );
  });
  await expect(popover(page)).toBeVisible();
  expect(await renameCalls(page)).toEqual([]);
});

test('windows: rename warnings reach the status message', async ({ page }) => {
  await boot(page, 'windows');
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.renameWarnings = ['部分最近记录未能更新'];
  });
  await page.locator('.titlebar-title-button').click();
  await page.keyboard.type('x');
  await page.keyboard.press('Enter');
  await expect(page.locator('.native-document-notice')).toContainText('部分最近记录未能更新');
});

test('an untitled document has no rename entry and the menu item changes nothing', async ({
  page,
}) => {
  await boot(page, 'windows', false);
  await expect(page.locator('.titlebar-title-button')).toHaveCount(0);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('rename-document'));
  await expect(popover(page)).toBeHidden();
});

for (const host of ['windows', 'macos'] as const) {
  test(`${host}: the File menu action opens the popover under the title`, async ({ page }) => {
    await boot(page, host);
    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('rename-document'));
    const flyout = popover(page);
    await expect(flyout).toBeVisible();
    await expect(flyout).toHaveAttribute('data-platform', host === 'windows' ? 'windows' : 'mac');
    const box = await flyout.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    // Hangs from the titlebar band, horizontally inside the window.
    expect(box?.y ?? 0).toBeGreaterThan(24);
    expect(box?.y ?? 0).toBeLessThan(60);
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
    await page.keyboard.press('Escape');
    await expect(flyout).toBeHidden();
  });
}

test('macos: the native rename action opens the shared popover with the name label', async ({
  page,
}) => {
  await boot(page, 'macos');
  await expect(page.locator('.titlebar')).toHaveCount(0);
  // AppKit hit testing is covered by titlebar-layout-native; this verifies its Shell event route.
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('rename-document'));
  const flyout = popover(page);
  await expect(flyout.locator('.document-name-label')).toHaveText('名称：');
  await page.keyboard.type('Notes');
  await page.keyboard.press('Enter');
  await expect(flyout).toBeHidden();
  expect((await renameCalls(page))[0]?.args.newName).toBe('Notes.md');
});

for (const host of ['windows', 'macos'] as const) {
  test(`${host}: editor frame text and blank space dismiss the rename popover`, async ({
    page,
  }) => {
    await boot(page, host);
    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('rename-document'));
    const flyout = popover(page);
    await flyout.getByRole('textbox').fill('Moved.md');
    await page
      .frameLocator('.marklyra-editor-frame')
      .locator('#write > p')
      .click({ position: { x: 5, y: 5 } });
    await expect(flyout).toBeHidden();
    expect((await renameCalls(page)).map((call) => call.args.newName)).toEqual(['Moved.md']);

    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('rename-document'));
    await expect(flyout.getByRole('textbox')).toBeFocused();
    await page
      .frameLocator('.marklyra-editor-frame')
      .locator('body')
      .click({ position: { x: 500, y: 350 } });
    await expect(flyout).toBeHidden();
    expect(await renameCalls(page)).toHaveLength(1);
  });

  test(`${host}: internal clicks and window blur do not dismiss, outside IME commit waits for completion`, async ({
    page,
  }) => {
    await boot(page, host);
    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('rename-document'));
    const flyout = popover(page);
    const input = flyout.getByRole('textbox');
    await input.click();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(flyout).toBeVisible();
    expect(await renameCalls(page)).toHaveLength(0);

    await input.dispatchEvent('compositionstart');
    await input.fill('中文文稿.md');
    await page
      .frameLocator('.marklyra-editor-frame')
      .locator('#write > p')
      .click({ position: { x: 5, y: 5 } });
    await expect(flyout).toBeVisible();
    expect(await renameCalls(page)).toHaveLength(0);
    await input.dispatchEvent('compositionend', { data: '中文文稿' });
    await expect(flyout).toBeHidden();
    expect((await renameCalls(page)).map((call) => call.args.newName)).toEqual(['中文文稿.md']);
  });
}
