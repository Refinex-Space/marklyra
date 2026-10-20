import { test as base, expect, type FrameLocator, type Page } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { draftSource, installRecoveryMock } from './recovery-test-util.js';

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

async function calls(page: Page, command: string) {
  return page.evaluate(
    (command) =>
      (window as TestWindow).__desktopMock.calls.filter((call) => call.command === command),
    command,
  );
}
function child(page: Page): FrameLocator {
  return page.frameLocator('.marklyra-editor-frame');
}
async function focusAtDocumentEnd(page: Page): Promise<void> {
  await page.locator('.marklyra-editor-frame').focus();
  await child(page)
    .locator('#write > p')
    .last()
    .evaluate((element) => {
      const doc = element.ownerDocument;
      (element as HTMLElement).focus();
      const range = doc.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      doc.getSelection()?.removeAllRanges();
      doc.getSelection()?.addRange(range);
    });
}
async function openA(page: Page): Promise<void> {
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await expect(child(page).locator('#write')).toHaveText('Alpha');
}
async function beginComposition(page: Page): Promise<void> {
  await focusAtDocumentEnd(page);
  await child(page)
    .locator('#write')
    .evaluate((element) => {
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    });
  // The parent receives the real SDK composition notification asynchronously.
  await page.waitForTimeout(40);
}
async function finishComposition(page: Page): Promise<void> {
  await child(page)
    .locator('#write')
    .evaluate((element) => {
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    });
  await page.waitForTimeout(60);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(child(page).locator('#write')).toBeVisible();
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await openA(page);
});
test.afterEach(async ({ page }, testInfo) => {
  await testInfo.attach('mocked-IPC-calls', {
    body: JSON.stringify(
      await page.evaluate(() => (window as TestWindow).__desktopMock.calls),
      null,
      2,
    ),
    contentType: 'application/json',
  });
});

test('runtime App / mocked IPC: pending save locks modal actions and retains later keyboard edits', async ({
  page,
}) => {
  await focusAtDocumentEnd(page);
  await page.keyboard.type('X');
  await page.keyboard.press('Meta+o');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.deferSave = true;
  });
  await dialog.getByRole('button', { name: '保存后继续' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingSaves))
    .toBe(1);
  for (const name of ['取消', '放弃修改', '保存后继续'])
    await expect(dialog.getByRole('button', { name, exact: true })).toBeDisabled();
  await focusAtDocumentEnd(page);
  await page.keyboard.type('Y');
  await expect(child(page).locator('#write')).toHaveText('AlphaXY');
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.finishSave();
  });
  await expect(page.locator('.statusbar')).toContainText('保存期间文档又有更改');
  await expect(dialog).toBeVisible();
  await expect(child(page).locator('#write')).toHaveText('AlphaXY');
  expect((await calls(page, 'save_document'))[0]?.args).toEqual({ id: 'doc-a', text: 'AlphaX' });
  expect(await calls(page, 'close_document')).toEqual([]);
  expect(await calls(page, 'close_editor_window')).toEqual([]);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.deferSave = false;
  });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe('AlphaXY');
  await expect(page.locator('.document-title')).toHaveText('A.md');
});

test('runtime App / mocked IPC: modal remains locked during the post-save runtime flush', async ({
  page,
}) => {
  await focusAtDocumentEnd(page);
  await page.keyboard.type('X');
  await page.keyboard.press('Meta+o');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.deferSave = true;
  });
  await dialog.getByRole('button', { name: '保存后继续' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingSaves))
    .toBe(1);
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.holdStateResponses = true;
    mock.finishSave();
  });
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.heldStateResponses))
    .toBeGreaterThan(0);
  for (const name of ['取消', '放弃修改', '保存后继续'])
    await expect(dialog.getByRole('button', { name, exact: true })).toBeDisabled();
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.emitMenu('open');
    mock.emitMenu('close');
  });
  expect((await calls(page, 'open_document')).length).toBe(1);
  expect(await calls(page, 'close_editor_window')).toEqual([]);
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.releaseStateResponses();
  });
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await expect(child(page).locator('#write')).toHaveText('Alpha');
});

test('runtime App / mocked IPC: synthetic composition blocks native save/open/close and child shortcuts', async ({
  page,
}) => {
  const baseline = (await calls(page, 'open_document')).length;
  await beginComposition(page);
  await page.evaluate(() => {
    for (const action of ['save', 'open', 'close', 'new'])
      (window as TestWindow).__desktopMock.emitMenu(action);
  });
  await expect(page.locator('.statusbar')).toContainText('请先完成输入法候选');
  expect(await calls(page, 'save_document')).toEqual([]);
  expect((await calls(page, 'open_document')).length).toBe(baseline);
  expect(await calls(page, 'close_editor_window')).toEqual([]);
  await child(page)
    .locator('#write')
    .evaluate((element) => {
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
      // Same child task as compositionend: trailing native candidate handling is still gated.
      for (const key of ['s', 'o', 'n'])
        element.dispatchEvent(
          new KeyboardEvent('keydown', { bubbles: true, cancelable: true, metaKey: true, key }),
        );
    });
  await page.waitForTimeout(80);
  expect(await calls(page, 'save_document')).toEqual([]);
  expect((await calls(page, 'open_document')).length).toBe(baseline);
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  await focusAtDocumentEnd(page);
  await page.keyboard.insertText('中');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args)
    .toEqual({ id: 'doc-a', text: 'Alpha中' });
});

test('runtime App / mocked IPC: delayed open during synthetic composition releases only incoming document', async ({
  page,
}) => {
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.deferOpen = true;
    mock.nextDocument = { id: 'doc-b', path: '/mock/B.md', text: 'Beta', encoding: 'UTF-8' };
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingOpens))
    .toBe(1);
  await beginComposition(page);
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.finishOpen();
  });
  await expect
    .poll(async () => (await calls(page, 'close_document')).map((call) => call.args.id))
    .toEqual(['doc-b']);
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  await finishComposition(page);
  await focusAtDocumentEnd(page);
  await page.keyboard.type('X');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args)
    .toEqual({ id: 'doc-a', text: 'AlphaX' });
});

test('runtime App / mocked IPC: delayed open never overwrites ordinary keyboard edits', async ({
  page,
}) => {
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.deferOpen = true;
    mock.holdChanged = true;
    mock.holdDirty = true;
    mock.nextDocument = { id: 'doc-b', path: '/mock/B.md', text: 'Beta', encoding: 'UTF-8' };
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingOpens))
    .toBe(1);
  await focusAtDocumentEnd(page);
  await page.keyboard.type('X');
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
  await expect(page.locator('.statusbar')).toContainText('处理中');
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.finishOpen();
  });
  await expect
    .poll(async () => (await calls(page, 'close_document')).map((call) => call.args.id))
    .toEqual(['doc-b']);
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
  await expect(page.locator('.document-title')).toContainText('A.md');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args)
    .toEqual({ id: 'doc-a', text: 'AlphaX' });
});

test('runtime App / mocked IPC: rejected SourceMirror load keeps prior view and document authority', async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.nextDocument = {
      id: 'doc-b',
      path: '/mock/B.md',
      text: 'Unsupported \uE027 marker\n',
      encoding: 'UTF-8',
    };
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.statusbar')).toContainText('Unverified serializer normalization');
  await expect
    .poll(async () => (await calls(page, 'close_document')).map((call) => call.args.id))
    .toEqual(['doc-b']);
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  await focusAtDocumentEnd(page);
  await page.keyboard.type('X');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args)
    .toEqual({ id: 'doc-a', text: 'AlphaX' });
});

test('runtime App / mocked IPC: immediate CmdSave flushes the child even when parent changed notifications arrive late', async ({
  page,
}) => {
  // Let the initial on-demand statistics request settle before holding notifications.
  await expect(page.getByRole('button', { name: '文档统计' })).toContainText('5 字符');
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.holdChanged = true;
  });
  await focusAtDocumentEnd(page);
  await page.keyboard.type('X');
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
  // Test transport deliberately holds changed events. The shell still displays the old cache.
  await expect(page.locator('.statusbar')).toContainText('5 字符');
  await page.keyboard.press('Meta+s');
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args)
    .toEqual({ id: 'doc-a', text: 'AlphaX' });
  await expect(page.locator('.document-title')).toHaveText('A.md');
  const authority = await child(page)
    .locator('body')
    .evaluate(() => ({ tauri: 'isTauri' in window, ipc: '__TAURI_INTERNALS__' in window }));
  expect(authority).toEqual({ tauri: false, ipc: false });
});

test('runtime App / mocked IPC: waiting to close the previous file cannot erase a new document draft', async ({
  page,
}) => {
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.deferClose = true;
    mock.nextDocument = { id: 'doc-b', path: '/mock/B.md', text: 'Beta', encoding: 'UTF-8' };
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingCloses))
    .toBe(1);
  await expect(page.locator('.document-title')).toHaveText('B.md');
  await expect(child(page).locator('#write')).toHaveText('Beta');
  await focusAtDocumentEnd(page);
  await page.keyboard.type('Z');
  await expect.poll(() => draftSource(page)).toBe('BetaZ');
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.deferClose = false;
    mock.finishClose();
  });
  await expect(page.locator('.statusbar')).not.toContainText('处理中');
  await expect.poll(() => draftSource(page)).toBe('BetaZ');
  await expect(child(page).locator('#write')).toHaveText('BetaZ');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args)
    .toEqual({ id: 'doc-b', text: 'BetaZ' });
});

test('HTML export uses current unsaved content and leaves the Markdown draft dirty', async ({
  page,
}) => {
  await focusAtDocumentEnd(page);
  await page.keyboard.type('X');
  await page.getByRole('button', { name: '导出 HTML', exact: true }).click();
  await expect(page.locator('.notice-host')).toContainText('已导出 HTML · /mock/A.html');
  const exported = (await calls(page, 'save_export_html'))[0]?.args;
  expect(exported?.suggestedName).toBe('A.md');
  const html = String(exported?.html);
  expect(html).toContain('AlphaX');
  expect(html).toContain('<title>A.md</title>');
  expect(html).not.toMatch(/<script\b|<iframe\b|http:\/\/127\.0\.0\.1:4174/);
  expect(await calls(page, 'save_document')).toEqual([]);
  expect(await calls(page, 'save_document_as')).toEqual([]);
  await expect(page.locator('.document-title')).toHaveText('A.md •');
  await expect.poll(() => draftSource(page)).toBe('AlphaX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
});

test('native export and print menu actions deliver independent read-only HTML snapshots', async ({
  page,
}) => {
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('print-preview'));
  await expect(page.locator('.notice-host')).toContainText('已打开打印预览');
  expect((await calls(page, 'open_print_preview'))[0]?.args.title).toBe('A.md');
  expect(String((await calls(page, 'open_print_preview'))[0]?.args.html)).toContain('Alpha');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('export-html'));
  await expect(page.locator('.notice-host')).toContainText('已导出 HTML');
  expect(await calls(page, 'save_document')).toEqual([]);
  await expect(page.locator('.document-title')).toHaveText('A.md');
});

test('export cancellation is silent and an export write error leaves the editor usable', async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.exportError = '已取消导出';
  });
  await page.getByRole('button', { name: '导出 HTML', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'save_export_html')).length).toBe(1);
  await expect(page.getByRole('button', { name: '导出 HTML', exact: true })).toBeEnabled();
  await expect(page.locator('.notice-host')).not.toContainText('取消');
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.exportError = '目标文件已被外部修改';
  });
  await page.getByRole('button', { name: '导出 HTML', exact: true }).click();
  await expect(page.locator('.notice-host')).toContainText('目标文件已被外部修改');
  await focusAtDocumentEnd(page);
  await page.keyboard.type('X');
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe('AlphaX');
});

test('pending native export suppresses duplicate actions while later edits stay unsaved', async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.deferExport = true;
  });
  await page.getByRole('button', { name: '导出 HTML', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'save_export_html')).length).toBe(1);
  await expect(page.getByRole('button', { name: '导出 HTML', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '打印预览', exact: true })).toBeDisabled();
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.emitMenu('export-html');
    mock.emitMenu('print-preview');
  });
  await focusAtDocumentEnd(page);
  await page.keyboard.type('X');
  await page.evaluate(() => (window as TestWindow).__desktopMock.finishExport());
  await expect(page.locator('.notice-host')).toContainText('已导出 HTML');
  expect((await calls(page, 'save_export_html')).length).toBe(1);
  expect(await calls(page, 'open_print_preview')).toEqual([]);
  expect(String((await calls(page, 'save_export_html'))[0]?.args.html)).not.toContain('AlphaX');
  await expect(page.locator('.document-title')).toHaveText('A.md •');
  await expect.poll(() => draftSource(page)).toBe('AlphaX');
});

test('synthetic composition and the unsaved-document dialog block export menu actions', async ({
  page,
}) => {
  await beginComposition(page);
  await page.evaluate(() => {
    for (const action of ['export-html', 'print-preview'])
      (window as TestWindow).__desktopMock.emitMenu(action);
  });
  await expect(page.locator('.notice-host')).toContainText('请先完成输入法候选');
  expect(await calls(page, 'save_export_html')).toEqual([]);
  expect(await calls(page, 'open_print_preview')).toEqual([]);
  await finishComposition(page);
  await focusAtDocumentEnd(page);
  await page.keyboard.type('X');
  await page.keyboard.press('Meta+o');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => {
    for (const action of ['export-html', 'print-preview'])
      (window as TestWindow).__desktopMock.emitMenu(action);
  });
  expect(await calls(page, 'save_export_html')).toEqual([]);
  expect(await calls(page, 'open_print_preview')).toEqual([]);
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
});

test('a native Undo delivered after a completed save preserves mixed CRLF history without transient protocol errors', async ({
  page,
}) => {
  const original = 'Start\r\n\r\nsame\r\n\r\nsame\n\nEnd\n';
  const deleted = 'Start\r\n\r\nsame\n\nEnd\n';
  await page.evaluate((text) => {
    (window as TestWindow).__desktopMock.nextDocument = {
      id: 'repeated-doc',
      path: '/mock/repeated.md',
      text,
      encoding: 'UTF-8',
    };
  }, original);
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('repeated.md');
  await child(page)
    .locator('#write')
    .evaluate((root) => {
      const blocks = root.querySelectorAll(':scope > p');
      const start = blocks[1]?.firstChild,
        end = blocks[2]?.firstChild;
      if (!start || !end) throw new Error('Missing repeated blocks');
      (root as HTMLElement).focus();
      const range = document.createRange();
      range.setStart(start, 0);
      range.setEnd(end, 0);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
  await page.keyboard.press('Backspace');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe(deleted);
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  // Model the observed delivery order deterministically, without assuming native
  // physical key timing: Save has finished when the native Undo message arrives.
  await page.evaluate(() => {
    const reports: string[] = [];
    Object.assign(window, { __undoProtocolReports: reports });
    const status = document.querySelector('.statusbar');
    if (status)
      new MutationObserver(() => reports.push(status.textContent ?? '')).observe(status, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    (window as TestWindow).__desktopMock.emitMenu('undo');
  });
  await expect.poll(() => draftSource(page)).toBe(original);
  await expect(child(page).locator('#write > p')).toHaveCount(4);
  await expect(page.locator('.statusbar')).not.toContainText('History checkpoint');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe(original);
  await expect.poll(() => draftSource(page)).toBeNull();
  const reports = await page.evaluate(
    () => Reflect.get(window, '__undoProtocolReports') as string[],
  );
  expect(
    reports.filter((message) => /History checkpoint|Runtime checkpoint/.test(message)),
  ).toEqual([]);
});
