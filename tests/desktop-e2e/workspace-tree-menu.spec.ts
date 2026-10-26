import { expect, type Page, test } from '@playwright/test';
import { installCreationMock } from './creation-test-util.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';
import { installRenameMock } from './rename-test-util.js';
import { installTrashMock } from './trash-test-util.js';
import { openWorkspaceRootMenu } from './workspace-context.helpers.js';

const runtimeUrl = process.env.CREATION_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html';

/** `host` 'windows' models the WebView host (HTML menu, Windows wording); 'macos' the AppKit one. */
async function boot(page: Page, host: 'windows' | 'macos') {
  await page.addInitScript(installMock, {
    nativeChrome: true,
    titlebar: (host === 'windows' ? 'web' : 'appkit') as 'web' | 'appkit',
  });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installCreationMock, { runtimeUrl });
  await page.addInitScript(installRenameMock);
  await page.addInitScript(installTrashMock);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const mock = Reflect.get(window, '__creationMock') as { entries: unknown[] };
    mock.entries.push({ name: 'Empty', relativePath: 'Empty', kind: 'directory', size: null });
    mock.entries.push({
      name: 'Nested.md',
      relativePath: 'Folder/Nested.md',
      kind: 'file',
      size: 5,
    });
  });
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.workspace-root-row')).toHaveText('Creation');
  await expect(page.locator('.workspace-directory-tree > .workspace-branch')).toHaveAttribute(
    'aria-busy',
    'false',
  );
}

const menuLabels = (page: Page) =>
  page.locator('.workspace-entry-menu [role^="menuitem"]').allTextContents();

for (const host of ['windows', 'macos'] as const) {
  test(`${host}: a document's menu has no new-folder item and uses the system's wording`, async ({
    page,
  }) => {
    await boot(page, host);
    await page.locator('[data-entry-path="Existing.md"]').click({ button: 'right' });
    const labels = (await menuLabels(page)).map((label) => label.replace(/^✓/, ''));
    expect(labels).not.toContain('新建文件夹');
    expect(labels).toContain('新建文件');
    if (host === 'windows') {
      expect(labels).toContain('在文件资源管理器中显示');
      expect(labels).toContain('创建副本');
      expect(labels).toContain('属性…');
      expect(labels.join('|')).not.toMatch(/Finder|制作副本|简介/);
    } else {
      expect(labels).toContain('在 Finder 中显示');
      expect(labels).toContain('制作副本');
      expect(labels).toContain('显示简介…');
    }
    // Groups are separated by single rules, never leading, trailing or doubled.
    const structure = await page
      .locator('.workspace-entry-menu')
      .evaluate((menu) => [...menu.children].map((child) => child.tagName));
    expect(structure[0]).toBe('BUTTON');
    expect(structure.at(-1)).toBe('BUTTON');
    expect(structure.join(',')).not.toContain('HR,HR');
  });

  test(`${host}: a folder's menu offers new file and new folder, and the background keeps both`, async ({
    page,
  }) => {
    await boot(page, host);
    await page.locator('[data-entry-path="Folder"]').click({ button: 'right' });
    const folder = await menuLabels(page);
    expect(folder).toEqual(expect.arrayContaining(['新建文件', '新建文件夹']));
    await page.keyboard.press('Escape');
    await openWorkspaceRootMenu(page);
    const root = await menuLabels(page);
    expect(root).toEqual(expect.arrayContaining(['新建文件', '新建文件夹']));
  });
}

test('an empty folder says nothing and a document switch never dims or blurs the tree', async ({
  page,
}) => {
  await boot(page, 'windows');
  await page.locator('[data-entry-path="Empty"]').click();
  await expect(page.locator('[data-entry-path="Empty"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-entry-path="Empty"] ~ div .workspace-branch')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByText('没有 Markdown 文件或子目录')).toHaveCount(0);
  await expect(page.locator('[data-entry-path="Empty"] ~ div .workspace-hint')).toHaveCount(0);
  await page.locator('[data-entry-path="Folder"]').click();
  await expect(page.locator('[data-entry-path="Folder/Nested.md"]')).toBeVisible();
  // While a document opens, rows stay enabled: a disabled button is dimmed and loses focus.
  const second = page.locator('[data-entry-path="Existing.md"]');
  await second.focus();
  await page.evaluate(() => {
    const samples: string[] = [];
    Reflect.set(window, '__rowSamples', samples);
    const watch = () => {
      for (const row of document.querySelectorAll<HTMLButtonElement>('button.workspace-tree-row')) {
        const style = getComputedStyle(row);
        if (row.disabled || style.opacity !== '1')
          samples.push(`${row.dataset.entryPath}:${style.opacity}`);
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  await page.locator('[data-entry-path="Folder/Nested.md"]').click();
  await expect(page.locator('[data-entry-path="Folder/Nested.md"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => Reflect.get(window, '__rowSamples'))).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls.filter(
          (c) => c.command === 'open_workspace_document',
        ).length,
    ),
  ).toBeGreaterThan(0);
});

test('opening a document inside a folder reveals it in the tree', async ({ page }) => {
  await page.addInitScript(installMock, { nativeChrome: true, titlebar: 'web' as const });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installCreationMock, { runtimeUrl });
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const host = window as unknown as {
      __creationMock: { entries: unknown[] };
      __desktopMock: { startupBoot: { document: unknown }; nextDocument: unknown };
    };
    host.__creationMock.entries.push({
      name: 'Nested.md',
      relativePath: 'Folder/Nested.md',
      kind: 'file',
      size: 5,
    });
    host.__desktopMock.startupBoot.document = {
      id: 'nested-document',
      path: '/mock/Creation/Folder/Nested.md',
      text: 'Alpha',
      encoding: 'UTF-8',
    };
    host.__desktopMock.nextDocument = { ...(host.__desktopMock.startupBoot.document as object) };
  });
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  const nested = page.locator('button[data-entry-path="Folder/Nested.md"]');
  await expect(nested).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('button[data-entry-path="Folder"]')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  // The user can still fold the folder away again.
  await page.locator('button[data-entry-path="Folder"]').click();
  await expect(page.locator('button[data-entry-path="Folder"]')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('F2 renames and Delete deletes the focused row; text fields keep their own keys', async ({
  page,
}) => {
  await boot(page, 'windows');
  const row = page.locator('button[data-entry-path="Existing.md"]');
  await row.focus();
  await page.keyboard.press('F2');
  const input = page.getByRole('textbox', { name: '文件名', exact: true });
  await expect(input).toBeFocused();
  // Delete inside the name field edits the text and never deletes the file.
  await page.keyboard.press('Delete');
  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as TestWindow).__desktopMock.calls.filter((c) =>
          c.command.includes('trash'),
        ).length,
    ),
  ).toBe(0);
  await row.focus();
  await page.keyboard.press('Delete');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as TestWindow).__desktopMock.calls.filter((c) =>
            c.command.includes('trash'),
          ).length,
      ),
    )
    .toBeGreaterThan(0);
});
