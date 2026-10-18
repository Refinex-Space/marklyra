import { expect, type Page, test } from '@playwright/test';
import type { WorkspaceArticlesReport } from '../../apps/desktop/src/services/workspaces.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

const source = 'Alpha beta\r\n\r\nTail';
function installLibrary() {
  if (window !== window.top) return;
  const host = window as unknown as TestWindow & {
    __TAURI_INTERNALS__: {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    libraryProbe: { reads: number; opened: string[] };
  };
  const original = host.__TAURI_INTERNALS__.invoke;
  host.libraryProbe = { reads: 0, opened: [] };
  const texts: Record<string, string> = {
    'Chapter2.md': 'Alpha beta\r\n\r\nTail',
    'Chapter10.md': 'Beta document',
    'Project/notes.md': '---\ntitle: 标题\nsubtitle: 子标题\nsummary: 摘要\n---\n\nBody',
  };
  host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command === 'select_workspace')
      return { id: 'library', name: 'Library', path: '/mock/library' };
    if (command === 'close_workspace') return null;
    if (command === 'list_workspace_documents') {
      host.libraryProbe.reads++;
      const report: WorkspaceArticlesReport = {
        entries: Object.entries(texts).map(([relativePath, summary], index) => ({
          name: relativePath.split('/').at(-1) ?? '',
          relativePath,
          folderName: relativePath.includes('/') ? 'Project' : 'Library',
          folderRelativePath: relativePath.includes('/') ? 'Project' : '',
          summary,
          summaryTruncated: false,
          size: summary.length,
          modifiedAt: 2000 + index * 1000,
          createdAt: 1000 + index * 1000,
        })),
        truncated: false,
        scannedFiles: 3,
        scannedEntries: 4,
        readBytes: 100,
        skipped: {
          symlinks: 0,
          unsupportedNames: 0,
          unreadable: 0,
          unsupportedEncoding: 0,
          ignored: 0,
        },
        truncationReasons: [],
      };
      return report;
    }
    if (command === 'list_directory') {
      const relative = String(args.relativePath ?? '');
      return {
        entries:
          relative === ''
            ? [
                { name: 'Project', relativePath: 'Project', kind: 'directory', size: null },
                { name: 'Chapter2.md', relativePath: 'Chapter2.md', kind: 'file', size: 20 },
                { name: 'Chapter10.md', relativePath: 'Chapter10.md', kind: 'file', size: 10 },
              ]
            : [{ name: 'notes.md', relativePath: 'Project/notes.md', kind: 'file', size: 30 }],
        truncated: false,
        skipped: 0,
      };
    }
    if (command === 'open_workspace_document') {
      const path = String(args.relativePath);
      host.libraryProbe.opened.push(path);
      const document = {
        id: `library-${path}`,
        path: `/mock/library/${path}`,
        text: texts[path] ?? '',
        encoding: 'UTF-8',
      };
      host.__desktopMock.nextDocument = document;
      return document;
    }
    if (command === 'save_document') {
      const result = (await original(command, args)) as {
        id: string;
        text: string;
        encoding: string;
      };
      const path = host.__desktopMock.nextDocument.path.replace('/mock/library/', '');
      texts[path] = String(args.text);
      // The generic helper models /mock/A.md. A normal workspace Save must keep
      // its actual path, or the card correctly stops being the active document.
      const saved = { ...result, path: `/mock/library/${path}` };
      host.__desktopMock.nextDocument = saved;
      return saved;
    }
    return original(command, args);
  };
}

async function start(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installLibrary);
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.sidebar-current-title')).toHaveText('文档');
  await page.locator('.sidebar').hover();
  await page.getByRole('button', { name: '目录菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '打开文件夹…', exact: true }).click();
  await expect(page.locator('[data-article-path]')).toHaveCount(3);
  return errors;
}
async function firstParagraphEnd(page: Page) {
  await page
    .frameLocator('.marklyra-editor-frame')
    .locator('#write > p')
    .first()
    .evaluate((p) => {
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode();
      if (!text) throw Error('Missing actual paragraph text');
      p.closest<HTMLElement>('#write')?.focus();
      getSelection()?.setBaseAndExtent(
        text,
        text.textContent?.length ?? 0,
        text,
        text.textContent?.length ?? 0,
      );
    });
}
async function menu(page: Page, action: string) {
  await page.evaluate((action) => (window as TestWindow).__desktopMock.emitMenu(action), action);
}
async function saved(page: Page) {
  return page.evaluate(
    () =>
      (window as TestWindow).__desktopMock.calls
        .filter((call) => call.command === 'save_document')
        .at(-1)?.args.text,
  );
}

test('real editor updates the active card through input and one Undo/Redo without recreating the frame', async ({
  page,
}) => {
  const errors = await start(page);
  const card = page.locator('[data-article-path="Chapter2.md"]');
  await card.click();
  const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
  await expect(write).toHaveText('Alpha betaTail');
  const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  await firstParagraphEnd(page);
  await page.keyboard.type('X');
  await expect(card.locator('.workspace-article-summary')).toContainText('Alpha betaX');
  await menu(page, 'save');
  await expect.poll(() => saved(page)).toBe(source.replace('beta', 'betaX'));
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(card).toHaveAttribute('aria-current', 'page');
  await menu(page, 'undo');
  await expect(card.locator('.workspace-article-summary')).not.toContainText('betaX');
  await menu(page, 'save');
  await expect.poll(() => saved(page)).toBe(source);
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await menu(page, 'redo');
  await expect(card.locator('.workspace-article-summary')).toContainText('Alpha betaX');
  await menu(page, 'save');
  await expect.poll(() => saved(page)).toBe(source.replace('beta', 'betaX'));
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await page.locator('[data-article-path="Chapter10.md"]').click();
  await expect(write).toHaveText('Beta document');
  await expect(card.locator('.workspace-article-summary')).toContainText('Alpha betaX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:outline'));
  await expect(page.getByRole('complementary', { name: '文档目录' })).toBeVisible();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:outline'));
  await expect(page.locator('.sidebar-current-title')).toHaveText('文档');
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  expect(errors).toEqual([]);
});

test('article/tree sorting persists independently and native menu actions keep the same editor', async ({
  page,
}) => {
  const errors = await start(page);
  const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  await page.getByRole('button', { name: '目录菜单', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '自然排序', exact: true }).click();
  await page.keyboard.press('Escape');
  expect(
    await page
      .locator('[data-article-path]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-article-path'))),
  ).toEqual(['Chapter10.md', 'Chapter2.md', 'Project/notes.md']);
  await page.getByRole('button', { name: '切换到文件树', exact: true }).click();
  await expect(page.locator('.sidebar-current-title')).toHaveText('文件');
  await page.getByRole('button', { name: '目录菜单', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '名称', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '切换到文档列表', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('marklyra-preferences-v1') ?? '{}').fileSidebar,
      ),
    )
    .toMatchObject({ view: 'articles', articleSort: -10, treeSort: 1 });
  await menu(page, 'view:files');
  await expect(page.locator('.sidebar-current-title')).toHaveText('文件');
  await menu(page, 'view:articles');
  await expect(page.locator('.sidebar-current-title')).toHaveText('文档');
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  await page.reload();
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.sidebar-current-title')).toHaveText('文档');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('marklyra-preferences-v1') ?? '{}').fileSidebar,
    ),
  ).toMatchObject({ articleSort: -10, treeSort: 1 });
  expect(errors).toEqual([]);
});

test('article navigation cannot discard a dirty document without the existing confirmation flow', async ({
  page,
}) => {
  const errors = await start(page);
  const current = page.locator('[data-article-path="Chapter2.md"]');
  await current.click();
  const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
  await expect(write).toHaveText('Alpha betaTail');
  await firstParagraphEnd(page);
  await page.keyboard.type('X');
  await page.locator('[data-article-path="Chapter10.md"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(write).toHaveText('Alpha betaXTail');
  await page.locator('[data-article-path="Chapter10.md"]').click();
  await dialog.getByRole('button', { name: '放弃修改', exact: true }).click();
  await expect(write).toHaveText('Beta document');
  await expect(current.locator('.workspace-article-summary')).not.toContainText('betaX');
  expect(errors).toEqual([]);
});
