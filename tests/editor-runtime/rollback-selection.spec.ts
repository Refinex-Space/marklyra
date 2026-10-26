import { expect, type Page, test } from '@playwright/test';
import {
  createImageEditor,
  type ImageTestWindow,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await setupImageHost(page);
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});
async function mode(page: Page, sourceMode: boolean) {
  if (sourceMode)
    await page.evaluate(() =>
      (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'toggleSource' }),
    );
}
async function sourceSelection(page: Page) {
  return imageFrame(page)
    .locator('#write')
    .evaluate(() => {
      const editor = Reflect.get(window, 'editor') as {
        sourceView: {
          cm: { listSelections(): unknown; getCursor(which: 'anchor' | 'head'): unknown };
        };
      };
      return {
        ranges: editor.sourceView.cm.listSelections(),
        anchor: editor.sourceView.cm.getCursor('anchor'),
        head: editor.sourceView.cm.getCursor('head'),
      };
    });
}
async function reject(page: Page, operation: 'load' | 'reload', sourceMode: boolean) {
  const error = await page.evaluate(
    async ({ operation, sourceMode }) => {
      const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
      if (!editor) throw new Error('Missing editor');
      const expectedSource = await editor.flush(),
        expectedRevision = editor.revision;
      try {
        const invalid = sourceMode ? 'Invalid \uD800 marker\n' : 'Unsupported \uE027 marker\n';
        if (operation === 'load') await editor.load(invalid);
        else await editor.reloadFromDisk(invalid, { expectedSource, expectedRevision });
        return '';
      } catch (error) {
        return String(error);
      }
    },
    { operation, sourceMode },
  );
  expect(error).toMatch(/normalization|surrogate/);
  const errors = await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors);
  expect(errors).toHaveLength(operation === 'load' ? 1 : 0);
  for (const error of errors) expect(error).toMatch(/normalization|surrogate/);
}
for (const operation of ['load', 'reload'] as const) {
  test(`failed ${operation} preserves a reversed current source selection through native delayed refresh`, async ({
    page,
  }) => {
    const source = 'First\r\nSecond\nThird';
    await createImageEditor(page, { source, context: 'doc-a' });
    await mode(page, true);
    await imageFrame(page)
      .locator('#write')
      .evaluate(() => {
        const editor = Reflect.get(window, 'editor') as {
          sourceView: {
            cm: {
              setSelection(
                anchor: { line: number; ch: number },
                head: { line: number; ch: number },
              ): void;
              focus(): void;
            };
          };
        };
        editor.sourceView.cm.setSelection({ line: 1, ch: 5 }, { line: 1, ch: 1 });
        editor.sourceView.cm.focus();
      });
    const before = await sourceSelection(page);
    await reject(page, operation, true);
    expect(await sourceSelection(page)).toEqual(before);
    // Snapshot restore schedules a 200ms refresh; verify the result outlives it.
    await page.waitForTimeout(250);
    expect(await sourceSelection(page)).toEqual(before);
    expect(await imageSource(page)).toBe(source);
  });
  for (const sourceMode of [false, true])
    test(`background ${sourceMode ? 'source' : 'WYSIWYG'} failed ${operation} does not steal host focus`, async ({
      page,
    }) => {
      const source = 'First\r\nSecond\nThird';
      await createImageEditor(page, { source, context: 'doc-a' });
      await mode(page, sourceMode);
      await page.evaluate(() => {
        const input = document.createElement('input');
        input.id = 'host-rollback-focus';
        document.body.append(input);
        input.focus();
      });
      await reject(page, operation, sourceMode);
      await expect(page.locator('#host-rollback-focus')).toBeFocused();
      await page.waitForTimeout(250);
      await expect(page.locator('#host-rollback-focus')).toBeFocused();
      expect(await imageSource(page)).toBe(source);
    });
}
