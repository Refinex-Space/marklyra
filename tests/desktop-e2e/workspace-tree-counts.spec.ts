import { expect, type Page, test } from '@playwright/test';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

/** The host lists two folders beside the documents and counts 7 / 3 / 0 documents in them. */
async function installFolders(page: Page, host: 'windows' | 'macos') {
  await installLayout(page, undefined, host === 'windows' ? 'web' : undefined);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const original = internal.invoke;
    const counts: Record<string, unknown>[] = [];
    Reflect.set(window, '__counts', counts);
    internal.invoke = async (command, args = {}) => {
      if (command === 'count_workspace_documents') {
        counts.push(args);
        return {
          counts: { '': 7, Folder: 3, 'Folder/Inner': 2, Big: 12000 },
          scannedEntries: 12,
          truncated: false,
        };
      }
      if (command === 'list_directory') {
        const listing = (await original(command, args)) as { entries: unknown[] };
        const path = String(args.relativePath ?? '');
        if (path === '')
          return {
            ...listing,
            entries: [
              ...listing.entries,
              { name: 'Folder', relativePath: 'Folder', kind: 'directory', size: null },
              { name: 'Empty', relativePath: 'Empty', kind: 'directory', size: null },
              { name: 'Big', relativePath: 'Big', kind: 'directory', size: null },
            ],
          };
        if (path === 'Folder')
          return {
            ...listing,
            entries: [
              { name: 'Inner', relativePath: 'Folder/Inner', kind: 'directory', size: null },
              { name: 'note.md', relativePath: 'Folder/note.md', kind: 'file', size: 4 },
            ],
          };
        return { ...listing, entries: [] };
      }
      return original(command, args);
    };
  });
}

async function openTree(page: Page) {
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page);
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:files');
  await expect(page.locator('button[data-entry-path="Folder"]')).toBeVisible();
}
const count = (page: Page, path: string) =>
  page.locator(`button[data-entry-path="${path}"] .workspace-tree-count`);

for (const host of ['windows', 'macos'] as const) {
  test(`${host}: folders show their recursive document count and hide zero`, async ({ page }) => {
    await installFolders(page, host);
    await openTree(page);
    await expect(count(page, 'Folder')).toHaveText('3');
    // A folder without documents shows nothing, not a 0.
    await expect(page.locator('button[data-entry-path="Empty"]')).toBeVisible();
    await expect(count(page, 'Empty')).toHaveCount(0);
    // Huge folders stay one short token.
    await expect(count(page, 'Big')).toHaveText('9999+');
    // Counts exist for nested folders too, and documents never get one.
    await page.locator('button[data-entry-path="Folder"]').click();
    await expect(count(page, 'Folder/Inner')).toHaveText('2');
    await expect(
      page.locator('button[data-entry-path="Folder/note.md"] .workspace-tree-count'),
    ).toHaveCount(0);
  });

  test(`${host}: the numbers sit in the search icon's column, on the name's line`, async ({
    page,
  }) => {
    await installFolders(page, host);
    await openTree(page);
    await page.locator('.sidebar').hover();
    const geometry = await page.evaluate(() => {
      const icon = document.querySelector<HTMLElement>(
        '.sidebar-header-action[aria-label="全文搜索"] .ui-icon',
      );
      const number = document.querySelector<HTMLElement>(
        'button[data-entry-path="Folder"] .workspace-tree-count',
      );
      const name = document.querySelector<HTMLElement>(
        'button[data-entry-path="Folder"] .workspace-tree-name',
      );
      if (!icon || !number || !name) throw Error('Missing tree geometry');
      const a = icon.getBoundingClientRect();
      const b = number.getBoundingClientRect();
      const c = name.getBoundingClientRect();
      return {
        iconRight: a.right,
        numberRight: b.right,
        numberMiddle: b.top + b.height / 2,
        nameMiddle: c.top + c.height / 2,
      };
    });
    // Right edges line up with the search icon; the number sits on the folder name's line.
    expect(Math.abs(geometry.numberRight - geometry.iconRight)).toBeLessThanOrEqual(2);
    expect(Math.abs(geometry.numberMiddle - geometry.nameMiddle)).toBeLessThanOrEqual(2);
  });
}

test('the setting hides and restores the counts and defaults to on', async ({ page }) => {
  await installFolders(page, 'windows');
  await openTree(page);
  await expect(count(page, 'Folder')).toBeVisible();
  const stored = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem('marklyra-preferences-v1') ?? '{}').fileSidebar,
    );
  expect((await stored())?.showDocumentCounts ?? true).toBe(true);

  await emitLayoutMenu(page, 'preferences');
  const ui = page.frameLocator('.runtime-preferences-frame');
  await expect(ui.getByRole('button', { name: '返回应用', exact: true })).toBeVisible();
  // Under 文件, in its own 目录树 card, on by default.
  const toggle = ui.getByRole('checkbox', { name: '显示目录文档数量', exact: true });
  await expect(toggle).toBeChecked();
  await expect(ui.locator('.settings-tree-group')).toHaveAttribute('data-section-title', '目录树');
  await toggle.uncheck();
  await expect.poll(async () => (await stored())?.showDocumentCounts).toBe(false);
  await ui.getByRole('button', { name: '返回应用', exact: true }).click();
  await expect(page.locator('.preferences-page')).toHaveCount(0);
  await expect(page.locator('button[data-entry-path="Folder"]')).toBeVisible();
  await expect(page.locator('.workspace-tree-count')).toHaveCount(0);

  await emitLayoutMenu(page, 'preferences');
  const again = ui.getByRole('checkbox', { name: '显示目录文档数量', exact: true });
  await expect(again).not.toBeChecked();
  await again.check();
  await expect.poll(async () => (await stored())?.showDocumentCounts).toBe(true);
  await ui.getByRole('button', { name: '返回应用', exact: true }).click();
  await expect(count(page, 'Folder')).toHaveText('3');
});

test('a host that cannot count leaves the tree plain and raises no error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // The plain layout host answers unknown commands with nothing.
  await installLayout(page);
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page);
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:files');
  await expect(page.locator('button.workspace-tree-row').first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('.workspace-tree-count')).toHaveCount(0);
  expect(errors).toEqual([]);
});
