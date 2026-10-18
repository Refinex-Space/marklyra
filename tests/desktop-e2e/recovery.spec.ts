import { test as base, expect, type Page } from '@playwright/test';
import type { DraftContent } from '../../apps/desktop/src/services/recovery.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock, type RecoveryMockWindow } from './recovery.helpers.js';

// Actual App + runtime SDK. Filesystem, restart storage and IME events below
// are explicitly mocked/synthetic, not native platform acceptance evidence.
const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
const child = (page: Page) => page.frameLocator('.marklyra-editor-frame');
const panel = (page: Page) => page.getByRole('dialog', { name: '恢复未保存的文档' });
async function boot(page: Page, opened = true, source = 'Alpha') {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  if (opened) {
    await page.evaluate((source) => {
      (window as TestWindow).__desktopMock.nextDocument = {
        id: 'doc-a',
        path: '/mock/A.md',
        encoding: 'UTF-8',
        text: source,
      };
    }, source);
    await page.getByRole('button', { name: '打开', exact: true }).click();
    await expect(page.locator('.document-title')).toHaveText('A.md');
  }
}
async function setAutosave(page: Page, enabled: boolean) {
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.getByRole('checkbox', { name: '自动保存文件' }).setChecked(enabled);
  await page.getByRole('button', { name: '完成', exact: true }).click();
}
async function focusEnd(page: Page) {
  const paragraph = child(page).locator('#write > p').last();
  await paragraph.click();
  await paragraph.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let last: Node | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) last = node;
    const range = document.createRange();
    if (last) range.setStart(last, last.textContent?.length ?? 0);
    else range.selectNodeContents(element);
    range.collapse(false);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}
async function type(page: Page, text: string) {
  await focusEnd(page);
  await page.keyboard.type(text);
}
async function calls(page: Page, command: string) {
  return page.evaluate(
    (command) =>
      (window as TestWindow).__desktopMock.calls.filter((call) => call.command === command),
    command,
  );
}
async function records(page: Page) {
  return page.evaluate(() => Object.values((window as RecoveryMockWindow).__recoveryMock.records));
}
async function seed(
  page: Page,
  text = 'Runtime draft',
  savedText = 'Alpha',
  document: DraftContent['document'] = null,
) {
  return page.evaluate(
    ({ text, savedText, document }) =>
      (window as RecoveryMockWindow).__recoveryMock.seed({
        text,
        savedText,
        document,
        selection: null,
      }),
    { text, savedText, document },
  );
}
async function offer(page: Page, associate = false) {
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await panel(page)
    .getByRole('button', { name: associate ? '选择原文件并恢复' : '恢复为新文档', exact: true })
    .click();
}
async function composition(page: Page, phase: 'start' | 'end') {
  if (phase === 'start') await focusEnd(page);
  await child(page)
    .locator('#write')
    .evaluate((element, phase) => {
      element.dispatchEvent(
        new CompositionEvent(`composition${phase}`, { bubbles: true, data: '' }),
      );
    }, phase);
  await page.waitForTimeout(60);
}

test('mocked persistence: explicitly disabled autosave still retains crash drafts for dirty text', async ({
  page,
}) => {
  await boot(page);
  await setAutosave(page, false);
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '自动保存文件' })).not.toBeChecked();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await type(page, 'X');
  await expect
    .poll(async () => (await records(page)).find((record) => record.text === 'AlphaX')?.savedText)
    .toBe('Alpha');
  await page.waitForTimeout(2700);
  expect(await calls(page, 'save_document')).toEqual([]);
  expect(await calls(page, 'save_document_as')).toEqual([]);
  await expect(page.locator('.document-title')).toHaveText('A.md •');
});

test('mocked autosave: enabled by default, idle save retains a clean recovery checkpoint', async ({
  page,
}) => {
  await boot(page);
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '自动保存文件' })).toBeChecked();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await type(page, 'X');
  await expect
    .poll(async () => (await calls(page, 'save_document')).map((call) => call.args.text))
    .toEqual(['AlphaX']);
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await expect
    .poll(async () => (await records(page)).find((record) => record.text === 'AlphaX')?.savedText)
    .toBe('AlphaX');
  expect(await calls(page, 'consume_recovery_draft')).toEqual([]);
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await expect(panel(page)).toContainText('没有需要恢复');
});

test('mocked autosave: continuing keyboard input resets the idle deadline', async ({ page }) => {
  await boot(page);
  await setAutosave(page, true);
  await focusEnd(page);
  for (let count = 0; count < 5; count++) {
    await page.keyboard.type('X');
    await page.waitForTimeout(550);
    expect(await calls(page, 'save_document')).toEqual([]);
  }
  await expect
    .poll(async () => (await calls(page, 'save_document'))[0]?.args.text)
    .toBe('AlphaXXXXX');
});

test('mocked autosave: synthetic composition blocks idle saving until the candidate finishes', async ({
  page,
}) => {
  await boot(page);
  await setAutosave(page, true);
  await type(page, 'X');
  await composition(page, 'start');
  await page.waitForTimeout(2700);
  expect(await calls(page, 'save_document')).toEqual([]);
  await composition(page, 'end');
  await expect.poll(async () => (await calls(page, 'save_document'))[0]?.args.text).toBe('AlphaX');
});

test('mocked autosave: an untitled document never opens a file picker automatically', async ({
  page,
}) => {
  await boot(page, false);
  await expect(page.locator('.document-title')).toHaveText('未命名');
  await setAutosave(page, true);
  await type(page, 'Draft');
  await expect
    .poll(async () => (await records(page)).find((record) => record.text === 'Draft')?.document)
    .toBeNull();
  await page.waitForTimeout(2700);
  expect(await calls(page, 'save_document')).toEqual([]);
  expect(await calls(page, 'save_document_as')).toEqual([]);
  expect(await calls(page, 'open_document')).toHaveLength(0);
});

test('mocked autosave: a detected disk conflict blocks automatic file writes', async ({ page }) => {
  await boot(page);
  await type(page, 'X');
  await page.evaluate(() => {
    const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const previous = internals.invoke;
    internals.invoke = async (command, args) =>
      command === 'check_document_change'
        ? {
            status: 'changed',
            version: 'disk-new',
            document: { id: 'doc-a', path: '/mock/A.md', text: 'External', encoding: 'UTF-8' },
          }
        : previous(command, args);
  });
  await page.getByRole('button', { name: '检查文件变化', exact: true }).click();
  await expect(page.getByRole('status', { name: '磁盘文件变化' })).toBeVisible();
  await setAutosave(page, true);
  await page.waitForTimeout(2700);
  expect(await calls(page, 'save_document')).toEqual([]);
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
});

test('mocked autosave: keyboard edits arriving during native save retain the newer dirty recovery copy', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.deferSave = true;
  });
  await setAutosave(page, true);
  await type(page, 'X');
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingSaves))
    .toBe(1);
  await type(page, 'Y');
  // Settings are locked while a native operation is outstanding. Finish this
  // save, then disable autosave before the newer edit reaches its idle deadline.
  await page.evaluate(() => (window as TestWindow).__desktopMock.finishSave());
  await expect(page.getByRole('button', { name: '偏好设置' })).toBeEnabled();
  await setAutosave(page, false);
  await expect(page.locator('.document-title')).toHaveText('A.md •');
  await expect
    .poll(async () => (await records(page)).find((record) => record.text === 'AlphaXY')?.savedText)
    .toBe('AlphaX');
  expect((await calls(page, 'save_document')).map((call) => call.args.text)).toEqual(['AlphaX']);
});

test('mocked restart: an actual dirty raw source survives page reload and explicit recovery exactly', async ({
  page,
}) => {
  const original = '\ufeff# Runtime\r\n\r\nAlpha\n';
  const edited = '\ufeff# Runtime\r\n\r\nAlphaX\n';
  await boot(page, true, original);
  await type(page, 'X');
  await expect
    .poll(async () => (await records(page)).find((record) => record.text === edited)?.savedText)
    .toBe(original);
  const oldId = (await records(page))[0]?.id;
  await page.reload();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toContainText('/mock/A.md');
  await panel(page).getByRole('button', { name: '恢复为新文档', exact: true }).click();
  await expect(child(page).locator('#write > p').last()).toHaveText('AlphaX');
  await expect
    .poll(async () =>
      (await records(page)).filter((record) => record.id !== oldId).map((record) => record.text),
    )
    .toEqual([edited]);
  await expect
    .poll(async () => (await records(page)).some((record) => record.id === oldId))
    .toBe(false);
  expect(await calls(page, 'save_document')).toEqual([]);
  expect(await calls(page, 'save_document_as')).toEqual([]);
});

test('mocked recovery: explicit original-file association preserves its baseline and leaves runtime text unsaved', async ({
  page,
}) => {
  await boot(page, false);
  const id = await seed(page, 'Runtime edits', 'Alpha', {
    path: '/mock/A.md',
    encoding: 'UTF-8',
  });
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.nextDocument.encoding = 'UTF-8';
  });
  await offer(page, true);
  await expect(child(page).locator('#write')).toHaveText('Runtime edits');
  await expect(page.locator('.document-title')).toHaveText('A.md •');
  await expect
    .poll(async () => (await records(page)).find((record) => record.id !== id)?.savedText)
    .toBe('Alpha');
  await expect
    .poll(async () => (await records(page)).some((record) => record.id === id))
    .toBe(false);
  expect(await calls(page, 'save_document')).toEqual([]);
});

for (const mismatch of ['text', 'path', 'encoding'] as const) {
  test(`mocked recovery: original-file ${mismatch} mismatch preserves the draft and current view`, async ({
    page,
  }) => {
    await boot(page);
    const id = await seed(page, 'Runtime edits', 'Alpha', {
      path: '/mock/A.md',
      encoding: 'UTF-8',
    });
    await page.evaluate((mismatch) => {
      const next = (window as TestWindow).__desktopMock.nextDocument;
      next.id = 'association-result';
      if (mismatch === 'text') next.text = 'External changed';
      if (mismatch === 'path') next.path = '/mock/Other.md';
      if (mismatch === 'encoding') next.encoding = 'UTF-16LE BOM';
    }, mismatch);
    await offer(page, true);
    await expect(page.locator('.statusbar')).toContainText('保存基线不同');
    await expect(child(page).locator('#write')).toHaveText('Alpha');
    expect((await records(page)).find((record) => record.id === id)?.text).toBe('Runtime edits');
    expect(await calls(page, 'consume_recovery_draft')).toEqual([]);
    expect((await calls(page, 'close_document')).map((call) => call.args.id)).toContain(
      'association-result',
    );
  });
}

test('mocked recovery: keyboard input during delayed draft read must not be replaced', async ({
  page,
}) => {
  await boot(page);
  const id = await seed(page);
  await page.evaluate(() => {
    (window as RecoveryMockWindow).__recoveryMock.defer.read_recovery_draft = true;
  });
  await offer(page);
  await expect
    .poll(() => page.evaluate(() => (window as RecoveryMockWindow).__recoveryMock.pending.length))
    .toBe(1);
  await type(page, 'X');
  await page.evaluate(() =>
    (window as RecoveryMockWindow).__recoveryMock.release('read_recovery_draft'),
  );
  await expect(page.locator('.statusbar')).toContainText('恢复期间当前文档已有更改');
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
  expect((await records(page)).some((record) => record.id === id)).toBe(true);
  expect(await calls(page, 'consume_recovery_draft')).toEqual([]);
});

test('mocked recovery: the original copy is not consumed before the replacement checkpoint commits', async ({
  page,
}) => {
  await boot(page);
  const id = await seed(page);
  await page.evaluate(() => {
    (window as RecoveryMockWindow).__recoveryMock.defer.checkpoint_recovery = true;
  });
  await offer(page);
  await expect(child(page).locator('#write')).toHaveText('Runtime draft');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as RecoveryMockWindow).__recoveryMock.pending.filter(
            (call) => call.command === 'checkpoint_recovery',
          ).length,
      ),
    )
    .toBe(1);
  expect((await records(page)).some((record) => record.id === id)).toBe(true);
  expect(await calls(page, 'consume_recovery_draft')).toEqual([]);
  await page.evaluate(() =>
    (window as RecoveryMockWindow).__recoveryMock.release('checkpoint_recovery'),
  );
  await expect
    .poll(async () => (await records(page)).some((record) => record.id === id))
    .toBe(false);
  expect((await records(page)).find((record) => record.id !== id)?.text).toBe('Runtime draft');
});

test('mocked recovery: storage failure keeps the only durable copy and runtime in-memory text', async ({
  page,
}) => {
  await boot(page);
  const id = await seed(page);
  await page.evaluate(() => {
    (window as RecoveryMockWindow).__recoveryMock.fail.checkpoint_recovery = '模拟磁盘已满';
  });
  await offer(page);
  await expect(page.locator('.statusbar')).toContainText('模拟磁盘已满');
  await expect(child(page).locator('#write')).toHaveText('Runtime draft');
  expect((await records(page)).some((record) => record.id === id)).toBe(true);
  expect(await calls(page, 'consume_recovery_draft')).toEqual([]);
  await type(page, 'X');
  await expect(child(page).locator('#write')).toHaveText('Runtime draftX');
});

test('mocked recovery: a read failure preserves both current document and stored draft', async ({
  page,
}) => {
  await boot(page);
  const id = await seed(page);
  await page.evaluate(() => {
    (window as RecoveryMockWindow).__recoveryMock.fail.read_recovery_draft = '模拟恢复读取失败';
  });
  await offer(page);
  await expect(page.locator('.statusbar')).toContainText('模拟恢复读取失败');
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  expect((await records(page)).some((record) => record.id === id)).toBe(true);
  expect(await calls(page, 'consume_recovery_draft')).toEqual([]);
});

test('mocked recovery: a committed checkpoint with a lost reply is replayed exactly before protecting later input', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    (window as RecoveryMockWindow).__recoveryMock.loseCheckpointReplyOnce = true;
  });
  await type(page, 'X');
  await expect(page.locator('.statusbar')).toContainText('IPC 回复丢失');
  expect((await records(page)).find((record) => record.text === 'AlphaX')).toBeTruthy();
  await type(page, 'Y');
  await expect
    .poll(async () => (await records(page)).find((record) => record.text === 'AlphaXY')?.version)
    .toBe(2);
  const checkpointCalls = await calls(page, 'checkpoint_recovery');
  expect(checkpointCalls).toHaveLength(3);
  expect(checkpointCalls[1]?.args.checkpoint).toEqual(checkpointCalls[0]?.args.checkpoint);
  expect(checkpointCalls[2]?.args.checkpoint).toMatchObject({
    text: 'AlphaXY',
    sequence: 2,
    expectedVersion: 1,
  });
});

for (const encoding of ['UTF-8 BOM', 'UTF-16LE BOM', 'UTF-16BE BOM']) {
  test(`mocked recovery: new-document restore retains ${encoding} metadata and passes it to explicit Save As`, async ({
    page,
  }) => {
    await boot(page);
    const metadata = { path: '/mock/Original.md', encoding };
    const id = await seed(page, 'Runtime\r\n\r\nAlpha\n', 'Baseline', metadata);
    await offer(page);
    await expect(child(page).locator('#write > p').last()).toHaveText('Alpha');
    await expect
      .poll(async () => (await records(page)).find((record) => record.id !== id)?.document)
      .toEqual(metadata);
    await type(page, 'X');
    await expect
      .poll(
        async () =>
          (await records(page)).find((record) => record.text.endsWith('AlphaX\n'))?.document,
      )
      .toEqual(metadata);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect
      .poll(async () => (await calls(page, 'save_document_as')).at(-1)?.args)
      .toMatchObject({
        sourceId: null,
        encoding,
        text: 'Runtime\r\n\r\nAlphaX\n',
      });
    await expect(page.locator('.statusbar')).toContainText(encoding);
    await expect(page.locator('.document-title')).toHaveText('A.md');
  });
}

async function deferCloseCleanup(page: Page, clean: boolean) {
  await boot(page);
  await type(page, 'X');
  await expect
    .poll(async () => (await records(page)).find((record) => record.text === 'AlphaX')?.savedText)
    .toBe('Alpha');
  if (clean) {
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.locator('.document-title')).toHaveText('A.md');
    await expect
      .poll(async () => (await records(page)).find((record) => record.text === 'AlphaX')?.savedText)
      .toBe('AlphaX');
  }
  const old = (await records(page)).find((record) => record.text === 'AlphaX');
  if (!old) throw new Error('Missing pre-close recovery checkpoint');
  await page.evaluate(() => {
    (window as RecoveryMockWindow).__recoveryMock.defer.consume_recovery_draft = true;
  });
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('close'));
  if (!clean) {
    const confirmation = page.getByRole('dialog', { name: '保存当前更改？' });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: '放弃修改', exact: true }).click();
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as RecoveryMockWindow).__recoveryMock.pending.filter(
            (call) => call.command === 'consume_recovery_draft',
          ).length,
      ),
    )
    .toBe(1);
  return old.id;
}

for (const clean of [false, true]) {
  test(`mocked close cleanup: ${clean ? 'clean close' : 'explicit discard'} preserves keyboard input arriving while the old record is consumed`, async ({
    page,
  }) => {
    const oldId = await deferCloseCleanup(page, clean);
    await type(page, 'Y');
    await page.evaluate(() =>
      (window as RecoveryMockWindow).__recoveryMock.release('consume_recovery_draft'),
    );
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
    expect(await calls(page, 'close_editor_window')).toEqual([]);
    await expect(child(page).locator('#write')).toHaveText('AlphaXY');
    await expect
      .poll(
        async () =>
          (await records(page)).find((record) => record.id !== oldId && record.text === 'AlphaXY')
            ?.savedText,
      )
      .toBe(clean ? 'AlphaX' : 'Alpha');
    expect((await records(page)).some((record) => record.id === oldId)).toBe(false);
    expect((await calls(page, 'consume_recovery_draft')).map((call) => call.args.id)).toEqual([
      oldId,
    ]);
  });

  test(`mocked close cleanup: ${clean ? 'clean close' : 'explicit discard'} is refused during synthetic composition and later text gets a new checkpoint`, async ({
    page,
  }) => {
    const oldId = await deferCloseCleanup(page, clean);
    await composition(page, 'start');
    await page.evaluate(() =>
      (window as RecoveryMockWindow).__recoveryMock.release('consume_recovery_draft'),
    );
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
    expect(await calls(page, 'close_editor_window')).toEqual([]);
    await expect(child(page).locator('#write')).toHaveText('AlphaX');
    await composition(page, 'end');
    await type(page, 'Y');
    await expect
      .poll(
        async () =>
          (await records(page)).find((record) => record.id !== oldId && record.text === 'AlphaXY')
            ?.savedText,
      )
      .toBe(clean ? 'AlphaX' : 'Alpha');
    expect((await records(page)).some((record) => record.id === oldId)).toBe(false);
    expect((await calls(page, 'consume_recovery_draft')).map((call) => call.args.id)).toEqual([
      oldId,
    ]);
  });
}

async function delayedStartup(page: Page) {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const mock = (window as RecoveryMockWindow).__recoveryMock;
    mock.defer.list_recovery_drafts = true;
    mock.seed({ text: 'A previous unsaved draft', savedText: '', document: null, selection: null });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as RecoveryMockWindow).__recoveryMock.pending.filter(
            (call) => call.command === 'list_recovery_drafts',
          ).length,
      ),
    )
    .toBe(1);
}
async function finishStartupListing(page: Page) {
  await page.evaluate(() => {
    const mock = (window as RecoveryMockWindow).__recoveryMock;
    mock.defer.list_recovery_drafts = false;
    mock.release('list_recovery_drafts');
  });
  await expect(page.locator('.statusbar')).toContainText('发现未保存的恢复副本');
  await expect(panel(page)).toHaveCount(0);
}

test('mocked startup recovery: a late listing does not open a modal or steal focus after real keyboard input', async ({
  page,
}) => {
  await delayedStartup(page);
  await type(page, 'X');
  await expect(page.locator('.document-title')).toHaveText('未命名 •');
  await finishStartupListing(page);
  expect(
    await page.evaluate(
      () => document.activeElement === document.querySelector('.marklyra-editor-frame'),
    ),
  ).toBe(true);
  await page.keyboard.type('Y');
  await expect(child(page).locator('#write > p').last()).toContainText('XY');
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await expect(
    panel(page).getByRole('button', { name: '恢复为新文档', exact: true }),
  ).toBeVisible();
});

test('mocked startup recovery: synthetic composition with unchanged source prevents a late popup', async ({
  page,
}) => {
  await delayedStartup(page);
  await composition(page, 'start');
  await finishStartupListing(page);
  expect(
    await page.evaluate(
      () => document.activeElement === document.querySelector('.marklyra-editor-frame'),
    ),
  ).toBe(true);
  await composition(page, 'end');
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await expect(panel(page)).toBeVisible();
});

test('mocked startup recovery: a late listing does not replace an active unsaved-changes confirmation', async ({
  page,
}) => {
  await delayedStartup(page);
  await type(page, 'X');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('open'));
  const confirmation = page.getByRole('dialog', { name: '保存当前更改？' });
  await expect(confirmation).toBeVisible();
  await finishStartupListing(page);
  await expect(confirmation).toBeVisible();
  const focus = await confirmation.evaluate((element) => ({
    focusedInside: element.contains(document.activeElement),
    active: document.activeElement?.outerHTML.slice(0, 300),
  }));
  expect(focus.focusedInside, JSON.stringify(focus)).toBe(true);
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await expect(child(page).locator('#write > p').last()).toContainText('X');
});

test('mocked startup recovery: a late listing does not interrupt an in-flight file picker operation', async ({
  page,
}) => {
  await delayedStartup(page);
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.deferOpen = true;
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingOpens))
    .toBe(1);
  await finishStartupListing(page);
  await page.evaluate(() => (window as TestWindow).__desktopMock.finishOpen());
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  expect((await records(page)).some((record) => record.text === 'A previous unsaved draft')).toBe(
    true,
  );
});

test('mocked startup recovery: edit then Undo keeps source clean but its changed revision prevents a late popup', async ({
  page,
}) => {
  await delayedStartup(page);
  const before = await child(page).locator('#write').innerText();
  await type(page, 'X');
  await expect(page.locator('.document-title')).toHaveText('未命名 •');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(page.locator('.document-title')).toHaveText('未命名');
  await expect.poll(() => child(page).locator('#write').innerText()).toBe(before);
  await finishStartupListing(page);
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await expect(panel(page)).toBeVisible();
});

test('recovery dialog keyboard access wraps Tab, closes on Escape and restores the trigger focus', async ({
  page,
}, testInfo) => {
  await boot(page);
  await seed(page);
  await page.evaluate(() => {
    const events: { type: string; active: string | null; target: string | null }[] = [];
    Reflect.set(window, '__recoveryFocusEvents', events);
    const label = (target: EventTarget | null) =>
      target instanceof Element
        ? `${target.tagName}:${target.getAttribute('aria-label') ?? target.textContent?.slice(0, 40) ?? ''}`
        : null;
    for (const type of ['mousedown', 'mouseup', 'click', 'focusin', 'focusout']) {
      document.addEventListener(
        type,
        (event) => {
          if (events.length < 80)
            events.push({
              type,
              active: label(document.activeElement),
              target: label(event.target),
            });
        },
        true,
      );
    }
  });
  const trigger = page.getByRole('button', { name: '恢复草稿', exact: true });
  await trigger.focus();
  await trigger.click();
  const dialog = panel(page);
  await expect(dialog.getByRole('button', { name: '恢复为新文档', exact: true })).toBeVisible();
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  const first = dialog.getByRole('button').first();
  const last = dialog.getByRole('button').last();
  await last.focus();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  const box = await dialog.boundingBox();
  expect(box?.width).toBeGreaterThan(700);
  expect(box?.width).toBeLessThan(900);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await testInfo.attach('modal-focus-events', {
    body: JSON.stringify(
      await page.evaluate(() => Reflect.get(window, '__recoveryFocusEvents')),
      null,
      2,
    ),
    contentType: 'application/json',
  });
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('button', { name: '关闭', exact: true }).focus();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('mocked restart: a saved copy does not prompt recovery but remains keyboard-accessible for explicit cleanup', async ({
  page,
}) => {
  await boot(page);
  await type(page, 'X');
  // A file saved before its first dirty checkpoint legitimately has no recovery
  // lease. First establish the durable dirty slot that this case will mark clean.
  await expect
    .poll(async () => (await records(page)).find((record) => record.text === 'AlphaX')?.savedText)
    .toBe('Alpha');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await records(page)).find((record) => record.text === 'AlphaX')?.savedText)
    .toBe('AlphaX');
  const oldId = (await records(page))[0]?.id;
  await page.reload();
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await expect
    .poll(async () => (await calls(page, 'list_recovery_drafts')).length)
    .toBeGreaterThan(0);
  // Allow the already resolved startup listing to commit its React state.
  await page.waitForTimeout(150);
  await expect(panel(page)).toHaveCount(0);
  expect((await records(page)).some((record) => record.id === oldId)).toBe(true);
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  const dialog = panel(page);
  const summary = dialog.locator('summary');
  await expect(summary).toContainText('已保存副本（1）');
  await expect(dialog.getByRole('button', { name: '恢复为新文档', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '刷新', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: '移除已保存副本', exact: true }).click();
  expect((await records(page)).some((record) => record.id === oldId)).toBe(true);
  expect(await calls(page, 'consume_recovery_draft')).toEqual([]);
  await dialog.getByRole('button', { name: '确认移除此副本', exact: true }).click();
  await expect
    .poll(async () => (await records(page)).some((record) => record.id === oldId))
    .toBe(false);
  expect(await calls(page, 'save_document')).toEqual([]);
  expect(await calls(page, 'save_document_as')).toEqual([]);
});

for (const action of ['close', 'open']) {
  test(`native ${action} menu dismisses recovery before the dirty-document confirmation, with keyboard focus remaining in the active dialog`, async ({
    page,
  }) => {
    await boot(page);
    await type(page, 'X');
    await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
    await expect(panel(page)).toBeVisible();
    await page.evaluate((action) => (window as TestWindow).__desktopMock.emitMenu(action), action);
    const confirmation = page.getByRole('dialog', { name: '保存当前更改？' });
    await expect(confirmation).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    const first = confirmation.getByRole('button', { name: '取消', exact: true });
    const last = confirmation.getByRole('button', { name: '保存后继续', exact: true });
    await last.focus();
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(last).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(child(page).locator('#write')).toHaveText('AlphaX');
    await expect(page.locator('.document-title')).toHaveText('A.md •');
    expect(await calls(page, 'open_document')).toHaveLength(1);
    expect(await calls(page, 'close_editor_window')).toEqual([]);
  });
}

for (const committed of [false, true])
  test(`runtime source remains committed when old-record cleanup ${committed ? 'loses its reply' : 'is refused'}`, async ({
    page,
  }) => {
    await boot(page, false);
    const raw = 'Intact restored 中文😀\r\n\r\nTail  \n';
    const id = await seed(page, raw, 'saved baseline\r\n', {
      path: '/mock/original.md',
      encoding: 'UTF-16LE BOM',
    });
    await page.evaluate(
      ({ id, committed }) => {
        const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
          invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
        };
        const original = internals.invoke;
        internals.invoke = async (command, args) => {
          if (command !== 'consume_recovery_draft' || args?.id !== id)
            return original(command, args);
          if (committed) await original(command, args);
          else (window as TestWindow).__desktopMock.calls.push({ command, args });
          throw Error('controlled cleanup result unavailable');
        };
      },
      { id, committed },
    );
    await offer(page);
    await expect(child(page).locator('#write')).toContainText('Intact restored 中文😀');
    await expect(page.locator('.document-status')).toContainText('已恢复为新文档');
    await expect(page.locator('.document-status')).toContainText('清理结果未确认');
    const copies = await records(page);
    expect(copies.some((record) => record.id === id)).toBe(!committed);
    expect(copies.some((record) => record.id !== id && record.text === raw)).toBe(true);
    expect(
      (await calls(page, 'consume_recovery_draft')).filter((call) => call.args.id === id),
    ).toHaveLength(1);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect
      .poll(async () => (await calls(page, 'save_document_as')).at(-1)?.args)
      .toMatchObject({ text: raw, encoding: 'UTF-16LE BOM' });
  });
