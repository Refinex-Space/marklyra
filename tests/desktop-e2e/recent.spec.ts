import { test as base, expect, type Page } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecentMock, type RecentMockWindow } from './recent.helpers.js';
import { installRecoveryMock } from './recovery.helpers.js';

// Real Shell and SDK with modeled recent-file/disk IPC; native IO has separate Rust tests.
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
const panel = (page: Page) => page.getByRole('dialog', { name: '最近文件', exact: true });
async function boot(page: Page, opened = true) {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installRecentMock);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  if (!opened) return;
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await expect
    .poll(() => page.evaluate(() => (window as RecentMockWindow).__recentMock.entries[0]?.path))
    .toBe('/mock/A.md');
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
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
  });
}
async function type(page: Page, text: string) {
  await focusEnd(page);
  await page.keyboard.type(text);
}
const entries = (page: Page) =>
  page.evaluate(() => (window as RecentMockWindow).__recentMock.entries);
const seed = (page: Page, path = '/mock/B.md', text = 'Bravo') =>
  page.evaluate(({ path, text }) => (window as RecentMockWindow).__recentMock.seed(path, text), {
    path,
    text,
  });
const calls = (page: Page, command: string) =>
  page.evaluate(
    (command) =>
      (window as TestWindow).__desktopMock.calls.filter((call) => call.command === command),
    command,
  );
async function show(page: Page) {
  await page.getByRole('button', { name: '最近文件', exact: true }).click();
  await expect(panel(page)).toBeVisible();
}
async function choose(page: Page, path = '/mock/B.md') {
  await show(page);
  await panel(page)
    .getByRole('button', { name: `打开最近文件 ${path}`, exact: true })
    .click();
}
async function composition(page: Page, phase: 'start' | 'end') {
  if (phase === 'start') await focusEnd(page);
  await child(page)
    .locator('#write')
    .evaluate(
      (element, phase) =>
        element.dispatchEvent(
          new CompositionEvent(`composition${phase}`, { bubbles: true, data: '' }),
        ),
      phase,
    );
  await page.waitForTimeout(60);
}

test('recent files persist across modeled restart, deduplicate and reopen using only an opaque ID', async ({
  page,
}) => {
  await boot(page);
  const a = (await entries(page))[0];
  await seed(page);
  await page.reload();
  await expect(page.getByRole('button', { name: '最近文件', exact: true })).toBeEnabled();
  await choose(page, '/mock/A.md');
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  await expect.poll(async () => (await entries(page))[0]?.id).toBe(a?.id);
  expect(await entries(page)).toHaveLength(2);
  expect((await calls(page, 'open_recent_file'))[0]?.args).toEqual({ id: a?.id });
  expect(await calls(page, 'open_document')).toEqual([]);
  expect((await calls(page, 'remember_recent_file'))[0]?.args).toEqual({
    documentId: expect.stringMatching(/^recent-doc-/),
  });
});

test('a native recent entry uses the same IME and unsaved-document guards before opening its opaque ID', async ({
  page,
}) => {
  await boot(page);
  const id = await seed(page);
  const nativeChoose = () =>
    page.evaluate((id) => (window as TestWindow).__desktopMock.emitMenu(`recent-open:${id}`), id);
  await composition(page, 'start');
  await nativeChoose();
  await expect(page.locator('.statusbar')).toContainText('请先完成输入法候选');
  expect(await calls(page, 'open_recent_file')).toHaveLength(0);
  await composition(page, 'end');
  await type(page, 'X');
  await nativeChoose();
  await expect(page.getByRole('dialog', { name: '保存当前更改？' })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
  expect(await calls(page, 'open_recent_file')).toHaveLength(0);
  await nativeChoose();
  await page.getByRole('button', { name: '保存后继续', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('B.md');
  await expect(child(page).locator('#write')).toHaveText('Bravo');
  expect((await calls(page, 'save_document')).at(-1)?.args.text).toBe('AlphaX');
  expect((await calls(page, 'open_recent_file')).at(-1)?.args).toEqual({ id });
  await expect(panel(page)).not.toBeVisible();
});

test('successful Save As records its newly authorized destination and retains the original recent reference', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    (window as RecentMockWindow).__recentMock.saveAsPath = '/mock/Copy.md';
  });
  await type(page, 'X');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save-as'));
  await expect(page.locator('.document-title')).toHaveText('Copy.md');
  await expect
    .poll(async () => (await entries(page)).map((entry) => entry.path))
    .toEqual(['/mock/Copy.md', '/mock/A.md']);
  expect(
    await page.evaluate(() => (window as RecentMockWindow).__recentMock.files['/mock/A.md']?.text),
  ).toBe('Alpha');
  expect(
    await page.evaluate(
      () => (window as RecentMockWindow).__recentMock.files['/mock/Copy.md']?.text,
    ),
  ).toBe('AlphaX');
});

test('removing and clearing recent entries never removes current or stored file data', async ({
  page,
}) => {
  await boot(page);
  await seed(page);
  await show(page);
  await panel(page).getByRole('button', { name: '移除最近记录 /mock/B.md', exact: true }).click();
  await expect(
    panel(page).getByRole('button', { name: '打开最近文件 /mock/B.md', exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as RecentMockWindow).__recentMock.files['/mock/B.md']?.text),
  ).toBe('Bravo');
  await panel(page).getByRole('button', { name: '清空最近文件', exact: true }).click();
  await expect(panel(page)).toContainText('暂无最近打开');
  expect(
    await page.evaluate(() => (window as RecentMockWindow).__recentMock.files['/mock/A.md']?.text),
  ).toBe('Alpha');
  await panel(page).getByRole('button', { name: '关闭', exact: true }).click();
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  expect(await calls(page, 'close_document')).toEqual([]);
});

test('missing recent file reports an error without removing its record or the current document', async ({
  page,
}) => {
  await boot(page);
  const id = await seed(page);
  await page.evaluate(() => {
    delete (window as RecentMockWindow).__recentMock.files['/mock/B.md'];
  });
  await choose(page);
  await expect(page.locator('.statusbar')).toContainText('最近文件不存在');
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  expect((await entries(page)).some((entry) => entry.id === id)).toBe(true);
  expect(await calls(page, 'close_document')).toEqual([]);
});

test('dirty document cancel and save-before-open use the existing document confirmation flow', async ({
  page,
}) => {
  await boot(page);
  await seed(page);
  await type(page, 'X');
  await choose(page);
  const confirmation = page.getByRole('dialog', { name: '保存当前更改？' });
  await expect(confirmation).toBeVisible();
  expect(await calls(page, 'open_recent_file')).toEqual([]);
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
  await choose(page);
  await confirmation.getByRole('button', { name: '保存后继续', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('B.md');
  await expect(child(page).locator('#write')).toHaveText('Bravo');
  expect(
    await page.evaluate(() => (window as RecentMockWindow).__recentMock.files['/mock/A.md']?.text),
  ).toBe('AlphaX');
});

test('explicit discard before opening a recent file does not save the discarded changes', async ({
  page,
}) => {
  await boot(page);
  await seed(page);
  await type(page, 'X');
  await choose(page);
  await page
    .getByRole('dialog', { name: '保存当前更改？' })
    .getByRole('button', { name: '放弃修改', exact: true })
    .click();
  await expect(page.locator('.document-title')).toHaveText('B.md');
  expect(await calls(page, 'save_document')).toEqual([]);
  expect(
    await page.evaluate(() => (window as RecentMockWindow).__recentMock.files['/mock/A.md']?.text),
  ).toBe('Alpha');
});

test('delayed recent open cannot overwrite ordinary keyboard input and closes only the incoming session', async ({
  page,
}) => {
  await boot(page);
  await seed(page);
  await page.evaluate(() => {
    (window as RecentMockWindow).__recentMock.deferOpen = true;
  });
  await choose(page);
  await expect
    .poll(() => page.evaluate(() => (window as RecentMockWindow).__recentMock.pendingOpens))
    .toBe(1);
  await type(page, 'X');
  await page.evaluate(() => (window as RecentMockWindow).__recentMock.releaseOpen());
  await expect(page.locator('.statusbar')).toContainText('打开期间当前文档已有更改');
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
  await expect(page.locator('.document-title')).toHaveText('A.md •');
  expect((await calls(page, 'close_document')).map((call) => call.args.id)).toEqual([
    expect.stringMatching(/^recent-doc-/),
  ]);
});

test('synthetic IME arriving during a delayed recent open preserves the old document', async ({
  page,
}) => {
  await boot(page);
  await seed(page);
  await page.evaluate(() => {
    (window as RecentMockWindow).__recentMock.deferOpen = true;
  });
  await choose(page);
  await expect
    .poll(() => page.evaluate(() => (window as RecentMockWindow).__recentMock.pendingOpens))
    .toBe(1);
  await composition(page, 'start');
  await page.evaluate(() => (window as RecentMockWindow).__recentMock.releaseOpen());
  await expect(page.locator('.statusbar')).toContainText('请先完成输入法候选');
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  expect((await calls(page, 'close_document')).map((call) => call.args.id)).toEqual([
    expect.stringMatching(/^recent-doc-/),
  ]);
  await composition(page, 'end');
});

test('synthetic composition blocks opening the recent chooser through the native menu', async ({
  page,
}) => {
  await boot(page);
  await composition(page, 'start');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('recent-files'));
  await expect(page.locator('.statusbar')).toContainText('请先完成输入法候选');
  await expect(panel(page)).toHaveCount(0);
  expect(await calls(page, 'open_recent_file')).toEqual([]);
  await composition(page, 'end');
});

test('a recent metadata write failure does not turn a successfully saved file into a failed document save', async ({
  page,
}) => {
  await boot(page);
  await type(page, 'X');
  await page.evaluate(() => {
    (window as RecentMockWindow).__recentMock.rememberError = '最近记录损坏';
  });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await expect(page.locator('.statusbar')).toContainText('无法更新最近文件');
  expect(
    await page.evaluate(() => (window as RecentMockWindow).__recentMock.files['/mock/A.md']?.text),
  ).toBe('AlphaX');
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
});

test('failed file save does not record success and retains the dirty document', async ({
  page,
}) => {
  await boot(page);
  const before = await calls(page, 'remember_recent_file');
  await type(page, 'X');
  await page.evaluate(() => {
    (window as RecentMockWindow).__recentMock.saveError = '文件为只读';
  });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.statusbar')).toContainText('文件为只读');
  await expect(page.locator('.document-title')).toHaveText('A.md •');
  expect(await calls(page, 'remember_recent_file')).toEqual(before);
  expect(
    await page.evaluate(() => (window as RecentMockWindow).__recentMock.files['/mock/A.md']?.text),
  ).toBe('Alpha');
});

test('corrupt recent metadata is visible and explicit clear repairs the list without changing a file', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    (window as RecentMockWindow).__recentMock.listError = '最近文件记录损坏';
  });
  await show(page);
  await expect(panel(page).getByRole('alert')).toContainText('最近文件记录损坏');
  await panel(page).getByRole('button', { name: '清空最近文件', exact: true }).click();
  await expect(panel(page)).toContainText('暂无最近打开');
  expect(
    await page.evaluate(() => (window as RecentMockWindow).__recentMock.files['/mock/A.md']?.text),
  ).toBe('Alpha');
});

test('a stale list response cannot resurrect a record removed while refresh was pending', async ({
  page,
}) => {
  await boot(page);
  await seed(page);
  await show(page);
  await expect(
    panel(page).getByRole('button', { name: '打开最近文件 /mock/B.md', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as RecentMockWindow).__recentMock.holdNextList = true;
  });
  await panel(page).getByRole('button', { name: '刷新', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as RecentMockWindow).__recentMock.pendingLists))
    .toBe(1);
  await panel(page).getByRole('button', { name: '移除最近记录 /mock/B.md', exact: true }).click();
  await expect(
    panel(page).getByRole('button', { name: '打开最近文件 /mock/B.md', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => (window as RecentMockWindow).__recentMock.releaseList());
  await page.waitForTimeout(80);
  await expect(
    panel(page).getByRole('button', { name: '打开最近文件 /mock/B.md', exact: true }),
  ).toHaveCount(0);
  expect(await entries(page)).toHaveLength(1);
});

test('recent chooser supports keyboard focus and does not overlap the unsaved confirmation', async ({
  page,
}) => {
  await boot(page);
  await type(page, 'X');
  const trigger = page.getByRole('button', { name: '最近文件', exact: true });
  await show(page);
  await panel(page).getByRole('button', { name: '关闭', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(panel(page).getByRole('button').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await show(page);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('open'));
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
});

test('a stale recent ID removed by another window cannot fall back to a displayed path', async ({
  page,
}) => {
  await boot(page);
  const id = await seed(page);
  await show(page);
  const row = panel(page).getByRole('button', { name: '打开最近文件 /mock/B.md', exact: true });
  await expect(row).toBeVisible();
  // A different process does not share the same in-process event emitter.
  await page.evaluate((id) => {
    const mock = (window as RecentMockWindow).__recentMock;
    mock.entries = mock.entries.filter((entry) => entry.id !== id);
  }, id);
  await row.click();
  await expect(page.locator('.statusbar')).toContainText('最近记录已被移除');
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  expect(await calls(page, 'open_document')).toHaveLength(1);
});

test('rejected recent Markdown restores the previous edited view and Undo history', async ({
  page,
}) => {
  await boot(page);
  await seed(page, '/mock/Rejected.md', 'Unsupported \uE027 marker');
  await type(page, 'X');
  await choose(page, '/mock/Rejected.md');
  await page
    .getByRole('dialog', { name: '保存当前更改？' })
    .getByRole('button', { name: '放弃修改', exact: true })
    .click();
  await expect(page.locator('.statusbar')).toContainText('normalization');
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
  await expect(page.locator('.document-title')).toHaveText('A.md •');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  expect(await calls(page, 'remember_recent_file')).toHaveLength(1);
});

test('an untitled dirty document can be saved before opening a recent entry', async ({ page }) => {
  await boot(page, false);
  await seed(page);
  await expect(page.locator('.document-title')).toHaveText('未命名');
  await type(page, 'Draft');
  await choose(page);
  await page
    .getByRole('dialog', { name: '保存当前更改？' })
    .getByRole('button', { name: '保存后继续', exact: true })
    .click();
  await expect(page.locator('.document-title')).toHaveText('B.md');
  expect((await calls(page, 'save_document_as'))[0]?.args.text).toBe('Draft');
  expect(
    await page.evaluate(
      () => (window as RecentMockWindow).__recentMock.files['/mock/Saved.md']?.text,
    ),
  ).toBe('Draft');
  expect((await entries(page)).map((entry) => entry.path)).toEqual([
    '/mock/B.md',
    '/mock/Saved.md',
  ]);
});

test('StrictMode late event-listener registration is cleaned up when the chooser closes', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    const releases: (() => void)[] = [];
    Reflect.set(window, '__recentListenerReleases', releases);
    const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const previous = internal.invoke;
    internal.invoke = async (command, args = {}) => {
      const result = await previous(command, args);
      if (command === 'plugin:event|listen' && args.event === 'recent-files-changed')
        return new Promise((resolve) => releases.push(() => resolve(result)));
      return result;
    };
  });
  await show(page);
  await expect
    .poll(() =>
      page.evaluate(() => (Reflect.get(window, '__recentListenerReleases') as unknown[]).length),
    )
    .toBe(2);
  await page.evaluate(() => {
    for (const release of (
      Reflect.get(window, '__recentListenerReleases') as (() => void)[]
    ).splice(0))
      release();
  });
  await page.waitForTimeout(50);
  await panel(page).getByRole('button', { name: '关闭', exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
  await page.waitForTimeout(50);
  const before = (await calls(page, 'list_recent_files')).length;
  await page.evaluate(() =>
    (window as TestWindow).__desktopMock.emitEvent('recent-files-changed', null),
  );
  await page.waitForTimeout(80);
  expect(await calls(page, 'list_recent_files')).toHaveLength(before);
});
