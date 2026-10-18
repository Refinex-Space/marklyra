import { test as base, expect } from '@playwright/test';
import { preferencesKey } from '../../apps/desktop/src/features/settings/preferences.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('A.md');
});
test('preferences restore theme and toolbar visibility after reload without changing source', async ({
  page,
}) => {
  await page.getByRole('button', { name: '偏好设置' }).click();
  const panel = page.getByRole('dialog', { name: '偏好设置' });
  await panel.getByLabel('主题', { exact: true }).selectOption('marklyra-dark');
  await panel.getByLabel('显示格式工具栏').uncheck();
  await panel.getByLabel('状态栏主要单位').selectOption('characters');
  await panel.getByLabel('阅读速度（词 / 分钟）').fill('240');
  await panel.getByRole('button', { name: '完成' }).click();
  await expect(page.locator('.format-toolbar')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.document-title')).toHaveText('A.md');
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter((call) => call.command === 'save_document'),
    ),
  ).toHaveLength(0);
  await page.reload();
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '偏好设置' }).click();
  await expect(panel.getByLabel('主题', { exact: true })).toHaveValue('marklyra-dark');
  await expect(panel.getByLabel('显示格式工具栏')).not.toBeChecked();
  await expect(panel.getByLabel('阅读速度（词 / 分钟）')).toHaveValue('240');
  await expect(panel.getByLabel('状态栏主要单位')).toHaveValue('characters');
});
test('settings traps keyboard focus including form fields and Escape returns to trigger', async ({
  page,
}) => {
  const trigger = page.getByRole('button', { name: '偏好设置' });
  await trigger.click();
  const panel = page.getByRole('dialog', { name: '偏好设置' });
  await expect(panel.getByRole('button', { name: '完成' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(panel.getByLabel('主题', { exact: true })).toBeFocused();
  await panel.getByLabel('自动保存文件').focus();
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', { name: '完成' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(panel.getByLabel('自动保存文件')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
});
test('sidebar keyboard and pointer resize persists and preserves the editor instance', async ({
  page,
}) => {
  const handle = page.getByRole('separator', { name: '调整侧栏宽度' });
  const iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  await handle.focus();
  await page.keyboard.press('Home');
  await expect(handle).toHaveAttribute('aria-valuenow', '180');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '220');
  const savedWidth = () =>
    page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}').sidebarWidth,
      preferencesKey,
    );
  expect(await savedWidth()).toBe(220);
  const bounds = await handle.boundingBox();
  if (!bounds) throw new Error('missing sidebar resize bounds');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 70, bounds.y + 100);
  await expect(handle).toHaveAttribute('aria-valuenow', '290');
  await expect.poll(async () => (await page.locator('.sidebar').boundingBox())?.width).toBe(290);
  expect(await savedWidth()).toBe(220);
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '290');
  expect(await savedWidth()).toBe(290);
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  await page.reload();
  await expect(handle).toHaveAttribute('aria-valuenow', '290');
});
test('narrow window keeps editor width and usable header, with collapsible sidebar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 520, height: 700 });
  await expect(page.getByRole('button', { name: '偏好设置' })).toBeVisible();
  await page.getByRole('button', { name: '切换侧栏' }).click();
  await expect(page.locator('.sidebar')).toBeHidden();
  const editor = await page.locator('.runtime-editor-mount').boundingBox();
  expect(editor?.width).toBeGreaterThan(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(520);
  await page.getByRole('button', { name: '切换侧栏' }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
});
test('statistics exposes original counts and does not dirty a loaded document', async ({
  page,
}, testInfo) => {
  const trigger = page.getByRole('button', { name: '文档统计' });
  await expect(trigger).toContainText('5 字符');
  await expect(trigger).toContainText('1 词');
  await expect(trigger).toContainText('不足 1 分钟');
  const paragraph = page.frameLocator('.marklyra-editor-frame').locator('#write > p');
  await paragraph.click();
  await paragraph.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text: Node | null = null;
    for (let candidate = walker.nextNode(); candidate; candidate = walker.nextNode())
      if (candidate.textContent === 'Alpha') {
        text = candidate;
        break;
      }
    if (!text) throw new Error('expected Alpha text node within runtime inline wrappers');
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 5);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
  });
  await expect(trigger).toContainText('已选 1 词');
  await trigger.click();
  const panel = page.getByRole('dialog', { name: '文档统计' });
  await expect(panel).toContainText('每分钟 382 词');
  await expect(panel).toContainText('UTF-16');
  await expect(panel.locator('.statistics-explanation')).toContainText('MarkLyra');
  await expect(panel.locator('.statistics-explanation')).not.toContainText('Typora');
  await expect(panel).toContainText('当前选区：1 词 · 5 字符');
  await page.keyboard.press('Escape');
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await testInfo.attach('focus-after-statistics', {
    contentType: 'application/json',
    body: JSON.stringify({
      parent: await page.evaluate(() => ({
        active: document.activeElement?.outerHTML.slice(0, 250),
        focused: document.hasFocus(),
      })),
      frame: await paragraph.evaluate(() => ({
        active: document.activeElement?.outerHTML.slice(0, 250),
        focused: document.hasFocus(),
        selection: document.getSelection()?.toString(),
      })),
    }),
  });
  await page.keyboard.type('X');
  await expect(paragraph).toHaveText('X');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(paragraph).toHaveText('Alpha');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.document-title')).toHaveText('A.md');
  // The title was already clean before clicking Save; it is not a completion signal.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((call) => call.command === 'save_document')
            .at(-1)?.args,
      ),
    )
    .toMatchObject({ text: 'Alpha' });
});
test('paragraph command menu performs a real heading edit with undo', async ({ page }) => {
  await page.getByRole('button', { name: '格式工具', exact: true }).click();
  const frame = page.frameLocator('.marklyra-editor-frame');
  await frame.locator('#write > p').click();
  await page.getByRole('button', { name: '更多编辑命令' }).click();
  await page.getByRole('button', { name: '一级标题', exact: true }).click();
  await expect(frame.locator('#write > h1')).toHaveText('Alpha');
  await page.getByRole('button', { name: '更多编辑命令' }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(frame.locator('#write > p')).toHaveText('Alpha');
});

test('native preferences action reaches the shell with editor focus and defers during composition', async ({
  page,
}, testInfo) => {
  const paragraph = page.frameLocator('.marklyra-editor-frame').locator('#write > p');
  await paragraph.click();
  await paragraph.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
  });
  const observe = () => {
    const events: unknown[] = [];
    Reflect.set(window, '__productFocusEvents', events);
    for (const type of ['focusin', 'focusout', 'keydown'])
      document.addEventListener(
        type,
        (event) =>
          events.push({
            type,
            time: Date.now(),
            key: event instanceof KeyboardEvent ? event.key : undefined,
            target:
              event.target instanceof HTMLElement ? event.target.outerHTML.slice(0, 180) : null,
          }),
        true,
      );
  };
  await page.evaluate(observe);
  await paragraph.evaluate(observe);
  await expect(page.locator('.marklyra-editor-frame')).toBeFocused();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('preferences'));
  const panel = page.getByRole('dialog', { name: '偏好设置' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: '完成' }).click();
  await expect(panel).toBeHidden();
  await page.keyboard.type('X');
  await testInfo.attach('preferences-focus-sequence', {
    contentType: 'application/json',
    body: JSON.stringify({
      parent: await page.evaluate(() => Reflect.get(window, '__productFocusEvents')),
      frame: await paragraph.evaluate(() => Reflect.get(window, '__productFocusEvents')),
    }),
  });
  await expect(paragraph).toHaveText('AlphaX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(paragraph).toHaveText('Alpha');
  await page.getByRole('button', { name: '文档统计' }).click();
  await expect(page.getByRole('dialog', { name: '文档统计' })).toBeVisible();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('preferences'));
  await expect(panel).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  const speed = panel.getByLabel('阅读速度（词 / 分钟）');
  await speed.focus();
  // A delayed iframe focus restoration from the closed statistics dialog must
  // not steal the newly opened settings input's focus.
  await page.waitForTimeout(100);
  await expect(speed).toBeFocused();
  await speed.fill('240');
  await expect(speed).toHaveValue('240');
  await panel.getByRole('button', { name: '完成' }).click();
  await paragraph.click();
  await paragraph.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' })),
  );
  await page.waitForTimeout(60);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('preferences'));
  await expect(page.locator('.statusbar')).toContainText('请先完成输入法候选');
  await expect(panel).toBeHidden();
  await paragraph.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
  );
  await page.waitForTimeout(60);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('preferences'));
  await expect(panel).toBeVisible();
});

test('native document commands cannot edit behind preferences or statistics and Close dismisses the panel', async ({
  page,
}) => {
  const frame = page.frameLocator('.marklyra-editor-frame');
  await frame.locator('#write > p').click();
  await frame.locator('#write > p').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
  });
  await page.keyboard.type('X');
  await expect(frame.locator('#write > p')).toHaveText('AlphaX');
  for (const name of ['偏好设置', '文档统计']) {
    await page.getByRole('button', { name, exact: true }).click();
    const panel = page.getByRole('dialog', { name, exact: true });
    await expect(panel).toBeVisible();
    if (name === '偏好设置') await panel.getByLabel('阅读速度（词 / 分钟）').focus();
    await page.evaluate(() => {
      for (const action of ['undo', 'redo', 'format:strong', 'heading:1', 'new', 'save'])
        (window as TestWindow).__desktopMock.emitMenu(action);
    });
    await expect(panel).toBeVisible();
    await expect(frame.locator('#write > p')).toHaveText('AlphaX');
    await expect(frame.locator('#write strong, #write h1')).toHaveCount(0);
    await expect(page.locator('.document-title')).toHaveText('A.md •');
    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('close'));
    await expect(panel).toBeHidden();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.document-title')).toHaveText('A.md •');
  }
  const calls = await page.evaluate(() => (window as TestWindow).__desktopMock.calls);
  expect(
    calls.filter((call) =>
      ['save_document', 'close_document', 'close_editor_window'].includes(call.command),
    ),
  ).toHaveLength(0);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((call) => call.command === 'save_document')
            .at(-1)?.args.text,
      ),
    )
    .toBe('AlphaX');
});

test('source statistics dismissal restores CodeMirror input and selection without changing undo history', async ({
  page,
}) => {
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:source'));
  const frame = page.frameLocator('.marklyra-editor-frame');
  const textarea = frame.locator('#typora-source .CodeMirror textarea');
  const mirror = frame.locator('#typora-source .CodeMirror');
  await textarea.focus();
  await page.keyboard.press('Meta+a');
  const trigger = page.getByRole('button', { name: '文档统计' });
  await expect(trigger).toContainText('已选 1 词');
  await trigger.click();
  const panel = page.getByRole('dialog', { name: '文档统计' });
  await expect(panel).toContainText('当前选区：1 词 · 5 字符');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('close'));
  await expect(panel).toBeHidden();
  await expect(textarea).toBeFocused();
  await page.keyboard.type('X');
  const source = () =>
    mirror.evaluate((element) =>
      (Reflect.get(element, 'CodeMirror') as { getValue(): string }).getValue(),
    );
  await expect.poll(source).toBe('X');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect.poll(source).toBe('Alpha');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls
            .filter((call) => call.command === 'save_document')
            .at(-1)?.args.text,
      ),
    )
    .toBe('Alpha');
});

test('a rejected editor focus during preferences dismissal reports the error and releases the dialog', async ({
  page,
}) => {
  const paragraph = page.frameLocator('.marklyra-editor-frame').locator('#write > p');
  await paragraph.click();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('preferences'));
  const panel = page.getByRole('dialog', { name: '偏好设置' });
  await expect(panel).toBeVisible();
  await paragraph.evaluate(() => {
    const area = (window as unknown as { editor: { writingArea: { focus: () => unknown } } }).editor
      .writingArea;
    const original = area.focus;
    area.focus = () => {
      area.focus = original;
      throw new Error('fixture focus failure');
    };
  });
  await panel.getByRole('button', { name: '完成' }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator('.statusbar')).toContainText('恢复编辑焦点失败');
  await expect(page.locator('.statusbar')).toContainText('fixture focus failure');
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: '完成' })).toBeEnabled();
  await panel.getByRole('button', { name: '完成' }).click();
  await expect(panel).toBeHidden();
});
