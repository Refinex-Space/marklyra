import { expect, type Page, test } from '@playwright/test';
import type { EntryResolution } from '../../apps/desktop/src/services/entry-actions.js';
import type {
  InspectedWorkspaceEntry,
  WorkspaceFileUndo,
  WorkspaceUndoReceipt,
} from '../../apps/desktop/src/services/workspaces.js';
import { installCreationMock } from './creation-test-util.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';
import { installRenameMock, type RenameWindow } from './rename-test-util.js';
import { openWorkspaceRootMenu } from './workspace-context.helpers.js';

type MoveBehavior = 'normal' | 'cancel' | 'lost' | 'unknown';
type MoveWindow = RenameWindow & {
  __moveMock: { behavior: MoveBehavior; effects: number; undos: number };
};
/** This double owns no native IO or dialogs. Actual HTML drag events exercise the Shell. */
function installMoveMock() {
  if (window !== window.top) return;
  const host = window as MoveWindow;
  const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const previous = internal.invoke;
  const tokens = new Map<string, InspectedWorkspaceEntry>();
  const operations = new Map<
    string,
    { token: string; destination: string | null; result: EntryResolution }
  >();
  let slot: (WorkspaceFileUndo & { from: string; to: string; kind: 'file' | 'directory' }) | null =
    null;
  host.__moveMock = { behavior: 'normal', effects: 0, undos: 0 };
  host.__creationMock.entries.push(
    { name: 'Other', relativePath: 'Other', kind: 'directory', size: null },
    { name: 'Nested', relativePath: 'Folder/Nested', kind: 'directory', size: null },
    { name: 'Deep.md', relativePath: 'Folder/Nested/Deep.md', kind: 'file', size: 4 },
  );
  const emit = (event: string, payload: unknown) =>
    host.__desktopMock.emitTarget('main', event, payload);
  internal.invoke = async (command, args = {}) => {
    const record = () => host.__desktopMock.calls.push({ command, args });
    if (command === 'inspect_workspace_entry') {
      const entry = (await previous(command, args)) as InspectedWorkspaceEntry;
      tokens.set(entry.entryToken, structuredClone(entry));
      return entry;
    }
    if (command === 'move_workspace_entry') {
      record();
      const operation = String(args.operationId),
        token = String(args.entryToken),
        destination = args.destinationToken === null ? null : String(args.destinationToken);
      const prior = operations.get(operation);
      if (prior) {
        if (prior.token !== token || prior.destination !== destination) throw Error('Wrong move');
        return structuredClone(prior.result);
      }
      const source = tokens.get(token);
      const parent =
        destination === 'creation-workspace' ? '' : tokens.get(destination ?? '')?.relativePath;
      if (!source || parent === undefined) throw Error('Missing inspected move capability');
      const behavior = host.__moveMock.behavior;
      if (behavior === 'unknown') throw Error('Move response unknown before a confirmed effect');
      if (behavior === 'cancel') {
        const result = { status: 'rejected' as const, message: '已取消移动' };
        operations.set(operation, { token, destination, result });
        return result;
      }
      const path = [parent, source.name].filter(Boolean).join('/');
      host.__moveMock.effects++;
      host.__renameMock.relocate(source.relativePath, path);
      slot = {
        token: crypto.randomUUID(),
        description: `移动 ${source.name}`,
        from: source.relativePath,
        to: path,
        kind: source.kind,
      };
      const result: EntryResolution = {
        status: 'committed',
        receipt: {
          operationId: operation,
          entryToken: token,
          action: 'move',
          windowLabel: null,
          moveEntry: { relativePath: path, kind: source.kind },
        },
      };
      operations.set(operation, { token, destination, result });
      emit('workspace-file-undo-changed', {});
      if (behavior === 'lost') throw Error('Move committed ACK lost');
      return structuredClone(result);
    }
    if (command === 'resolve_workspace_entry_move') {
      record();
      const prior = operations.get(String(args.operationId));
      if (!prior) return null;
      if (prior.token !== args.entryToken || prior.destination !== args.destinationToken)
        throw Error('Move query does not match its original destination');
      return structuredClone(prior.result);
    }
    if (command === 'open_workspace_document') {
      record();
      const opened = {
        id: 'moved-opened',
        path: '/mock/Creation/' + String(args.relativePath),
        text: '\uFEFFAlpha\r\n\r\nTail  \n',
        encoding: 'UTF-8 BOM',
      };
      host.__desktopMock.nextDocument = { ...opened };
      return opened;
    }
    if (command === 'get_workspace_file_undo') {
      record();
      return slot ? { token: slot.token, description: slot.description } : null;
    }
    if (command === 'perform_workspace_file_undo') {
      record();
      if (!slot || slot.token !== args.undoToken) throw Error('File Undo changed');
      const previousSlot = slot;
      slot = null;
      host.__moveMock.undos++;
      host.__renameMock.relocate(previousSlot.to, previousSlot.from);
      const receipt: WorkspaceUndoReceipt = {
        operationId: String(args.operationId),
        undoToken: String(args.undoToken),
        restoredRelativePath: previousSlot.from,
        kind: previousSlot.kind,
        warnings: [],
      };
      emit('workspace-file-undo-changed', {});
      return receipt;
    }
    return previous(command, args);
  };
}
const raw = '\uFEFFAlpha\r\n\r\nTail  \n';
const write = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');
const row = (page: Page, path: string) => page.locator(`button[data-entry-path="${path}"]:visible`);
const calls = (page: Page, command: string) =>
  page.evaluate(
    (command) =>
      (window as TestWindow).__desktopMock.calls.filter((call) => call.command === command),
    command,
  );
async function state(page: Page) {
  return write(page).evaluate(() => {
    const editor = Reflect.get(window, 'editor') as {
      getMarkdown(): string;
      undo: { commandStack: unknown; index: number };
    };
    return {
      source: editor.getMarkdown(),
      history: JSON.stringify([editor.undo.commandStack, editor.undo.index]),
    };
  });
}
async function boot(page: Page, articles = false, documentPath: string | null = 'Existing.md') {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installCreationMock, {
    runtimeUrl: 'http://127.0.0.1:4174/index.html',
    articles,
  });
  await page.addInitScript(installRenameMock);
  await page.addInitScript(installMoveMock);
  await page.goto('/');
  await expect(page.locator('.workspace-root-row')).toHaveText('Creation');
  if (documentPath === null) {
    await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
    await expect(write(page)).toBeVisible();
    return;
  }
  await page.evaluate(
    ({ text, path }) => {
      const host = window as TestWindow;
      host.__desktopMock.nextDocument = {
        id: 'move-document',
        path: `/mock/Creation/${path}`,
        text,
        encoding: 'UTF-8 BOM',
      };
      host.__desktopMock.emitMenu('open');
    },
    { text: raw, path: documentPath },
  );
  await expect(write(page)).toContainText('Alpha');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
}
async function drag(page: Page, source: string, destination: string) {
  await expect(row(page, source)).toHaveAttribute('draggable', 'true');
  await expect(row(page, source)).toHaveCSS('user-select', 'none');
  await row(page, source)
    .locator('.workspace-tree-name, .workspace-article-name')
    .dragTo(row(page, destination));
}
async function complete(page: Page, count = 1) {
  await expect.poll(async () => (await calls(page, 'move_workspace_entry')).length).toBe(count);
  await expect(page.getByText('正在移动…', { exact: true })).toHaveCount(0);
}

test('a local gesture can cross the standard-text-only native drag boundary', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    document.addEventListener(
      'dragstart',
      (event) => (event as DragEvent).dataTransfer?.clearData('application/x-marklyra-entry'),
      { once: true },
    );
  });
  await drag(page, 'Existing.md', 'Folder');
  await complete(page);
  expect(await calls(page, 'move_workspace_entry')).toHaveLength(1);
});

test('a different standard-text payload cannot reuse the active local gesture', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    document.addEventListener(
      'dragstart',
      (event) => {
        const data = (event as DragEvent).dataTransfer;
        data?.clearData('application/x-marklyra-entry');
        data?.setData('text/plain', '/untrusted/destination.md');
      },
      { once: true },
    );
  });
  await drag(page, 'Existing.md', 'Folder');
  expect(await calls(page, 'move_workspace_entry')).toHaveLength(0);
  expect(await calls(page, 'inspect_workspace_entry')).toHaveLength(0);
});

test('Tree drag file to folder coordinates metadata and File Undo without consuming source Undo', async ({
  page,
}) => {
  await boot(page);
  await write(page).locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect(write(page)).toContainText('AlphaX');
  const before = await state(page);
  const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  const paragraph = await write(page).locator('p').first().elementHandle();
  await drag(page, 'Existing.md', 'Folder');
  await complete(page);
  await expect
    .poll(async () => page.evaluate(() => (window as MoveWindow).__moveMock.effects))
    .toBe(1);
  expect(await state(page)).toEqual(before);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  expect(await paragraph?.evaluate((element) => element.isConnected)).toBe(true);
  expect(await page.evaluate(() => (window as TestWindow).__desktopMock.nextDocument.path)).toBe(
    '/mock/Creation/Folder/Existing.md',
  );
  expect(await calls(page, 'save_document')).toHaveLength(0);
  expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
  expect(
    (await calls(page, 'inspect_workspace_entry')).map((call) => call.args.relativePath),
  ).toEqual(['Existing.md', 'Folder']);
  const request = (await calls(page, 'move_workspace_entry'))[0]?.args;
  expect(Object.keys(request ?? {}).sort()).toEqual([
    'destinationToken',
    'entryToken',
    'operationId',
    'workspaceId',
  ]);
  await openWorkspaceRootMenu(page);
  await page.getByRole('menuitem', { name: '撤销 移动 Existing.md', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'perform_workspace_file_undo')).length).toBe(1);
  await expect(row(page, 'Existing.md')).toBeVisible();
  expect(await state(page)).toEqual(before);
  expect(await paragraph?.evaluate((element) => element.isConnected)).toBe(true);
  expect(await page.evaluate(() => (window as TestWindow).__desktopMock.nextDocument.path)).toBe(
    '/mock/Creation/Existing.md',
  );
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(write(page)).not.toContainText('AlphaX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
  await expect(write(page)).toContainText('AlphaX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
  await expect.poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text).toBe(raw);
});

test('Articles drag a nested file to a root-file row sends the root capability sentinel', async ({
  page,
}) => {
  await boot(page, true, 'Folder/Child.md');
  const before = await state(page);
  await drag(page, 'Folder/Child.md', 'Existing.md');
  await complete(page);
  await expect(row(page, 'Child.md')).toBeVisible();
  expect((await calls(page, 'move_workspace_entry'))[0]?.args.destinationToken).toBe(
    'creation-workspace',
  );
  expect(
    (await calls(page, 'inspect_workspace_entry')).map((call) => call.args.relativePath),
  ).toEqual(['Folder/Child.md']);
  expect(await state(page)).toEqual(before);
  expect(await calls(page, 'save_document')).toHaveLength(0);
  expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
});

test('directory drag moves its descendants and keeps the current child editor', async ({
  page,
}) => {
  await boot(page, false, 'Folder/Child.md');
  const before = await state(page);
  const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  await drag(page, 'Folder', 'Other');
  await complete(page);
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (window as MoveWindow).__creationMock.entries.map((entry) => entry.relativePath),
      ),
    )
    .toEqual(
      expect.arrayContaining([
        'Other/Folder',
        'Other/Folder/Child.md',
        'Other/Folder/Nested/Deep.md',
      ]),
    );
  expect(await page.evaluate(() => (window as TestWindow).__desktopMock.nextDocument.path)).toBe(
    '/mock/Creation/Other/Folder/Child.md',
  );
  expect(await state(page)).toEqual(before);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  expect(await calls(page, 'save_document')).toHaveLength(0);
  expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
});

test('an ancestor cannot be dropped into its own descendant and a same-parent drop grants nothing', async ({
  page,
}) => {
  await boot(page);
  await row(page, 'Folder').click();
  await expect(row(page, 'Folder/Nested')).toBeVisible();
  const before = await state(page);
  await drag(page, 'Folder', 'Folder/Nested');
  await drag(page, 'Existing.md', 'Existing.md');
  expect(await calls(page, 'move_workspace_entry')).toHaveLength(0);
  expect(await calls(page, 'inspect_workspace_entry')).toHaveLength(0);
  expect(await state(page)).toEqual(before);
  expect(await page.evaluate(() => (window as MoveWindow).__moveMock.effects)).toBe(0);
});

test('a cancelled native move reply preserves the draft, row and source history', async ({
  page,
}) => {
  await boot(page);
  const before = await state(page);
  await page.evaluate(() => {
    (window as MoveWindow).__moveMock.behavior = 'cancel';
  });
  await drag(page, 'Existing.md', 'Folder');
  await complete(page);
  await expect(page.getByText('已取消移动', { exact: true })).toBeVisible();
  await expect(row(page, 'Existing.md')).toBeVisible();
  expect(await state(page)).toEqual(before);
  expect(await page.evaluate(() => (window as MoveWindow).__moveMock.effects)).toBe(0);
  expect(await calls(page, 'resolve_workspace_entry_move')).toHaveLength(0);
  expect(await calls(page, 'save_document')).toHaveLength(0);
});

test('a lost committed reply resolves its original destination once and never repeats a move', async ({
  page,
}) => {
  await boot(page);
  const before = await state(page);
  await page.evaluate(() => {
    (window as MoveWindow).__moveMock.behavior = 'lost';
  });
  await drag(page, 'Existing.md', 'Folder');
  await complete(page);
  await expect.poll(async () => (await calls(page, 'resolve_workspace_entry_move')).length).toBe(1);
  const perform = (await calls(page, 'move_workspace_entry'))[0]?.args;
  expect((await calls(page, 'resolve_workspace_entry_move'))[0]?.args).toEqual(perform);
  expect(await page.evaluate(() => (window as MoveWindow).__moveMock.effects)).toBe(1);
  expect(await state(page)).toEqual(before);
  expect(await calls(page, 'save_document')).toHaveLength(0);
});

test('unknown replies keep the move blocked and checking only queries the same operation', async ({
  page,
}) => {
  await boot(page);
  const before = await state(page);
  await page.evaluate(() => {
    (window as MoveWindow).__moveMock.behavior = 'unknown';
  });
  await drag(page, 'Existing.md', 'Folder');
  await expect.poll(async () => (await calls(page, 'resolve_workspace_entry_move')).length).toBe(1);
  const check = page.getByRole('button', { name: '核对移动结果', exact: true });
  await expect(check).toBeVisible();
  await expect(row(page, 'Existing.md')).toHaveAttribute('draggable', 'false');
  await check.click();
  await expect.poll(async () => (await calls(page, 'resolve_workspace_entry_move')).length).toBe(2);
  expect(await calls(page, 'move_workspace_entry')).toHaveLength(1);
  const request = (await calls(page, 'move_workspace_entry'))[0]?.args;
  for (const query of await calls(page, 'resolve_workspace_entry_move'))
    expect(query.args).toEqual(request);
  expect(await page.evaluate(() => (window as MoveWindow).__moveMock.effects)).toBe(0);
  expect(await state(page)).toEqual(before);
  expect(await calls(page, 'save_document')).toHaveLength(0);
});

test('a discardable blank document opens the confirmed moved file through the existing creation handoff', async ({
  page,
}) => {
  await boot(page, false, null);
  const frame = await page.locator('.marklyra-editor-frame').elementHandle();
  await drag(page, 'Existing.md', 'Folder');
  await complete(page);
  await expect(write(page)).toContainText('Alpha');
  expect(await calls(page, 'open_workspace_document')).toHaveLength(1);
  expect((await calls(page, 'open_workspace_document'))[0]?.args).toMatchObject({
    workspaceId: 'creation-workspace',
    relativePath: 'Folder/Existing.md',
  });
  expect(await calls(page, 'save_document')).toHaveLength(0);
  expect(await frame?.evaluate((el) => el.isConnected)).toBe(true);
});
test('a dirty untitled document keeps its body when a disk entry is moved', async ({ page }) => {
  await boot(page, false, null);
  await write(page).click();
  await page.keyboard.type('Untitled draft');
  await drag(page, 'Existing.md', 'Folder');
  await complete(page);
  await expect(write(page)).toContainText('Untitled draft');
  expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
  expect(await calls(page, 'save_document')).toHaveLength(0);
});
