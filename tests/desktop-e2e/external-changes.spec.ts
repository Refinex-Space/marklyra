import { test as base, expect, type Page } from '@playwright/test';
import type { DocumentChange } from '../../apps/desktop/src/services/documents.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { draftSource, installRecoveryMock } from './recovery-test-util.js';

interface DiskMock {
  change: DocumentChange;
  deferCheck: boolean;
  deferAccept: boolean;
  deferWatch: boolean;
  checks: number;
  pendingChecks: number;
  pendingAccepts: number;
  pendingWatches: number;
  leases: { id: string; watchId: string }[];
  accepted: string[];
  finishCheck(): void;
  finishAccept(): void;
  finishWatch(index: number): void;
  signal(): void;
}
type DiskWindow = TestWindow & { __diskMock: DiskMock };
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

// Real Shell and runtime SDK, with deterministic disk versions and native watch leases.
// This does not claim real filesystem notifications or platform dialogs.
function installDiskMock() {
  if (window !== window.top) return;
  const target = window as DiskWindow;
  const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const invoke = internals.invoke;
  const reads: (() => void)[] = [],
    accepts: (() => void)[] = [],
    watches: (() => void)[] = [];
  let serial = 0;
  const mock: DiskMock = {
    change: { status: 'unchanged' },
    deferCheck: false,
    deferAccept: false,
    deferWatch: false,
    checks: 0,
    pendingChecks: 0,
    pendingAccepts: 0,
    pendingWatches: 0,
    leases: [],
    accepted: [],
    finishCheck() {
      reads.shift()?.();
      this.pendingChecks = reads.length;
    },
    finishAccept() {
      accepts.shift()?.();
      this.pendingAccepts = accepts.length;
    },
    finishWatch(index) {
      watches.splice(index, 1)[0]?.();
      this.pendingWatches = watches.length;
    },
    signal() {
      for (const lease of this.leases)
        target.__desktopMock.emitEvent('document-disk-change', lease);
    },
  };
  target.__diskMock = mock;
  internals.invoke = async (command, args = {}) => {
    const own = [
      'check_document_change',
      'accept_document_change',
      'dismiss_document_change',
      'start_document_watch',
      'stop_document_watch',
    ].includes(command);
    if (own) target.__desktopMock.calls.push({ command, args });
    if (command === 'check_document_change') {
      mock.checks++;
      const result = structuredClone(mock.change);
      if (mock.deferCheck)
        return new Promise((resolve) => {
          reads.push(() => resolve(result));
          mock.pendingChecks = reads.length;
        });
      return result;
    }
    if (command === 'accept_document_change') {
      const finish = () => {
        const current = mock.change;
        if (
          current.status !== 'changed' ||
          current.version !== args.version ||
          current.document.id !== args.id
        )
          throw new Error('磁盘版本在载入期间再次发生变化');
        mock.accepted.push(current.version);
        mock.change = { status: 'unchanged' };
        return current.document;
      };
      if (mock.deferAccept)
        return new Promise((resolve, reject) => {
          accepts.push(() => {
            try {
              resolve(finish());
            } catch (error) {
              reject(error);
            }
          });
          mock.pendingAccepts = accepts.length;
        });
      return finish();
    }
    if (command === 'dismiss_document_change') return true;
    if (command === 'start_document_watch') {
      const finish = () => {
        const lease = { id: String(args.id), watchId: `lease-${++serial}` };
        mock.leases.push(lease);
        return { status: 'watching', watchId: lease.watchId };
      };
      if (mock.deferWatch)
        return new Promise((resolve) => {
          watches.push(() => resolve(finish()));
          mock.pendingWatches = watches.length;
        });
      return finish();
    }
    if (command === 'stop_document_watch') {
      mock.leases = mock.leases.filter(
        (lease) => lease.id !== args.id || lease.watchId !== args.watchId,
      );
      return true;
    }
    if (command === 'save_document' && mock.change.status !== 'unchanged') {
      target.__desktopMock.calls.push({ command, args });
      throw new Error('文件已被外部程序修改，请另存为');
    }
    if (command === 'save_document_as') {
      const result = (await invoke(command, args)) as { text: string; encoding: string };
      mock.change = { status: 'unchanged' };
      return { ...result, id: 'doc-copy', path: '/mock/Copy.md' };
    }
    return invoke(command, args);
  };
}

const child = (page: Page) => page.frameLocator('.marklyra-editor-frame');
const notice = (page: Page) => page.getByRole('status', { name: '磁盘文件变化' });
async function calls(page: Page, command: string) {
  return page.evaluate(
    (command) =>
      (window as DiskWindow).__desktopMock.calls.filter((call) => call.command === command),
    command,
  );
}
async function begin(page: Page, source = 'Alpha', deferWatch = false) {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installDiskMock);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.evaluate(
    ({ source, deferWatch }) => {
      const target = window as DiskWindow;
      target.__desktopMock.nextDocument.text = source;
      target.__diskMock.deferWatch = deferWatch;
    },
    { source, deferWatch },
  );
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('A.md');
  if (!deferWatch) {
    await expect
      .poll(() => page.evaluate(() => (window as DiskWindow).__diskMock.leases.length))
      .toBe(1);
    await expect
      .poll(() => page.evaluate(() => (window as DiskWindow).__diskMock.checks))
      .toBeGreaterThan(0);
  }
}
async function disk(page: Page, source: string, version = 'v1', id = 'doc-a') {
  await page.evaluate(
    ({ source, version, id }) => {
      (window as DiskWindow).__diskMock.change = {
        status: 'changed',
        version,
        document: { id, path: '/mock/A.md', text: source, encoding: 'UTF-8' },
      };
    },
    { source, version, id },
  );
}
async function focusEnd(page: Page) {
  const paragraph = child(page).locator('#write > p').last();
  await paragraph.click();
  await paragraph.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text: Node | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) text = node;
    if (!text) throw new Error('Missing text endpoint');
    const range = document.createRange();
    range.setStart(text, text.textContent?.length ?? 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}
const menu = (page: Page, action: string) =>
  page.evaluate((action) => (window as DiskWindow).__desktopMock.emitMenu(action), action);

test('clean document automatically reloads external raw bytes and Undo/Redo use the new saved baseline', async ({
  page,
}) => {
  const original = '# Note\r\n\r\nAlpha\n',
    updated = '\ufeff# Note\n\nBeta\r\n';
  await begin(page, original);
  await disk(page, updated);
  await page.evaluate(() => (window as DiskWindow).__diskMock.signal());
  await expect(child(page).locator('#write > p').last()).toHaveText('Beta');
  await expect
    .poll(() => page.evaluate(() => (window as DiskWindow).__diskMock.accepted))
    .toEqual(['v1']);
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await menu(page, 'undo');
  await expect(child(page).locator('#write > p').last()).toHaveText('Alpha');
  await expect(page.locator('.document-title')).toHaveText('A.md •');
  await expect.poll(() => draftSource(page)).toBe(original);
  await menu(page, 'redo');
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe(updated);
});

test('dirty file remains editable, keeping local content cannot authorize overwriting external bytes', async ({
  page,
}) => {
  await begin(page);
  await focusEnd(page);
  await page.keyboard.type('X');
  await disk(page, 'Beta');
  await page.getByRole('button', { name: '检查文件变化', exact: true }).click();
  await expect(notice(page)).toBeVisible();
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
  expect(await calls(page, 'accept_document_change')).toEqual([]);
  await notice(page).getByRole('button', { name: '继续编辑' }).click();
  await expect(notice(page)).toHaveCount(0);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.statusbar')).toContainText('文件已被外部程序修改');
  await page.getByRole('button', { name: '查看磁盘变化', exact: true }).click();
  await notice(page).getByRole('button', { name: '载入磁盘版本' }).click();
  await expect(child(page).locator('#write')).toHaveText('Beta');
  await menu(page, 'undo');
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
  await expect(page.locator('.document-title')).toHaveText('A.md •');
});

test('typing while the disk check is pending prevents automatic replacement', async ({ page }) => {
  await begin(page);
  await disk(page, 'Beta');
  await page.evaluate(() => {
    (window as DiskWindow).__diskMock.deferCheck = true;
  });
  await page.getByRole('button', { name: '检查文件变化', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as DiskWindow).__diskMock.pendingChecks))
    .toBe(1);
  await focusEnd(page);
  await page.keyboard.type('X');
  await page.evaluate(() => {
    const m = (window as DiskWindow).__diskMock;
    m.deferCheck = false;
    m.finishCheck();
  });
  await expect(notice(page)).toBeVisible();
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
  expect(await calls(page, 'accept_document_change')).toEqual([]);
});

test('typing during disk acceptance stays dirty and survives the saved-baseline update', async ({
  page,
}) => {
  await begin(page);
  await disk(page, 'Beta');
  await page.evaluate(() => {
    (window as DiskWindow).__diskMock.deferAccept = true;
  });
  await page.getByRole('button', { name: '检查文件变化', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as DiskWindow).__diskMock.pendingAccepts))
    .toBe(1);
  await expect(child(page).locator('#write')).toHaveText('Beta');
  await focusEnd(page);
  await page.keyboard.type('X');
  await page.evaluate(() => {
    const m = (window as DiskWindow).__diskMock;
    m.deferAccept = false;
    m.finishAccept();
  });
  await expect(page.locator('.document-title')).toHaveText('A.md •');
  await expect(child(page).locator('#write')).toHaveText('BetaX');
  await expect.poll(() => draftSource(page)).toBe('BetaX');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe('BetaX');
});

test('a newer external version during acceptance is not silently accepted or written over', async ({
  page,
}) => {
  await begin(page);
  await disk(page, 'Beta');
  await page.evaluate(() => {
    (window as DiskWindow).__diskMock.deferAccept = true;
  });
  await page.getByRole('button', { name: '检查文件变化', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as DiskWindow).__diskMock.pendingAccepts))
    .toBe(1);
  await disk(page, 'Gamma', 'v2');
  await page.evaluate(() => {
    const m = (window as DiskWindow).__diskMock;
    m.deferAccept = false;
    m.finishAccept();
  });
  await expect(page.locator('.statusbar')).toContainText('磁盘版本在载入期间再次发生变化');
  await expect(child(page).locator('#write')).toHaveText('Beta');
  await expect(page.locator('.document-title')).toHaveText('A.md •');
  expect(await page.evaluate(() => (window as DiskWindow).__diskMock.accepted)).toEqual([]);
  expect(await calls(page, 'save_document')).toEqual([]);
});

test('missing files preserve current content and offer Save As without writing the missing path', async ({
  page,
}) => {
  await begin(page);
  await page.evaluate(() => {
    (window as DiskWindow).__diskMock.change = { status: 'missing', message: '文件已被移动或删除' };
  });
  await page.getByRole('button', { name: '检查文件变化', exact: true }).click();
  await expect(notice(page)).toContainText('文件已被移动或删除');
  await notice(page).getByRole('button', { name: '另存为…' }).click();
  await expect(page.locator('.document-title')).toHaveText('Copy.md');
  expect((await calls(page, 'save_document_as')).at(-1)?.args.text).toBe('Alpha');
  expect(await calls(page, 'save_document')).toEqual([]);
  await expect(notice(page)).toHaveCount(0);
});

test('out-of-order watch starts clean up only their own lease after document switching', async ({
  page,
}) => {
  await begin(page, 'Alpha', true);
  await expect
    .poll(() => page.evaluate(() => (window as DiskWindow).__diskMock.pendingWatches))
    .toBe(1);
  await page.evaluate(() => {
    (window as DiskWindow).__desktopMock.nextDocument = {
      id: 'doc-b',
      path: '/mock/B.md',
      text: 'Beta',
      encoding: 'UTF-8',
    };
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('B.md');
  await expect
    .poll(() => page.evaluate(() => (window as DiskWindow).__diskMock.pendingWatches))
    .toBe(2);
  await page.evaluate(() => {
    const m = (window as DiskWindow).__diskMock;
    m.finishWatch(1);
    m.finishWatch(0);
  });
  await expect
    .poll(() =>
      page.evaluate(() => (window as DiskWindow).__diskMock.leases.map((lease) => lease.id)),
    )
    .toEqual(['doc-b']);
  await disk(page, 'Gamma', 'v2', 'doc-b');
  await page.evaluate(() => (window as DiskWindow).__diskMock.signal());
  await expect(child(page).locator('#write')).toHaveText('Gamma');
});

test('synthetic IME allows detection but blocks automatic and manual replacement', async ({
  page,
}) => {
  await begin(page);
  await focusEnd(page);
  await child(page)
    .locator('#write')
    .evaluate((element) =>
      element.dispatchEvent(
        new CompositionEvent('compositionstart', { bubbles: true, data: 'ni' }),
      ),
    );
  await page.waitForTimeout(40);
  await disk(page, 'Beta');
  await page.evaluate(() => (window as DiskWindow).__diskMock.signal());
  await expect(notice(page)).toBeVisible();
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  await notice(page).getByRole('button', { name: '载入磁盘版本' }).click();
  await expect(page.locator('.statusbar')).toContainText('请先完成当前编辑操作');
  expect(await calls(page, 'accept_document_change')).toEqual([]);
  await child(page)
    .locator('#write')
    .evaluate((element) =>
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
    );
  // Once preedit ends the clean document may already reload through a queued
  // focus/watch check. Use the persistent check control, not the transient notice.
  await page.getByRole('button', { name: '检查文件变化', exact: true }).click();
  await expect(child(page).locator('#write')).toHaveText('Beta');
});

test('an unreadable or unsupported external version never discards existing editing history', async ({
  page,
}) => {
  await begin(page);
  await focusEnd(page);
  await page.keyboard.type('X');
  await page.evaluate(() => {
    (window as DiskWindow).__diskMock.change = {
      status: 'unreadable',
      reason: 'unsupported-encoding',
      message: '不支持磁盘文件编码',
    };
  });
  await page.getByRole('button', { name: '检查文件变化', exact: true }).click();
  await expect(notice(page)).toContainText('不支持磁盘文件编码');
  await disk(page, 'Unsupported \uE027 marker\n');
  await notice(page).getByRole('button', { name: '重新检查' }).click();
  await notice(page).getByRole('button', { name: '载入磁盘版本' }).click();
  await expect(page.locator('.statusbar')).toContainText('Unverified serializer normalization');
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
  expect(await calls(page, 'accept_document_change')).toEqual([]);
  await menu(page, 'undo');
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  await menu(page, 'redo');
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
});

test('a late disk-check response for the previous document cannot replace the new file', async ({
  page,
}) => {
  await begin(page);
  await disk(page, 'External A');
  await page.evaluate(() => {
    (window as DiskWindow).__diskMock.deferCheck = true;
  });
  await page.getByRole('button', { name: '检查文件变化', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as DiskWindow).__diskMock.pendingChecks))
    .toBe(1);
  await page.evaluate(() => {
    const target = window as DiskWindow;
    target.__desktopMock.nextDocument = {
      id: 'doc-b',
      path: '/mock/B.md',
      text: 'Beta',
      encoding: 'UTF-8',
    };
    target.__diskMock.change = { status: 'unchanged' };
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('B.md');
  await page.evaluate(() => {
    const m = (window as DiskWindow).__diskMock;
    m.deferCheck = false;
    m.finishCheck();
  });
  await expect(child(page).locator('#write')).toHaveText('Beta');
  await expect(notice(page)).toHaveCount(0);
  expect(await calls(page, 'accept_document_change')).toEqual([]);
});

test('stale watch tokens are ignored while the current lease still detects changes', async ({
  page,
}) => {
  await begin(page);
  await disk(page, 'Beta');
  await page.evaluate(() =>
    (window as DiskWindow).__desktopMock.emitEvent('document-disk-change', {
      id: 'doc-a',
      watchId: 'stale-lease',
    }),
  );
  await page.waitForTimeout(300);
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  expect(await calls(page, 'accept_document_change')).toEqual([]);
  await page.evaluate(() => (window as DiskWindow).__diskMock.signal());
  await expect(child(page).locator('#write')).toHaveText('Beta');
});

test('held changed notifications during acceptance do not erase the newer draft or its next save', async ({
  page,
}) => {
  await begin(page);
  await disk(page, 'Beta');
  await page.evaluate(() => {
    (window as DiskWindow).__diskMock.deferAccept = true;
  });
  await page.getByRole('button', { name: '检查文件变化', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as DiskWindow).__diskMock.pendingAccepts))
    .toBe(1);
  await page.evaluate(() => {
    (window as DiskWindow).__desktopMock.holdChanged = true;
  });
  await focusEnd(page);
  await page.keyboard.type('X');
  await page.evaluate(() => {
    const m = (window as DiskWindow).__diskMock;
    m.deferAccept = false;
    m.finishAccept();
  });
  await expect(page.locator('.statusbar')).not.toContainText('处理中');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe('BetaX');
  await expect(child(page).locator('#write')).toHaveText('BetaX');
  await expect(page.locator('.document-title')).toHaveText('A.md');
});

test('composition beginning during acceptance blocks close and survives baseline commitment', async ({
  page,
}) => {
  await begin(page);
  await disk(page, 'Beta');
  await page.evaluate(() => {
    (window as DiskWindow).__diskMock.deferAccept = true;
  });
  await page.getByRole('button', { name: '检查文件变化', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as DiskWindow).__diskMock.pendingAccepts))
    .toBe(1);
  // Real composition starts in a focused editable range, never on the host's check button.
  await focusEnd(page);
  await child(page)
    .locator('#write')
    .evaluate((element) =>
      element.dispatchEvent(
        new CompositionEvent('compositionstart', { bubbles: true, data: 'ni' }),
      ),
    );
  await page.waitForTimeout(40);
  await page.evaluate(() => {
    const m = (window as DiskWindow).__diskMock;
    m.deferAccept = false;
    m.finishAccept();
  });
  await expect(page.locator('.statusbar')).not.toContainText('处理中');
  await menu(page, 'close');
  await expect(page.locator('.statusbar')).toContainText('请先完成输入法候选');
  expect(await calls(page, 'close_editor_window')).toEqual([]);
  await child(page)
    .locator('#write')
    .evaluate((element) =>
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
    );
  await page.waitForTimeout(50);
  await focusEnd(page);
  await page.keyboard.insertText('中');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(async () => (await calls(page, 'save_document')).at(-1)?.args.text)
    .toBe('Beta中');
});

test('keeping the local version remains explicit even after Undo returns to clean and disk versions change again', async ({
  page,
}) => {
  await begin(page);
  await focusEnd(page);
  await page.keyboard.type('X');
  await disk(page, 'Beta');
  await page.getByRole('button', { name: '检查文件变化', exact: true }).click();
  await notice(page).getByRole('button', { name: '继续编辑' }).click();
  await menu(page, 'undo');
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  await expect(page.locator('.document-title')).toHaveText('A.md');
  for (const [version, source] of [
    ['v2', 'Gamma'],
    ['v3', 'Gamma'],
    ['v4', 'Delta'],
  ]) {
    await disk(page, source ?? '', version ?? '');
    const checks = await page.evaluate(() => (window as DiskWindow).__diskMock.checks);
    await page.getByRole('button', { name: '检查文件变化', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as DiskWindow).__diskMock.checks))
      .toBeGreaterThan(checks);
    await expect(page.getByRole('button', { name: '检查文件变化', exact: true })).toBeEnabled();
    await expect(child(page).locator('#write')).toHaveText('Alpha');
  }
  expect(await calls(page, 'accept_document_change')).toEqual([]);
});
