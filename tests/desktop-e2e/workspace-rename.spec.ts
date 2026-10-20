import { expect, type Page, test } from '@playwright/test';
import { installCreationMock } from './creation-test-util.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';
import { installRenameMock, type RenameWindow } from './rename-test-util.js';

const runtimeUrl = process.env.CREATION_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html';
const write = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');
const calls = (page: Page, command: string) =>
  page.evaluate(
    (command) => (window as TestWindow).__desktopMock.calls.filter((c) => c.command === command),
    command,
  );
async function boot(
  page: Page,
  articles = false,
  path = '/mock/Creation/Existing.md',
  source = '\uFEFFAlpha\r\n\r\nTail  \n',
) {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installCreationMock, { runtimeUrl, articles });
  await page.addInitScript(installRenameMock);
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.workspace-root-row')).toHaveText('Creation');
  await page.evaluate(
    ({ path, source }) => {
      const mock = (window as TestWindow).__desktopMock;
      mock.nextDocument = { id: 'rename-document', path, text: source, encoding: 'UTF-8' };
      mock.emitMenu('open');
    },
    { path, source },
  );
  await expect(write(page)).toContainText('Alpha');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
}
async function rename(page: Page, path: string) {
  await page.locator(`button[data-entry-path="${path}"]:visible`).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '重命名…', exact: true }).click();
  const input = page.getByRole('textbox', {
    name: path.endsWith('.md') ? '文件名' : '文件夹名称',
    exact: true,
  });
  await expect(input).toBeFocused();
  return input;
}
async function history(page: Page) {
  return write(page).evaluate(() => {
    const e = Reflect.get(window, 'editor') as { undo: { commandStack: unknown; index: number } };
    return JSON.stringify([e.undo.commandStack, e.undo.index]);
  });
}
for (const articles of [false, true])
  test(`${articles ? 'Articles' : 'Tree'} existing current-file rename keeps source, history and the editor instance`, async ({
    page,
  }) => {
    const raw = '\uFEFFAlpha\r\n\r\nTail  \n';
    await boot(page, articles, undefined, raw);
    const iframe = await page.locator('.marklyra-editor-frame').elementHandle(),
      before = await history(page);
    const input = await rename(page, 'Existing.md');
    await input.fill('已改名.md');
    await input.press('Enter');
    await expect(input).toHaveCount(0);
    expect(await history(page)).toBe(before);
    expect(await iframe?.evaluate((el) => el.isConnected)).toBe(true);
    expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
    await expect.poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text).toBe(raw);
    await expect(page.locator(`button[data-entry-path="已改名.md"]:visible`)).toBeVisible();
  });
test('ancestor rename preserves expanded descendants and the named child without reloading its body', async ({
  page,
}) => {
  await boot(page, false, '/mock/Creation/Folder/Child.md');
  // The folder holding the open document is revealed on its own.
  await expect(page.locator('button[data-entry-path="Folder"]')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.locator('button[data-entry-path="Folder/Child.md"]')).toBeVisible();
  const before = await history(page),
    iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  const input = await rename(page, 'Folder');
  await input.fill('Renamed');
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(page.locator('button[data-entry-path="Renamed"]')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.locator('button[data-entry-path="Renamed/Child.md"]')).toBeVisible();
  expect(await history(page)).toBe(before);
  expect(await iframe?.evaluate((el) => el.isConnected)).toBe(true);
  expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
});
for (const behavior of ['committed', 'prepared'] as const)
  test(`lost ${behavior} ACK resolves before naming completes without a second mutation`, async ({
    page,
  }) => {
    await boot(page);
    await page.evaluate((behavior) => {
      (window as RenameWindow).__renameMock.behavior = behavior;
    }, behavior);
    const input = await rename(page, 'Existing.md');
    await input.fill('Resolved.md');
    await input.press('Enter');
    if (behavior === 'prepared') {
      await expect(input).toHaveJSProperty('readOnly', true);
      await page.getByRole('button', { name: '重试改名', exact: true }).click();
    }
    await expect(input).toHaveCount(0);
    expect(await page.evaluate(() => (window as RenameWindow).__renameMock.mutations)).toBe(1);
    expect(await calls(page, 'resolve_workspace_entry_rename')).toHaveLength(1);
    const attempts = await calls(page, 'rename_workspace_entry');
    expect(attempts).toHaveLength(behavior === 'prepared' ? 2 : 1);
    if (behavior === 'prepared')
      expect(attempts[1]?.args.operationId).toBe(attempts[0]?.args.operationId);
  });
test('an unknown response keeps the input read-only; explicit result checks do not replay the mutation', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    (window as RenameWindow).__renameMock.behavior = 'unknown';
  });
  const input = await rename(page, 'Existing.md'),
    node = await input.elementHandle();
  await input.fill('Unknown.md');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: '核对结果', exact: true })).toBeVisible();
  await expect(input).toHaveJSProperty('readOnly', true);
  await page.getByRole('button', { name: '核对结果', exact: true }).click();
  expect(await calls(page, 'rename_workspace_entry')).toHaveLength(1);
  expect(await node?.evaluate((el) => el.isConnected)).toBe(true);
  await page.evaluate(() => (window as RenameWindow).__renameMock.completeUnknown());
  await page.getByRole('button', { name: '核对结果', exact: true }).click();
  await expect(input).toHaveCount(0);
  expect(await calls(page, 'rename_workspace_entry')).toHaveLength(1);
});
test('a rejected collision retains its draft and uses a new operation UUID for the corrected name', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    (window as RenameWindow).__renameMock.behavior = 'rejected';
  });
  const input = await rename(page, 'Existing.md');
  await input.fill('Conflict.md');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('目标名称已存在');
  await expect(input).toHaveValue('Conflict.md');
  await expect(input).toHaveJSProperty('readOnly', false);
  await input.fill('Correct.md');
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  const attempts = await calls(page, 'rename_workspace_entry');
  expect(attempts).toHaveLength(2);
  expect(attempts[1]?.args.operationId).not.toBe(attempts[0]?.args.operationId);
  expect(attempts[1]?.args.entryToken).toBe(attempts[0]?.args.entryToken);
});
test('external ancestor relocation preserves the composing name input, its draft and the same inspected capability', async ({
  page,
}) => {
  await boot(page);
  await page.locator('button[data-entry-path="Folder"]').click();
  const input = await rename(page, 'Folder/Child.md'),
    node = await input.elementHandle();
  await input.fill('中文草稿.md');
  await input.dispatchEvent('compositionstart');
  await page.evaluate(() => (window as RenameWindow).__renameMock.relocate('Folder', 'Moved'));
  await expect(page.locator('button[data-entry-path="Moved"]')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(input).toHaveValue('中文草稿.md');
  expect(
    await node?.evaluate(
      (el) => el.isConnected && el === document.querySelector('.workspace-creation-input'),
    ),
  ).toBe(true);
  await input.dispatchEvent('keydown', {
    key: 'Enter',
    keyCode: 13,
    isComposing: true,
    bubbles: true,
  });
  expect(await calls(page, 'rename_workspace_entry')).toHaveLength(0);
  await input.dispatchEvent('compositionend');
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(page.locator('button[data-entry-path="Moved/中文草稿.md"]')).toBeVisible();
  expect(await calls(page, 'inspect_workspace_entry')).toHaveLength(1);
});

test('workspace metadata updates the existing capability and pending draft, rejecting an older revision', async ({
  page,
}) => {
  await boot(page);
  const input = await rename(page, 'Existing.md'),
    node = await input.elementHandle();
  await input.fill('Keep draft.md');
  const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  await page.evaluate(async () => {
    const invoke = Reflect.get(window, '__TAURI_INTERNALS__').invoke as (
      command: string,
      args: unknown,
    ) => Promise<unknown>;
    await invoke('__test_relocate_workspace', { path: '/mock/MountedNew', revision: 3 });
  });
  await expect(page.locator('.workspace-root-row')).toHaveText('MountedNew');
  await expect(input).toHaveValue('Keep draft.md');
  expect(await node?.evaluate((el) => el.isConnected)).toBe(true);
  await page.evaluate(() =>
    (window as TestWindow).__desktopMock.emitTarget('main', 'workspace-metadata-changed', [
      { id: 'creation-workspace', name: 'Old metadata', path: '/mock/Old', metadataRevision: 2 },
    ]),
  );
  await expect(page.locator('.workspace-root-row')).toHaveText('MountedNew');
  expect(await iframe?.evaluate((el) => el.isConnected)).toBe(true);
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  expect(await calls(page, 'inspect_workspace_entry')).toHaveLength(1);
  expect(await calls(page, 'rename_workspace_entry')).toHaveLength(0);
});

for (const articles of [false, true])
  test(`${articles ? 'Articles' : 'Tree'} Escape cancels only naming without a filesystem mutation or editor reload`, async ({
    page,
  }) => {
    await boot(page, articles);
    const before = await history(page),
      input = await rename(page, 'Existing.md');
    await input.fill('Never.md');
    await input.press('Escape');
    await expect(input).toHaveCount(0);
    expect(await calls(page, 'rename_workspace_entry')).toHaveLength(0);
    expect(await calls(page, 'finish_workspace_entry')).toHaveLength(1);
    expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
    expect(await history(page)).toBe(before);
    if (articles) {
      await page.keyboard.type('x');
      await expect(write(page)).toContainText('x');
    }
  });

test('a committed receipt for another capability cannot authorize completion of this naming session', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    (window as RenameWindow).__renameMock.behavior = 'foreign';
  });
  const input = await rename(page, 'Existing.md');
  await input.fill('Receipt.md');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('改名回执不属于当前操作');
  await expect(input).toHaveJSProperty('readOnly', true);
  expect(await calls(page, 'finish_workspace_entry')).toHaveLength(0);
  expect(await calls(page, 'rename_workspace_entry')).toHaveLength(1);
  expect(await calls(page, 'resolve_workspace_entry_rename')).toHaveLength(1);
});

test('an uncertain Native handoff revokes only the mounted workspace and keeps the current editor content/history', async ({
  page,
}) => {
  await boot(page);
  const input = await rename(page, 'Existing.md');
  await input.fill('Keep draft.md');
  const before = await history(page),
    iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  const closes = (await calls(page, 'close_document')).length;
  await page.evaluate(() =>
    (window as TestWindow).__desktopMock.emitTarget('main', 'workspace-file-operation-uncertain', [
      'other-workspace',
    ]),
  );
  await expect(input).toBeVisible();
  await page.evaluate(() =>
    (window as TestWindow).__desktopMock.emitTarget('main', 'workspace-file-operation-uncertain', [
      'creation-workspace',
    ]),
  );
  await expect(page.locator('.workspace-root-row')).toHaveCount(0);
  await expect(input).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('目录文件操作状态尚未确认');
  await expect(write(page)).toContainText('Alpha');
  expect(await history(page)).toBe(before);
  expect(await iframe?.evaluate((el) => el.isConnected)).toBe(true);
  expect((await calls(page, 'close_document')).length).toBe(closes);
  expect(await calls(page, 'rename_workspace_entry')).toHaveLength(0);
});
