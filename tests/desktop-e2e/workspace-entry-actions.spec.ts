import { expect, type Page, test } from '@playwright/test';
import type { EntryResolution } from '../../apps/desktop/src/services/entry-actions.js';
import { installCreationMock } from './creation-test-util.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';
import { installRenameMock, type RenameWindow } from './rename-test-util.js';

type ActionWindow = RenameWindow & {
  __actions: {
    behavior: 'normal' | 'lost' | 'unknown' | 'hold' | 'reuse-lost';
    release(): void;
    effects: number;
  };
};
function installActions() {
  if (window !== window.top) return;
  const host = window as ActionWindow;
  let release: () => void = () => {};
  host.__actions = { behavior: 'normal', effects: 0, release: () => release() };
  const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const previous = internal.invoke,
    tokens = new Map<string, string>(),
    operations = new Map<string, EntryResolution>();
  internal.invoke = async (command, args = {}) => {
    if (command === 'inspect_workspace_entry') {
      const entry = (await previous(command, args)) as { entryToken: string };
      tokens.set(entry.entryToken, String(args.relativePath));
      return entry;
    }
    if (['duplicate_workspace_entry', 'perform_workspace_entry_action'].includes(command)) {
      host.__desktopMock.calls.push({ command, args });
      if (host.__actions.behavior === 'unknown') throw Error('unknown');
      if (host.__actions.behavior === 'hold')
        await new Promise<void>((done) => {
          release = done;
        });
      host.__actions.effects++;
      const action = String(args.action),
        token = String(args.entryToken),
        operation = String(args.operationId);
      let receipt: Extract<EntryResolution, { status: 'committed' }>['receipt'];
      if (command === 'duplicate_workspace_entry') {
        const source = host.__creationMock.entries.find(
          (e) => e.relativePath === tokens.get(token),
        );
        if (!source) throw Error('missing inspected source');
        const entry = { ...source, name: 'Existing (copy).md', relativePath: 'Existing (copy).md' };
        host.__creationMock.entries.push(entry);
        receipt = {
          ...entry,
          kind: 'file',
          operationId: operation,
          entryToken: token,
          warnings: [],
        };
      } else
        receipt = {
          operationId: operation,
          entryToken: token,
          action: action as 'open-new' | 'info' | 'copy-path' | 'reveal',
          windowLabel: action === 'open-new' ? `editor-${crypto.randomUUID()}` : null,
        };
      if (host.__actions.behavior === 'reuse-lost' && action === 'open-new')
        receipt = {
          operationId: operation,
          entryToken: token,
          action: 'open-new',
          windowLabel: 'main',
          workspace: { id: 'reused-workspace', name: 'Folder', path: '/mock/Creation/Folder' },
        };
      const result = { status: 'committed' as const, receipt } as EntryResolution;
      operations.set(operation, result);
      if (host.__actions.behavior === 'lost' || host.__actions.behavior === 'reuse-lost')
        throw Error('lost ACK');
      return command === 'duplicate_workspace_entry' ? receipt : result;
    }
    if (['resolve_workspace_entry_action', 'resolve_workspace_entry_duplicate'].includes(command)) {
      host.__desktopMock.calls.push({ command, args });
      return operations.get(String(args.operationId)) ?? null;
    }
    return previous(command, args);
  };
}
async function boot(page: Page, articles = false, currentSource = false, blank = false) {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installCreationMock, {
    runtimeUrl: 'http://127.0.0.1:4174/index.html',
    articles,
  });
  await page.addInitScript(installRenameMock);
  await page.addInitScript(installActions);
  await page.goto('/');
  await expect(page.locator('.workspace-root-row')).toHaveText('Creation');
  if (blank) {
    await expect(write(page)).toBeVisible();
    return;
  }
  await page.evaluate((currentSource) => {
    const mock = (window as TestWindow).__desktopMock;
    mock.nextDocument = {
      id: 'actions-document',
      path: currentSource ? '/mock/Creation/Existing.md' : '/mock/Creation/Opened.md',
      text: '\uFEFFAlpha\r\n\r\nTail  \n',
      encoding: 'UTF-8',
    };
    mock.emitMenu('open');
  }, currentSource);
  await expect(write(page)).toContainText('Alpha');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
}
const write = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');
const calls = (page: Page, command: string) =>
  page.evaluate(
    (command) => (window as TestWindow).__desktopMock.calls.filter((c) => c.command === command),
    command,
  );
async function action(page: Page, label: string, path = 'Existing.md') {
  await page.locator(`button[data-entry-path="${path}"]:visible`).click({ button: 'right' });
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}
async function history(page: Page) {
  return write(page).evaluate(() => {
    const editor = Reflect.get(window, 'editor') as {
      undo: { commandStack: unknown; index: number };
    };
    return JSON.stringify([editor.undo.commandStack, editor.undo.index]);
  });
}
for (const articles of [false, true])
  test(`${articles ? 'Articles' : 'Tree'} duplicate uses a fresh inspection for inline rename and keeps source/editor/history`, async ({
    page,
  }) => {
    await boot(page, articles);
    const frame = await page.locator('.marklyra-editor-frame').elementHandle(),
      before = await history(page);
    await action(page, '制作副本');
    const input = page.getByRole('textbox', { name: '文件名', exact: true });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('Existing (copy).md');
    expect((await calls(page, 'inspect_workspace_entry')).map((c) => c.args.relativePath)).toEqual([
      'Existing.md',
      'Existing (copy).md',
    ]);
    await input.press('Escape');
    await expect(input).toHaveCount(0);
    await expect(
      page.locator('button[data-entry-path="Existing (copy).md"]:visible'),
    ).toBeVisible();
    expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
    expect(await calls(page, 'save_document')).toHaveLength(0);
    expect(await history(page)).toBe(before);
    expect(await frame?.evaluate((el) => el.isConnected)).toBe(true);
    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
    await expect
      .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
      .toBe('\uFEFFAlpha\r\n\r\nTail  \n');
  });
test('lost duplicate ACK only resolves once; unknown results remain blocked without replay', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    (window as ActionWindow).__actions.behavior = 'lost';
  });
  await action(page, '制作副本');
  const input = page.getByRole('textbox', { name: '文件名', exact: true });
  await expect(input).toBeFocused();
  expect(await calls(page, 'duplicate_workspace_entry')).toHaveLength(1);
  expect(await calls(page, 'resolve_workspace_entry_duplicate')).toHaveLength(1);
  await input.press('Escape');
  await page.evaluate(() => {
    (window as ActionWindow).__actions.behavior = 'unknown';
  });
  await action(page, '在新窗口中打开');
  await expect(page.getByRole('button', { name: '核对结果', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '核对结果', exact: true }).click();
  expect(await calls(page, 'perform_workspace_entry_action')).toHaveLength(1);
  expect(await calls(page, 'resolve_workspace_entry_action')).toHaveLength(2);
  expect(await page.evaluate(() => (window as ActionWindow).__actions.effects)).toBe(1);
});
test('file/folder new-window and system actions keep the current editor and send capabilities only', async ({
  page,
}) => {
  await boot(page);
  const frame = await page.locator('.marklyra-editor-frame').elementHandle(),
    before = await history(page);
  for (const [path, label] of [
    ['Existing.md', '在新窗口中打开'],
    ['Folder', '在新窗口中打开'],
    ['Existing.md', '显示简介…'],
    ['Existing.md', '复制文件路径'],
    ['Existing.md', '在 Finder 中显示'],
  ] as const) {
    await action(page, label, path);
    await expect(page.getByText('正在处理文件动作…', { exact: true })).toHaveCount(0);
  }
  const requests = await calls(page, 'perform_workspace_entry_action');
  expect(requests.map((c) => c.args.action)).toEqual([
    'open-new',
    'open-new',
    'info',
    'copy-path',
    'reveal',
  ]);
  for (const request of requests) {
    expect(Object.keys(request.args).sort()).toEqual(
      [
        'action',
        ...(request.args.action === 'open-new' ? ['editorSnapshot'] : []),
        'entryToken',
        'operationId',
        'workspaceId',
      ].sort(),
    );
    expect(request.args).not.toHaveProperty('path');
  }
  expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
  expect(await calls(page, 'save_document')).toHaveLength(0);
  expect(await history(page)).toBe(before);
  expect(await frame?.evaluate((el) => el.isConnected)).toBe(true);
});
test('root Copy Path uses current workspace identity without a renderer-supplied path', async ({
  page,
}) => {
  await boot(page);
  await page.locator('.workspace-root-row').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '复制文件路径', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'perform_workspace_entry_action')).length)
    .toBe(1);
  expect((await calls(page, 'perform_workspace_entry_action'))[0]?.args).toMatchObject({
    workspaceId: 'creation-workspace',
    entryToken: 'creation-workspace',
    action: 'copy-path',
  });
  expect(await calls(page, 'inspect_workspace_entry')).toHaveLength(0);
});

test('a delayed copy receipt refreshes its row without stealing focus after continued typing', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    (window as ActionWindow).__actions.behavior = 'hold';
  });
  await action(page, '制作副本');
  await expect.poll(async () => (await calls(page, 'duplicate_workspace_entry')).length).toBe(1);
  await write(page).locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect(write(page)).toContainText('X');
  await page.evaluate(() => (window as ActionWindow).__actions.release());
  await expect(page.locator('button[data-entry-path="Existing (copy).md"]')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '文件名', exact: true })).toHaveCount(0);
  await page.keyboard.type('Y');
  await expect(write(page)).toContainText('XY');
  expect(await calls(page, 'save_document')).toHaveLength(0);
});

test('a current clean source opens its disk duplicate only after copy success', async ({
  page,
}) => {
  await boot(page, false, true);
  await action(page, '制作副本');
  await expect.poll(async () => (await calls(page, 'open_workspace_document')).length).toBe(1);
  const log = await page.evaluate(() => (window as TestWindow).__desktopMock.calls);
  expect(log.findIndex((c) => c.command === 'duplicate_workspace_entry')).toBeLessThan(
    log.findIndex((c) => c.command === 'open_workspace_document'),
  );
  expect(await calls(page, 'save_document')).toHaveLength(0);
  await expect(page.getByRole('textbox', { name: '文件名', exact: true })).toHaveValue(
    'Existing (copy).md',
  );
});

test('blank folder open reuses its native-approved workspace receipt once after a lost ACK', async ({
  page,
}) => {
  await boot(page, false, false, true);
  const frame = await page.locator('.marklyra-editor-frame').elementHandle();
  const before = await history(page);
  await page.evaluate(() => {
    (window as ActionWindow).__actions.behavior = 'reuse-lost';
  });
  await action(page, '在新窗口中打开', 'Folder');
  await expect(page.locator('.workspace-root-row')).toHaveText('Folder');
  expect(await calls(page, 'perform_workspace_entry_action')).toHaveLength(1);
  expect(await calls(page, 'resolve_workspace_entry_action')).toHaveLength(1);
  expect((await calls(page, 'perform_workspace_entry_action'))[0]?.args.editorSnapshot).toEqual({
    documentId: null,
    text: '',
    savedText: '',
  });
  expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
  expect(await calls(page, 'save_document')).toHaveLength(0);
  expect(await history(page)).toBe(before);
  expect(await frame?.evaluate((el) => el.isConnected)).toBe(true);
});
test('file new-window captures the current dirty source after flush without saving the parent', async ({
  page,
}) => {
  await boot(page, false, true);
  await write(page).locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect(write(page)).toContainText('X');
  const before = await history(page);
  await action(page, '在新窗口中打开');
  await expect
    .poll(async () => (await calls(page, 'perform_workspace_entry_action')).length)
    .toBe(1);
  const snapshot = (await calls(page, 'perform_workspace_entry_action'))[0]?.args
    .editorSnapshot as { documentId: string; text: string; savedText: string };
  expect(snapshot.documentId).toBe('actions-document');
  expect(snapshot.text).toContain('X');
  expect(snapshot.savedText).toBe('\uFEFFAlpha\r\n\r\nTail  \n');
  expect(await calls(page, 'save_document')).toHaveLength(0);
  expect(await history(page)).toBe(before);
});
