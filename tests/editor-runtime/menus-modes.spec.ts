import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';

type Host = Window & { marklyraEditor: MarkLyraEditor };
const raw = '\uFEFF# Heading\r\n\r\nAlpha **strong**\n\nTail\r\n';
async function load(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Host).marklyraEditor);
  await page.evaluate(async (source) => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.ready;
    await editor.load(source);
  }, raw);
  return page.frameLocator('.marklyra-editor-frame');
}
const menu = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as Host).marklyraEditor.menuState);
const flush = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
const execute = (
  page: import('@playwright/test').Page,
  type: 'toggleFocus' | 'toggleTypewriter' | 'toggleSource' | 'undo' | 'redo',
) => page.evaluate((type) => (window as unknown as Host).marklyraEditor.execute({ type }), type);

test('original focus/typewriter modes publish checks without changing raw, history, selection or iframe', async ({
  page,
}) => {
  const frame = await load(page),
    iframe = await page.locator('.marklyra-editor-frame').elementHandle();
  const paragraph = frame.locator('#write > p').last();
  await paragraph.click();
  const facts = () =>
    frame.locator('body').evaluate(() => {
      const editor = Reflect.get(window, 'editor'),
        selection = getSelection();
      return {
        history: JSON.stringify([editor.undo.commandStack, editor.undo.index]),
        selection: [
          selection?.anchorNode?.textContent,
          selection?.anchorOffset,
          selection?.focusNode?.textContent,
          selection?.focusOffset,
        ],
      };
    });
  const before = await facts();
  await execute(page, 'toggleFocus');
  await expect.poll(async () => (await menu(page))?.focusMode).toBe(true);
  await expect(frame.locator('body')).toHaveClass(/on-focus-mode/);
  await execute(page, 'toggleTypewriter');
  await expect.poll(async () => (await menu(page))?.typewriterMode).toBe(true);
  await expect(frame.locator('body')).toHaveClass(/marklyra-on-typewriter-mode/);
  expect(await flush(page)).toBe(raw);
  expect(await facts()).toEqual(before);
  await execute(page, 'toggleFocus');
  await execute(page, 'toggleTypewriter');
  await expect
    .poll(async () => [(await menu(page))?.focusMode, (await menu(page))?.typewriterMode])
    .toEqual([false, false]);
  expect(await flush(page)).toBe(raw);
  expect(await iframe?.evaluate((node) => node.isConnected)).toBe(true);
});

test('source history is current and Source keeps both modes while original formatting menus are disabled', async ({
  page,
}) => {
  const frame = await load(page);
  await execute(page, 'toggleFocus');
  await execute(page, 'toggleTypewriter');
  await execute(page, 'toggleSource');
  await expect.poll(async () => (await menu(page))?.sourceMode).toBe(true);
  expect(await menu(page)).toMatchObject({
    sourceMode: true,
    focusMode: true,
    typewriterMode: true,
    inlineAllowed: false,
    blockAllowed: false,
  });
  await frame.locator('body').evaluate(() => {
    const cm = Reflect.get(window, 'editor').sourceView.cm;
    cm.focus();
    cm.execCommand('goDocEnd');
  });
  await page.keyboard.type('Extra');
  expect(await flush(page)).toBe(`${raw}Extra`);
  await expect.poll(async () => (await menu(page))?.canUndo).toBe(true);
  await execute(page, 'undo');
  expect(await flush(page)).toBe(raw);
  await expect.poll(async () => (await menu(page))?.canRedo).toBe(true);
  await execute(page, 'redo');
  expect(await flush(page)).toBe(`${raw}Extra`);
  await execute(page, 'toggleSource');
  await expect.poll(async () => (await menu(page))?.sourceMode).toBe(false);
  expect(await menu(page)).toMatchObject({ focusMode: true, typewriterMode: true });
});

test('selection-only menu updates preserve source and read original block/inline styles', async ({
  page,
}) => {
  const frame = await load(page);
  await frame.locator('#write strong').click();
  await expect.poll(async () => (await menu(page))?.inlineStyles).toContain('strong');
  await frame.locator('#write h1').click();
  await expect.poll(async () => (await menu(page))?.blockStyles).toContain('header1');
  expect(await flush(page)).toBe(raw);
  await frame.locator('#write > p').last().click();
  await expect.poll(async () => (await menu(page))?.blockStyles).toContain('paragraph');
  await expect.poll(async () => (await menu(page))?.inlineStyles).not.toContain('strong');
  expect(await flush(page)).toBe(raw);
});

test('composition rejects mode commands without touching source or original mode', async ({
  page,
}) => {
  const frame = await load(page);
  await frame.locator('#write > p').last().click();
  await frame
    .locator('#write')
    .evaluate((element) =>
      element.dispatchEvent(
        new CompositionEvent('compositionstart', { bubbles: true, data: '候' }),
      ),
    );
  const message = await page.evaluate(async () => {
    try {
      await (window as unknown as Host).marklyraEditor.execute({ type: 'toggleFocus' });
      return '';
    } catch (error) {
      return String(error);
    }
  });
  expect(message).toContain('输入法');
  expect((await menu(page))?.focusMode).toBe(false);
  await frame
    .locator('#write')
    .evaluate((element) =>
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
    );
  expect(await flush(page)).toBe(raw);
});
