import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type Host = Window & { marklyraEditor: MarkLyraEditor };
const write = (page: Page) => page.frameLocator('.marklyra-editor-frame').locator('#write');
async function empty(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Host).marklyraEditor);
  await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.ready;
    await editor.load('');
  });
}
const nativeHistory = (page: Page) =>
  write(page).evaluate(() => {
    const editor = (window as unknown as Window & { editor: LegacyEditor }).editor;
    return { index: editor.undo.index, stack: JSON.stringify(editor.undo.commandStack) };
  });

test('same source with a newer edit revision refuses replacement and preserves Redo', async ({
  page,
}) => {
  await empty(page);
  const initial = await page.evaluate(() => (window as unknown as Host).marklyraEditor.revision);
  await write(page).click();
  await page.keyboard.type('Z');
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }));
  await expect(write(page)).toHaveText('');
  const history = await nativeHistory(page);
  const result = await page.evaluate(async (revision) => {
    const editor = (window as unknown as Host).marklyraEditor;
    try {
      await editor.load('Replacement', { expectedSource: '', expectedRevision: revision });
      return 'unexpected success';
    } catch (error) {
      return String(error);
    }
  }, initial);
  expect(result).toContain('切换文档期间内容已有更改');
  await expect(write(page)).toHaveText('');
  expect(await nativeHistory(page)).toEqual(history);
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'redo' }));
  await expect(write(page)).toHaveText('Z');
});

test('a matching source and revision can load an exact new raw document', async ({ page }) => {
  await empty(page);
  const raw = '\uFEFF# Next\r\n\r\nBody\n';
  expect(
    await page.evaluate(async (raw) => {
      const editor = (window as unknown as Host).marklyraEditor;
      const current = await editor.flush();
      await editor.load(raw, { expectedSource: current, expectedRevision: editor.revision });
      return await editor.flush();
    }, raw),
  ).toBe(raw);
});

test('invalid revision numbers fail before changing the document or native history', async ({
  page,
}) => {
  await empty(page);
  const history = await nativeHistory(page);
  const errors = await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    const errors: string[] = [];
    for (const revision of [
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      try {
        await editor.load('Wrong', { expectedRevision: revision });
        errors.push('unexpected success');
      } catch (error) {
        errors.push(String(error));
      }
    }
    return errors;
  });
  expect(errors).toHaveLength(5);
  expect(errors.every((error) => error.includes('文档修订号无效'))).toBe(true);
  await expect(write(page)).toHaveText('');
  expect(await nativeHistory(page)).toEqual(history);
});
