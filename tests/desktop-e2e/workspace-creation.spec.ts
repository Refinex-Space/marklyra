import { expect, type Page, test } from '@playwright/test';
import { type CreationWindow, installCreationMock } from './creation-test-util.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

const runtimeUrl = process.env.CREATION_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html';
async function boot(page: Page, options: { articles?: boolean; nested?: boolean } = {}) {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installCreationMock, { runtimeUrl, ...options });
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.workspace-root-row')).toHaveText('Creation');
  await expect(
    page.locator(
      options.articles ? '.workspace-articles' : '.workspace-directory-tree > .workspace-branch',
    ),
  ).toHaveAttribute('aria-busy', 'false');
}
const calls = (page: Page, command: string) =>
  page.evaluate(
    (command) =>
      (window as TestWindow).__desktopMock.calls.filter((call) => call.command === command),
    command,
  );
const write = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');
async function newFile(page: Page) {
  await page.locator('.sidebar').hover();
  await page.getByRole('button', { name: '新建文件', exact: true }).click();
}
async function state(page: Page) {
  return page
    .frameLocator('.marklyra-editor-frame')
    .locator('body')
    .evaluate(() => {
      const editor = Reflect.get(window, 'editor') as {
        undo: { commandStack: unknown; index: number };
        getMarkdown(): string;
      };
      return {
        canonical: editor.getMarkdown(),
        history: JSON.stringify([editor.undo.commandStack, editor.undo.index]),
      };
    });
}

test('clean untitled creates and opens before naming; Escape preserves the actual created entity', async ({
  page,
}) => {
  await boot(page);
  const frame = await page.locator('.marklyra-editor-frame').elementHandle();
  await newFile(page);
  const input = page.getByRole('textbox', { name: '文件名', exact: true });
  await expect(input).toBeFocused();
  expect(
    await input.evaluate((element: HTMLInputElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([0, 8]);
  await test
    .info()
    .attach('tree-inline', { body: await page.screenshot(), contentType: 'image/png' });
  await test.info().attach('tree-input-geometry', {
    body: JSON.stringify(
      await input.evaluate((element) => {
        const rect = element.getBoundingClientRect(),
          style = getComputedStyle(element);
        return {
          width: rect.width,
          height: rect.height,
          font: style.font,
          lineHeight: style.lineHeight,
        };
      }),
    ),
    contentType: 'application/json',
  });
  const creation = await calls(page, 'create_workspace_entry');
  expect(creation).toHaveLength(1);
  expect(creation[0]?.args).toMatchObject({
    workspaceId: 'creation-workspace',
    parentRelativePath: '',
    kind: 'file',
  });
  expect(await calls(page, 'open_workspace_document')).toHaveLength(1);
  await input.fill('DiscardedName.md');
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(page.locator('button[data-entry-path="Untitled.md"]')).toBeVisible();
  expect(await calls(page, 'rename_workspace_creation')).toHaveLength(0);
  expect(await calls(page, 'finish_workspace_creation')).toHaveLength(1);
  expect(await frame?.evaluate((element) => element.isConnected)).toBe(true);
  expect(
    await page.evaluate(() =>
      (window as CreationWindow).__creationMock.entries.some(
        (entry) => entry.relativePath === 'Untitled.md',
      ),
    ),
  ).toBe(true);
});

for (const named of [true, false]) {
  test(`${named ? 'named' : 'dirty untitled'} keeps the editor model/history while collision retry and blur rename only the new entity`, async ({
    page,
  }) => {
    await boot(page);
    if (named) {
      await page.evaluate(() => {
        const mock = (window as TestWindow).__desktopMock;
        mock.nextDocument.text = '\uFEFFAlpha\r\n';
        mock.emitMenu('open');
      });
      await expect(write(page)).toHaveText('Alpha');
    }
    await write(page)
      .locator('p')
      .last()
      .evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let last: Node | null = null;
        while (walker.nextNode()) last = walker.currentNode;
        const range = document.createRange();
        if (last) range.setStart(last, last.textContent?.length ?? 0);
        else {
          range.selectNodeContents(element);
          range.collapse(false);
        }
        range.collapse(true);
        const selection = getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        (document.querySelector('#write') as HTMLElement).focus();
      });
    await page.keyboard.type('X');
    await expect(write(page)).toHaveText(named ? 'AlphaX' : 'X');
    // End the original typing group before taking an exact history baseline.
    // prepareCreatedDocument legitimately flushes/endSnap before creation.
    await write(page).evaluate(() => {
      (Reflect.get(window, 'editor') as { undo: { endSnap(): void } }).undo.endSnap();
    });
    const before = await state(page);
    const frame = await page.locator('.marklyra-editor-frame').elementHandle();
    await newFile(page);
    const input = page.getByRole('textbox', { name: '文件名', exact: true });
    await expect(input).toBeFocused();
    expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
    await page.evaluate(() => {
      (window as CreationWindow).__creationMock.failedRename = true;
    });
    await input.fill('中文.md');
    await input.press('Enter');
    await expect(page.getByRole('alert')).toContainText('目标名称已存在');
    await expect(input).toHaveValue('中文.md');
    await input.fill('Final.md');
    await page.getByRole('button', { name: '全文搜索', exact: true }).focus();
    await expect(input).toHaveCount(0);
    expect(
      (await calls(page, 'rename_workspace_creation')).map((call) => call.args.newName),
    ).toEqual(['中文.md', 'Final.md']);
    expect(await state(page)).toEqual(before);
    expect(await frame?.evaluate((element) => element.isConnected)).toBe(true);
    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
    await expect(write(page)).toHaveText(named ? 'Alpha' : '');
    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
    await expect(write(page)).toHaveText(named ? 'AlphaX' : 'X');
    if (named) {
      await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
      await expect
        .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
        .toBe('\uFEFFAlphaX\r\n');
    }
  });
}

test('directory context creates inside its target and IME candidate Enter never submits the folder name', async ({
  page,
}) => {
  await boot(page);
  await page.locator('[data-entry-path="Folder"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '新建文件夹', exact: true }).click();
  const input = page.getByRole('textbox', { name: '文件夹名称', exact: true });
  await expect(input).toBeFocused();
  expect((await calls(page, 'create_workspace_entry'))[0]?.args).toMatchObject({
    parentRelativePath: 'Folder',
    kind: 'directory',
  });
  expect(
    await input.evaluate((element: HTMLInputElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([0, 15]);
  await input.dispatchEvent('compositionstart');
  await input.fill('中文目录');
  await input.dispatchEvent('keydown', {
    key: 'Enter',
    keyCode: 13,
    isComposing: true,
    bubbles: true,
  });
  expect(await calls(page, 'rename_workspace_creation')).toHaveLength(0);
  await input.dispatchEvent('compositionend');
  await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true });
  expect(await calls(page, 'rename_workspace_creation')).toHaveLength(0);
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(page.locator('button[data-entry-path="Folder/中文目录"]')).toBeVisible();
  expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
});

test('failed create retries its original operation id, and a later user navigation prevents focus takeover', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    (window as CreationWindow).__creationMock.failedCreate = true;
  });
  await newFile(page);
  await expect(page.getByRole('alert')).toContainText('Create response lost');
  await page.evaluate(() => {
    (window as CreationWindow).__creationMock.hold = true;
  });
  await page.getByRole('button', { name: '重试创建', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as CreationWindow).__creationMock.pending))
    .toBe(1);
  await page.getByRole('button', { name: '全文搜索', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索文件', exact: true }).fill('Keep typing');
  await page.evaluate(() => (window as CreationWindow).__creationMock.release());
  await expect.poll(async () => (await calls(page, 'finish_workspace_creation')).length).toBe(1);
  await expect(page.getByRole('searchbox', { name: '搜索文件', exact: true })).toBeFocused();
  await expect(page.getByRole('textbox', { name: '文件名', exact: true })).toHaveCount(0);
  const creation = await calls(page, 'create_workspace_entry');
  expect(creation).toHaveLength(2);
  expect(creation[1]?.args.operationId).toBe(creation[0]?.args.operationId);
  expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
  expect(
    await page.evaluate(
      () =>
        (window as CreationWindow).__creationMock.entries.filter(
          (entry) => entry.relativePath === 'Untitled.md',
        ).length,
    ),
  ).toBe(1);
});

test('root-only Articles uses inline naming while a rendered nested article uses the real host dialog', async ({
  page,
}) => {
  await boot(page, { articles: true });
  await expect(page.locator('.workspace-article')).toHaveCount(1);
  await newFile(page);
  const input = page.getByRole('textbox', { name: '文件名', exact: true });
  await expect(input).toBeFocused();
  await test
    .info()
    .attach('articles-inline', { body: await page.screenshot(), contentType: 'image/png' });
  await input.fill('Article.md');
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(page.locator('button[data-article-path="Article.md"]')).toBeVisible();
  expect(await calls(page, 'create_workspace_file_with_dialog')).toHaveLength(0);
  await page.goto('about:blank');
  await page.addInitScript(() => {
    if (window === window.top)
      (window as CreationWindow).__creationMock?.entries.push({
        name: 'Nested.md',
        relativePath: 'Folder/Nested.md',
        kind: 'file',
        size: 0,
      });
  });
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.workspace-article')).toHaveCount(2);
  await newFile(page);
  await expect
    .poll(async () => (await calls(page, 'create_workspace_file_with_dialog')).length)
    .toBe(1);
  expect(await calls(page, 'create_workspace_entry')).toHaveLength(0);
  await expect(page.getByRole('textbox', { name: '文件名', exact: true })).toHaveCount(0);
});

test('late created-document open keeps a newly focused Shell control and releases naming authority', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    (window as CreationWindow).__creationMock.holdOpen = true;
  });
  await newFile(page);
  await expect
    .poll(() => page.evaluate(() => (window as CreationWindow).__creationMock.pendingOpen))
    .toBe(1);
  const control = page.getByRole('button', { name: '全文搜索', exact: true });
  await control.focus();
  await page.evaluate(() => (window as CreationWindow).__creationMock.releaseOpen());
  await expect.poll(async () => (await calls(page, 'finish_workspace_creation')).length).toBe(1);
  await expect(control).toBeFocused();
  await expect(page.getByRole('textbox', { name: '文件名', exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as CreationWindow).__creationMock.entries.some(
        (entry) => entry.relativePath === 'Untitled.md',
      ),
    ),
  ).toBe(true);
});

for (const articles of [false, true]) {
  test(`${articles ? 'Articles' : 'Tree'} successful creation rename hands off actual editor focus before the immediate first key`, async ({
    page,
  }) => {
    await boot(page, { articles });
    await newFile(page);
    const input = page.getByRole('textbox', { name: '文件名', exact: true });
    await expect(input).toBeFocused();
    await input.fill('Created.md');
    await input.press('Enter');
    // No editor click, focus workaround, delayed retry or second key.
    await expect(input).toHaveCount(0);
    await expect(page.locator('.marklyra-editor-frame')).toBeFocused();
    await page.keyboard.type('x');
    await expect(write(page)).toHaveText('x');
    expect(await calls(page, 'rename_workspace_creation')).toHaveLength(1);
    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
    await expect.poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text).toBe('x');
  });
}

test('a named dirty document regains its original caret/history after another file is created and renamed', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('open'));
  await expect(write(page)).toHaveText('Alpha');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await write(page)
    .locator('p')
    .evaluate((element) => {
      (document.querySelector('#write') as HTMLElement).focus();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let text: Node | null = null;
      while (walker.nextNode()) {
        if (walker.currentNode.textContent === 'Alpha') {
          text = walker.currentNode;
          break;
        }
      }
      if (!text) throw Error('Missing real paragraph text');
      getSelection()?.setBaseAndExtent(text, 5, text, 5);
    });
  await page.keyboard.type('X');
  await expect(write(page)).toHaveText('AlphaX');
  await newFile(page);
  const input = page.getByRole('textbox', { name: '文件名', exact: true });
  await expect(input).toBeFocused();
  await input.fill('Other.md');
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(page.locator('.marklyra-editor-frame')).toBeFocused();
  await page.keyboard.type('y');
  await expect(write(page)).toHaveText('AlphaXy');
  expect(await calls(page, 'open_workspace_document')).toHaveLength(0);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(write(page)).toHaveText('AlphaX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
  await expect(write(page)).toHaveText('AlphaXy');
});

for (const finish of ['Escape', 'Enter']) {
  test(`Articles ${finish === 'Escape' ? 'cancel' : 'unchanged'} naming restores the editor while retaining the created entity`, async ({
    page,
  }) => {
    await boot(page, { articles: true });
    await newFile(page);
    const input = page.getByRole('textbox', { name: '文件名', exact: true });
    await expect(input).toBeFocused();
    await input.press(finish);
    await expect(input).toHaveCount(0);
    await expect(page.locator('.marklyra-editor-frame')).toBeFocused();
    await page.keyboard.type('z');
    await expect(write(page)).toHaveText('z');
    expect(await calls(page, 'rename_workspace_creation')).toHaveLength(0);
    expect(
      await page.evaluate(() =>
        (window as CreationWindow).__creationMock.entries.some(
          (entry) => entry.relativePath === 'Untitled.md',
        ),
      ),
    ).toBe(true);
  });
}

test('naming stays mounted and read-only until the actual child focus reply, then accepts the unique first key', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (window === window.top) return;
    let armed = false;
    let held: MessageEvent | null = null;
    Reflect.set(window, '__armCreationFocus', () => {
      armed = true;
    });
    Reflect.set(window, '__releaseCreationFocus', () => {
      if (!held) throw Error('No held creation focus request');
      const event = held;
      held = null;
      window.dispatchEvent(
        new MessageEvent('message', {
          data: event.data,
          source: event.source,
          origin: event.origin,
        }),
      );
    });
    window.addEventListener(
      'message',
      (event) => {
        if (
          armed &&
          event.data?.protocol === 'marklyra/editor/v1' &&
          event.data.kind === 'request' &&
          event.data.operation === 'focus'
        ) {
          armed = false;
          held = event;
          Reflect.set(window, '__creationFocusHeld', true);
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  });
  await boot(page, { articles: true });
  await newFile(page);
  const input = page.getByRole('textbox', { name: '文件名', exact: true });
  await expect(input).toBeFocused();
  await write(page).evaluate(() => (Reflect.get(window, '__armCreationFocus') as () => void)());
  const ownedInput = await input.elementHandle();
  await input.fill('Ready.md');
  await input.press('Enter');
  await expect
    .poll(() => write(page).evaluate(() => Reflect.get(window, '__creationFocusHeld')))
    .toBe(true);
  await expect(input).toBeVisible();
  expect(
    await ownedInput?.evaluate(
      (element) =>
        element.isConnected && element === document.querySelector('.workspace-creation-input'),
    ),
  ).toBe(true);
  expect(
    await ownedInput?.evaluate((element) =>
      element.closest('[data-entry-path]')?.getAttribute('data-entry-path'),
    ),
  ).toBe('Untitled.md');
  await expect(input).toHaveJSProperty('readOnly', true);
  await expect(page.getByRole('button', { name: '新建文件', exact: true })).toBeDisabled();
  expect(await calls(page, 'finish_workspace_creation')).toHaveLength(1);
  await write(page).evaluate(() => (Reflect.get(window, '__releaseCreationFocus') as () => void)());
  await expect(input).toHaveCount(0);
  await page.keyboard.type('q');
  await expect(write(page)).toHaveText('q');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
  await expect.poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text).toBe('q');
});
