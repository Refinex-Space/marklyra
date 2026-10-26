import { expect, type Page, test } from '@playwright/test';
import { installCreationMock } from './creation-test-util.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';
import { installRenameMock } from './rename-test-util.js';
import { installTrashMock, type TrashWindow } from './trash-test-util.js';
import {
  expectWorkspaceUnmounted,
  openWorkspaceRootMenu,
  requestWorkspaceRootMenu,
} from './workspace-context.helpers.js';

const runtimeUrl = process.env.CREATION_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html';
const raw = '\uFEFFAlpha\r\n\r\nTail  \n';

test('saving a dirty trashed document before Articles next uses Save As and its cancellation preserves the pending document', async ({
  page,
}) => {
  await boot(page, true);
  const before = await state(page),
    iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  await page.evaluate(() => {
    const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const previous = internal.invoke;
    internal.invoke = async (command, args = {}) => {
      if (command === 'save_document_as') {
        (window as TestWindow).__desktopMock.calls.push({ command, args });
        throw Error('已取消保存文件');
      }
      return previous(command, args);
    };
  });
  await trash(page);
  const dialog = page.getByRole('dialog', { name: '保存当前更改？', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '保存后继续', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'save_document_as')).length).toBe(1);
  expect(await calls(page, 'save_document')).toHaveLength(0);
  await expect(dialog).toBeVisible();
  expect(await state(page)).toEqual(before);
  expect(await iframe?.evaluate((el) => el.isConnected)).toBe(true);
  const request = (await calls(page, 'save_document_as'))[0];
  expect(request?.args.sourceId).toBe('trash-document');
  expect(request?.args.text).toBe(raw.replace('Alpha', 'AlphaX'));
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await state(page)).toEqual(before);
});
const write = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');
const calls = (page: Page, command: string) =>
  page.evaluate(
    (command) =>
      (window as TestWindow).__desktopMock.calls.filter((value) => value.command === command),
    command,
  );
async function boot(
  page: Page,
  articles = false,
  path = '/mock/Creation/Existing.md',
  id = 'trash-document',
) {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installCreationMock, { runtimeUrl, articles });
  await page.addInitScript(installRenameMock);
  await page.addInitScript(installTrashMock);
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.workspace-root-row')).toHaveText('Creation');
  await page.evaluate(
    ({ path, raw, id }) => {
      const mock = (window as TestWindow).__desktopMock;
      mock.nextDocument = { id, path, text: raw, encoding: 'UTF-8' };
      mock.emitMenu('open');
    },
    { path, raw, id },
  );
  await expect(write(page)).toContainText('Alpha');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await write(page)
    .locator('p')
    .first()
    .evaluate((element) => {
      (document.querySelector('#write') as HTMLElement).focus();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let text: Node | null = null;
      while (walker.nextNode())
        if (
          walker.currentNode.textContent === 'Alpha' ||
          walker.currentNode.textContent === '\uFEFFAlpha'
        )
          text = walker.currentNode;
      if (!text)
        throw Error(
          'Missing real Alpha text ' +
            JSON.stringify({
              connected: element.isConnected,
              old: element.outerHTML,
              current: document.querySelector('#write p')?.outerHTML,
            }),
        );
      const offset = text.textContent?.length ?? 0;
      getSelection()?.setBaseAndExtent(text, offset, text, offset);
    });
  await page.keyboard.type('X');
  await expect(write(page)).toContainText('AlphaX');
  await write(page).evaluate(() =>
    (Reflect.get(window, 'editor') as { undo: { endSnap(): void } }).undo.endSnap(),
  );
}
async function state(page: Page) {
  return write(page).evaluate(() => {
    const editor = Reflect.get(window, 'editor') as {
      getMarkdown(): string;
      undo: { commandStack: unknown; index: number };
    };
    return {
      canonical: editor.getMarkdown(),
      history: JSON.stringify([editor.undo.commandStack, editor.undo.index]),
    };
  });
}
async function menu(page: Page, path = 'Existing.md') {
  await page.locator(`button[data-entry-path="${path}"]:visible`).click({ button: 'right' });
  await expect(page.getByRole('menu', { name: '文件操作', exact: true })).toBeVisible();
}
async function trash(page: Page, path = 'Existing.md') {
  await menu(page, path);
  await page.getByRole('menuitem', { name: '删除…', exact: true }).click();
}
const rootMenu = openWorkspaceRootMenu;

test('Native cancel preserves the current row, source/history and editor instance', async ({
  page,
}) => {
  await boot(page);
  const before = await state(page),
    iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  await page.evaluate(() => {
    (window as TrashWindow).__trashMock.trashBehavior = 'cancel';
  });
  await trash(page);
  await expect.poll(async () => (await calls(page, 'finish_workspace_entry')).length).toBe(1);
  await expect(page.locator('button[data-entry-path="Existing.md"]:visible')).toBeVisible();
  expect(await state(page)).toEqual(before);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  expect(await page.evaluate(() => (window as TrashWindow).__trashMock.trashMutations)).toBe(0);
});

test('Tree current Trash and independent Undo preserve raw/history while Undo only highlights the restored row', async ({
  page,
}) => {
  await boot(page);
  const before = await state(page),
    iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  await trash(page);
  await expect(page.locator('button[data-entry-path="Existing.md"]:visible')).toHaveCount(0);
  expect(await state(page)).toEqual(before);
  await rootMenu(page);
  await page.getByRole('menuitem', { name: '撤销 删除 Existing.md', exact: true }).click();
  await expect(
    page.locator('button[data-entry-path="Existing.md"].workspace-file-highlight'),
  ).toBeVisible();
  expect(await state(page)).toEqual(before);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe(raw.replace('Alpha', 'AlphaX'));
});

test('Trash of an ancestor removes the subtree and keeps the edited descendant model/history', async ({
  page,
}) => {
  await boot(page, false, '/mock/Creation/Folder/Child.md');
  // The folder holding the open document is revealed on its own.
  await expect(page.locator('button[data-entry-path="Folder/Child.md"]:visible')).toBeVisible();
  const before = await state(page);
  await trash(page, 'Folder');
  await expect(page.locator('button[data-entry-path="Folder"]:visible')).toHaveCount(0);
  await expect(write(page)).toContainText('AlphaX');
  expect(await state(page)).toEqual(before);
  expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
  await rootMenu(page);
  await page.getByRole('menuitem', { name: '撤销 删除 Folder', exact: true }).click();
  await expect(
    page.locator('button[data-entry-path="Folder"].workspace-file-highlight'),
  ).toBeVisible();
  expect(await state(page)).toEqual(before);
});

test('Articles next request uses the existing unsaved-intent dialog instead of loading over the dirty deleted document', async ({
  page,
}) => {
  await boot(page, true);
  const before = await state(page);
  await trash(page);
  const dialog = page.getByRole('dialog', { name: '保存当前更改？', exact: true });
  await expect(dialog).toBeVisible();
  expect(await state(page)).toEqual(before);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await state(page)).toEqual(before);
});

test('file Undo does not consume or replace Markdown Undo/Redo', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as TrashWindow).__trashMock.seedUndo());
  const before = await state(page);
  await rootMenu(page);
  await page.getByRole('menuitem', { name: '撤销 删除 Restored.md', exact: true }).click();
  await expect(
    page.locator('button[data-entry-path="Restored.md"].workspace-file-highlight'),
  ).toBeVisible();
  expect(await state(page)).toEqual(before);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(write(page)).toContainText('Alpha');
  await expect(write(page)).not.toContainText('AlphaX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
  await expect(write(page)).toContainText('AlphaX');
  expect(await page.evaluate(() => (window as TrashWindow).__trashMock.undoMutations)).toBe(1);
});

for (const behavior of ['lostCommitted', 'prepared', 'unknown'] as const)
  test(`Trash ${behavior} resolves without repeating the confirmation or filesystem mutation`, async ({
    page,
  }) => {
    await boot(page);
    await page.evaluate((behavior) => {
      (window as TrashWindow).__trashMock.trashBehavior = behavior;
    }, behavior);
    await trash(page);
    if (behavior !== 'lostCommitted') {
      await expect(page.getByRole('button', { name: '核对结果', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '核对结果', exact: true }).click();
      expect(await calls(page, 'trash_workspace_entry')).toHaveLength(1);
      await page.evaluate(() => (window as TrashWindow).__trashMock.completePending());
      await page.getByRole('button', { name: '核对结果', exact: true }).click();
    }
    await expect(page.locator('button[data-entry-path="Existing.md"]:visible')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '核对结果', exact: true })).toHaveCount(0);
    expect(await calls(page, 'trash_workspace_entry')).toHaveLength(1);
    expect(await page.evaluate(() => (window as TrashWindow).__trashMock.trashMutations)).toBe(1);
  });

test('Undo lost acknowledgement resolves the original opaque slot once', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const mock = (window as TrashWindow).__trashMock;
    mock.seedUndo();
    mock.undoBehavior = 'lostCommitted';
  });
  await rootMenu(page);
  await page.getByRole('menuitem', { name: '撤销 删除 Restored.md', exact: true }).click();
  await expect(page.locator('button[data-entry-path="Restored.md"]:visible')).toBeVisible();
  expect(await calls(page, 'perform_workspace_file_undo')).toHaveLength(1);
  expect(await calls(page, 'resolve_workspace_file_undo')).toHaveLength(1);
  expect(await page.evaluate(() => (window as TrashWindow).__trashMock.undoMutations)).toBe(1);
});

test('outside-mount restore has no invented root highlight or automatic document open', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    const mock = (window as TrashWindow).__trashMock;
    mock.outsideRestore = true;
    mock.seedUndo();
  });
  const before = await state(page);
  await rootMenu(page);
  await page.getByRole('menuitem', { name: '撤销 删除 Restored.md', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'perform_workspace_file_undo')).length).toBe(1);
  await expect(page.locator('.workspace-file-highlight')).toHaveCount(0);
  expect(await state(page)).toEqual(before);
  expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
});

test('a late Undo catalog cannot reopen the file menu after the user moves to search', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    const mock = (window as TrashWindow).__trashMock;
    mock.seedUndo();
    mock.deferCatalog = true;
  });
  await requestWorkspaceRootMenu(page);
  await expect
    .poll(() => page.evaluate(() => (window as TrashWindow).__trashMock.pendingCatalog))
    .toBe(1);
  await page.getByRole('button', { name: '全文搜索', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索文件', exact: true }).fill('Keep focus');
  await page.evaluate(() => (window as TrashWindow).__trashMock.releaseCatalog());
  await expect(page.getByRole('menu', { name: '文件操作', exact: true })).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: '搜索文件', exact: true })).toBeFocused();
  expect(await calls(page, 'perform_workspace_file_undo')).toHaveLength(0);
});

test('confirmed removed-root notice clears only that mount and preserves the open editor', async ({
  page,
}) => {
  await boot(page);
  const before = await state(page),
    iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  await page.evaluate(() =>
    (window as TestWindow).__desktopMock.emitTarget('main', 'workspace-roots-removed', [
      'other-workspace',
    ]),
  );
  await expect(page.locator('.workspace-root-row')).toHaveText('Creation');
  await expect(page.locator('.workspace-sidebar')).not.toHaveAttribute('data-empty', 'true');
  await page.evaluate(() =>
    (window as TestWindow).__desktopMock.emitTarget('main', 'workspace-roots-removed', [
      'creation-workspace',
    ]),
  );
  await expectWorkspaceUnmounted(page);
  expect((await calls(page, 'close_workspace')).at(-1)?.args).toEqual({
    workspaceId: 'creation-workspace',
  });
  await expect(page.getByRole('alert')).toContainText('文件夹已移入废纸篓');
  expect(await state(page)).toEqual(before);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
});

test('external Trash ends a deleted-prefix naming capability without discarding the current draft', async ({
  page,
}) => {
  await boot(page);
  await menu(page);
  await page.getByRole('menuitem', { name: '重命名…', exact: true }).click();
  const input = page.getByRole('textbox', { name: '文件名', exact: true });
  await expect(input).toBeFocused();
  await input.fill('Uncommitted.md');
  const before = await state(page);
  await page.evaluate(() => (window as TrashWindow).__trashMock.externalTrash('Existing.md'));
  await expect(input).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('已结束命名');
  expect(await state(page)).toEqual(before);
  expect(await calls(page, 'rename_workspace_entry')).toHaveLength(0);
});

test('interactive confirmation preserves the dirty current Article after committed Trash without a next-document intent', async ({
  page,
}) => {
  await boot(page, true);
  const before = await state(page),
    iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  await page.evaluate(() => {
    (window as TrashWindow).__trashMock.trashBehavior = 'interactiveConfirmed';
  });
  await trash(page);
  await expect(page.locator('button[data-entry-path="Existing.md"]:visible')).toHaveCount(0);
  await expect(page.getByText('正在处理文件操作…', { exact: true })).toHaveCount(0);
  // The remaining visible Article must stay operable; a late unsaved-intent modal blocks this click.
  await page
    .locator('button[data-article-path="Folder/Child.md"]:visible')
    .click({ button: 'right', timeout: 5000 });
  await expect(page.getByRole('menu', { name: '文件操作', exact: true })).toBeVisible();
  await expect(
    page.getByRole('menuitem', { name: '撤销 删除 Existing.md', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await state(page)).toEqual(before);
  await expect(page.getByRole('dialog', { name: '保存当前更改？', exact: true })).toHaveCount(0);
  expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  expect(await page.evaluate(() => (window as TrashWindow).__trashMock.trashMutations)).toBe(1);
});

test('cross-parent alias metadata preserves separate real editors and histories and rejects stale paths', async ({
  page,
  context,
}) => {
  await boot(page, false, '/mock/Creation/Existing.md', 'original-a');
  const alias = await context.newPage();
  try {
    await boot(alias, false, '/mock/Trash/Existing 2.md', 'alias-b');
    const beforeA = await state(page),
      beforeB = await state(alias);
    const frameA = await page.locator('.marklyra-editor-frame').getAttribute('src');
    const frameB = await alias.locator('.marklyra-editor-frame').getAttribute('src');
    async function publish(
      target: Page,
      id: string,
      path: string,
      locationState: 'available' | 'trashed',
      metadataRevision: number,
    ) {
      await target.evaluate(
        (change) =>
          (window as TestWindow).__desktopMock.emitTarget('main', 'document-metadata-changed', [
            change,
          ]),
        { id, path, encoding: 'UTF-8', metadataRevision, locationState },
      );
    }
    await publish(page, 'original-a', '/mock/Creation/Existing.md', 'trashed', 3);
    const trashed = page
      .locator('.notice-host .notice-warning')
      .filter({ hasText: '文件已移入回收站' });
    await expect(trashed).toBeVisible();
    await trashed.getByRole('button', { name: '关闭提示' }).click();
    await expect(trashed).toHaveCount(0);
    await publish(alias, 'alias-b', '/mock/Trash/Existing 2.md', 'available', 3);
    await publish(page, 'original-a', '/mock/Creation/Existing.md', 'available', 4);
    await publish(alias, 'alias-b', '/mock/Creation/Existing.md', 'available', 4);
    await expect(page.getByRole('status').filter({ hasText: '文件已恢复' })).toBeVisible();
    // Late old endpoint and another document's metadata cannot rebind this owner.
    await publish(alias, 'alias-b', '/mock/Trash/Existing 2.md', 'available', 3);
    await publish(alias, 'original-a', '/mock/Unrelated.md', 'trashed', 100);
    expect(await state(page)).toEqual(beforeA);
    expect(await state(alias)).toEqual(beforeB);
    expect(await page.locator('.marklyra-editor-frame').getAttribute('src')).toBe(frameA);
    expect(await alias.locator('.marklyra-editor-frame').getAttribute('src')).toBe(frameB);
    for (const [target, id] of [
      [page, 'original-a'],
      [alias, 'alias-b'],
    ] as const) {
      await target.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
      await expect
        .poll(async () => (await calls(target, 'save_document')).at(-1)?.args)
        .toMatchObject({ id, text: raw.replace('Alpha', 'AlphaX') });
      const saved = (await calls(target, 'save_document')).at(-1)?.args;
      expect(saved).not.toHaveProperty('path');
      await target.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
      await expect(write(target)).toContainText('Alpha');
      await expect(write(target)).not.toContainText('AlphaX');
      await target.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
      await expect(write(target)).toContainText('AlphaX');
    }
  } finally {
    await alias.close();
  }
});
