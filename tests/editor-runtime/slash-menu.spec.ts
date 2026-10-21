import { expect, type Page, test } from '@playwright/test';
import {
  tableErrors as errors,
  tableFrame as frame,
  tableHistory as history,
  mountTableEditor as mount,
  tableSource as source,
} from './table-editing.helpers.js';

type SourceToggle = { marklyraEditor: { execute(value: { type: 'toggleSource' }): Promise<void> } };
const menu = (page: Page) => frame(page).locator('#ml-slash-menu');
const option = (page: Page, command: string) =>
  menu(page).locator(`[role="option"][data-command="${command}"]`);
async function emptyParagraph(page: Page, text = 'Alpha') {
  await mount(page, text);
  await frame(page).locator('#write p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
}

test('typing / in an empty paragraph offers grouped blocks and Enter applies the filtered one', async ({
  page,
}, info) => {
  await emptyParagraph(page);
  await page.keyboard.type('/');
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).locator('.ml-slash-group')).toHaveText(['基础', '列表', '插入']);
  await expect(option(page, 'paragraph')).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: info.outputPath('slash-default.png') });
  await page.keyboard.type('ejbt');
  await expect(menu(page).locator('[role="option"]').first()).toHaveAttribute(
    'data-command',
    'heading2',
  );
  await expect(menu(page).locator('.ml-slash-group')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(menu(page)).toBeHidden();
  await expect.poll(() => source(page)).toBe('Alpha\n\n## ');
  // Two ordinary history steps: the block change, then the removed command text.
  await history(page, 'undo');
  await expect.poll(() => source(page)).toBe('Alpha\n\n');
  await history(page, 'undo');
  await expect.poll(() => source(page)).toBe('Alpha\n\n/ejbt');
  await history(page, 'redo');
  await history(page, 'redo');
  await expect.poll(() => source(page)).toBe('Alpha\n\n## ');
  await page.keyboard.type('Title');
  await expect.poll(() => source(page)).toBe('Alpha\n\n## Title');
  expect(await errors(page)).toEqual([]);
});

test('arrow keys move the choice while Escape keeps the typed text and does not reopen', async ({
  page,
}) => {
  await emptyParagraph(page);
  await page.keyboard.type('/');
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(option(page, 'heading1')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(option(page, 'image')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  // Arrows move the caret in every engine; on macOS WebKit the plain End key scrolls
  // instead of moving the caret, so it cannot position the type-back point here.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(50);
  await expect(menu(page)).toBeHidden();
  await page.keyboard.type('x');
  await expect(menu(page)).toBeHidden();
  await expect.poll(() => source(page)).toBe('Alpha\n\n/x');
  expect(await errors(page)).toEqual([]);
});

test('a slash inside prose never opens the menu and an unmatched query gives Enter back', async ({
  page,
}) => {
  await emptyParagraph(page);
  await page.keyboard.type('a/b');
  await page.waitForTimeout(50);
  await expect(menu(page)).toBeHidden();
  await page.keyboard.press('Enter');
  await page.keyboard.type('/zzz');
  await expect(menu(page).locator('.ml-slash-empty')).toHaveText('无匹配项');
  await page.keyboard.press('Enter');
  await expect(menu(page)).toBeHidden();
  await expect.poll(() => source(page)).toBe('Alpha\n\na/b\n\n/zzz\n\n');
  expect(await errors(page)).toEqual([]);
});

test('the Chinese 、 trigger and a pinyin query choose by pointer without moving the caret', async ({
  page,
}) => {
  await emptyParagraph(page);
  await page.keyboard.insertText('、');
  await expect(menu(page)).toBeVisible();
  await page.keyboard.type('daima');
  await expect(menu(page).locator('[role="option"]').first()).toHaveAttribute(
    'data-command',
    'codeBlock',
  );
  await option(page, 'codeBlock').click();
  await expect(menu(page)).toBeHidden();
  // Byte-for-byte what the application menu's code block command writes.
  await expect.poll(() => source(page)).toBe('Alpha\n\n```\n\n```\n\n');
  expect(await errors(page)).toEqual([]);
});

test('Enter right after a fast query runs the command for the complete query', async ({ page }) => {
  await emptyParagraph(page);
  await page.keyboard.insertText('、');
  await expect(menu(page)).toBeVisible();
  await page.keyboard.type('daima');
  await page.keyboard.press('Enter');
  await expect.poll(() => source(page)).toBe('Alpha\n\n```\n\n```\n\n');
  expect(await errors(page)).toEqual([]);
});

test('the menu stays out of headings and source mode', async ({ page }) => {
  await emptyParagraph(page);
  await page.keyboard.type('# /');
  await page.waitForTimeout(50);
  await expect(menu(page)).toBeHidden();
  await page.keyboard.press('Enter');
  await page.evaluate(() =>
    (window as unknown as SourceToggle).marklyraEditor.execute({ type: 'toggleSource' }),
  );
  await page.keyboard.type('/');
  await page.waitForTimeout(50);
  await expect(menu(page)).toBeHidden();
  expect(await errors(page)).toEqual([]);
});

test('right-click offers format, paragraph and insert groups with current state checked', async ({
  page,
}, info) => {
  await mount(page, 'Alpha Bravo');
  await frame(page).locator('#write p').first().click({ button: 'right' });
  const paragraph = page.getByRole('menuitem', { name: /^段落\s+›$/u });
  await expect(page.getByRole('menuitem', { name: /^格式\s+›$/u })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^插入\s+›$/u })).toBeVisible();
  await paragraph.hover();
  await expect(page.getByRole('menuitemcheckbox', { name: '✓ 正文' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.screenshot({ path: info.outputPath('context-paragraph.png') });
  await page.getByRole('menuitemcheckbox', { name: '二级标题', exact: true }).click();
  await expect.poll(() => source(page)).toBe('## Alpha Bravo');
  expect(await errors(page)).toEqual([]);
});
