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

async function openTree(page: Page, theme = 'marklyra-light') {
  await readyLayout(page, theme);
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

  for (const theme of ['marklyra-light', 'marklyra-dark']) {
    test(`${host} ${theme}: tree spacing, first-level indent and count centers stay aligned`, async ({
      page,
    }, info) => {
      await installFolders(page, host);
      await openTree(page, theme);
      await expect(count(page, 'Folder')).toHaveText('3');
      await page.locator('button[data-entry-path="Folder"]').click();
      await expect(count(page, 'Folder/Inner')).toHaveText('2');
      const divider = page.getByRole('separator', { name: '调整侧栏宽度' });
      for (const width of ['narrow', 'wide']) {
        await divider.press(width === 'narrow' ? 'Home' : 'End');
        await page.locator('.sidebar').hover();
        const geometry = await page.evaluate(() => {
          const box = (selector: string) => {
            const element = document.querySelector(selector);
            if (!element) throw Error(`Missing tree geometry: ${selector}`);
            return element.getBoundingClientRect();
          };
          const centerX = (rect: DOMRect) => rect.left + rect.width / 2;
          const centerY = (rect: DOMRect) => rect.top + rect.height / 2;
          const header = box('.workspace-navigation-header');
          const root = box('.workspace-navigation-header .workspace-root-row > .workspace-glyph');
          const firstRow = box('button[data-entry-path="Big"]');
          const first = box('button[data-entry-path="Big"] > .workspace-glyph');
          const second = box('button[data-entry-path="Empty"] > .workspace-glyph');
          const parent = box('button[data-entry-path="Folder"] > .workspace-glyph');
          const child = box('button[data-entry-path="Folder/Inner"] > .workspace-glyph');
          const search = box('.sidebar-header-action[aria-label="全文搜索"] .ui-icon');
          return {
            headerGap: firstRow.top - header.bottom,
            rowHeight: firstRow.height,
            rowGap: centerY(second) - centerY(first),
            firstIndent: first.left - centerX(root),
            nestedIndent: child.left - parent.left,
            counts: ['Big', 'Folder', 'Folder/Inner'].map((path) => {
              const number = box(`button[data-entry-path="${path}"] .workspace-tree-count`);
              const name = box(`button[data-entry-path="${path}"] .workspace-tree-name`);
              return {
                columnOffset: centerX(number) - centerX(search),
                lineOffset: centerY(number) - centerY(name),
              };
            }),
          };
        });
        // The 40px navigation row is taller than a tree row; their edges stay contiguous.
        expect(Math.abs(geometry.headerGap)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.rowHeight - geometry.rowGap)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.firstIndent)).toBeLessThanOrEqual(1);
        expect(geometry.nestedIndent).toBe(8);
        for (const number of geometry.counts) {
          expect(Math.abs(number.columnOffset)).toBeLessThanOrEqual(1);
          expect(Math.abs(number.lineOffset)).toBeLessThanOrEqual(1);
        }
        await page.locator('.sidebar').screenshot({ path: info.outputPath(`tree-${width}.png`) });
      }
    });
  }
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
