import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import type { LegacyGlobals } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import { tableDocument } from '../fixtures/table-source-fixtures.js';
import {
  mountTableEditor,
  tableErrors,
  tableFrame,
  tableHistory,
  tableMenu,
  tableModel,
  tableSource,
} from './table-editing.helpers.js';

const raw = '| H1 | H2 |\r\n| :--- | ---: |\n| A1 | A2 |\r\n| B1 | B2 |';
const handle = (page: Page, axis: 'row' | 'column') =>
  tableFrame(page).getByRole('button', { name: axis === 'row' ? '行操作' : '列操作', exact: true });
async function menu(page: Page, selector: string, axis: 'row' | 'column') {
  await tableFrame(page).locator(selector).first().hover();
  await handle(page, axis).click();
  const menu = tableFrame(page).getByRole('menu', {
    name: axis === 'row' ? '表格行操作' : '表格列操作',
    exact: true,
  });
  await expect(menu).toBeVisible();
  return menu;
}

for (const container of ['root', 'quote', 'ordered-list'] as const) {
  test(`${container}: hover row actions target the hovered row and preserve raw source through undo/redo`, async ({
    page,
  }, info) => {
    const source = tableDocument(raw, container);
    await mountTableEditor(page, source);
    const frame = tableFrame(page);
    await frame.locator('#write th').first().click();
    const before = await tableModel(page);
    const actions = await menu(page, '#write tbody tr:last-child td:first-child', 'row');
    expect(await tableSource(page)).toBe(source);
    await actions.getByRole('menuitem', { name: '上移行', exact: true }).click();
    const expected = tableDocument(
      raw.replace('| A1 | A2 |\r\n| B1 | B2 |', '| B1 | B2 |\r\n| A1 | A2 |'),
      container,
    );
    await expect.poll(() => tableSource(page)).toBe(expected);
    expect((await tableModel(page)).rows.map((row) => row.id)).toEqual([
      before.rows[0]?.id,
      before.rows[2]?.id,
      before.rows[1]?.id,
    ]);
    await tableHistory(page, 'undo');
    expect(await tableSource(page)).toBe(source);
    await tableHistory(page, 'redo');
    expect(await tableSource(page)).toBe(expected);
    expect(await tableErrors(page)).toEqual([]);
    await frame.locator('#write tbody tr:first-child td:first-child').hover();
    await handle(page, 'row').click();
    await page.screenshot({ path: info.outputPath(`${container}-row-menu.png`) });
  });

  test(`${container}: column handles move the complete column with its Markdown alignment`, async ({
    page,
  }) => {
    const source = tableDocument(raw, container);
    await mountTableEditor(page, source);
    const actions = await menu(page, '#write tbody tr:first-child td:first-child', 'column');
    await expect(actions.getByRole('menuitem', { name: '左移列', exact: true })).toBeDisabled();
    await actions.getByRole('menuitem', { name: '右移列', exact: true }).click();
    const expected = tableDocument(
      '| H2 | H1 |\r\n| ---: | :--- |\n| A2 | A1 |\r\n| B2 | B1 |',
      container,
    );
    await expect.poll(() => tableSource(page)).toBe(expected);
    await tableHistory(page, 'undo');
    expect(await tableSource(page)).toBe(source);
    await tableHistory(page, 'redo');
    expect(await tableSource(page)).toBe(expected);
    expect(await tableErrors(page)).toEqual([]);
  });
}

test('edge buttons append a row or column as one undoable Markdown operation', async ({ page }) => {
  const source = tableDocument(raw, 'root');
  await mountTableEditor(page, source);
  const frame = tableFrame(page);
  await frame.locator('#write tbody tr:last-child td:last-child').hover();
  await frame.getByRole('button', { name: '在表格末尾添加行', exact: true }).click();
  await expect(frame.locator('#write tbody tr')).toHaveCount(3);
  expect(await tableSource(page)).not.toContain('<table');
  await tableHistory(page, 'undo');
  expect(await tableSource(page)).toBe(source);
  await frame.locator('#write tbody tr:last-child td:last-child').hover();
  await frame.getByRole('button', { name: '在表格右侧添加列', exact: true }).click();
  await expect(frame.locator('#write thead th')).toHaveCount(3);
  expect(await tableSource(page)).not.toContain('<table');
  await tableHistory(page, 'undo');
  expect(await tableSource(page)).toBe(source);
});

test('thin full-length handles survive a slow gap crossing and mouse menus do not preselect a command', async ({
  page,
}, info) => {
  await mountTableEditor(page, raw);
  const frame = tableFrame(page);
  const cell = frame.locator('#write tbody tr:last-child td:last-child');
  await cell.hover();
  const cellBox = await cell.boundingBox(),
    rowBox = await handle(page, 'row').boundingBox(),
    columnBox = await handle(page, 'column').boundingBox();
  if (!cellBox || !rowBox || !columnBox) throw Error('Missing handle geometry');
  expect(rowBox.width).toBeLessThanOrEqual(8);
  expect(rowBox.height).toBeCloseTo(cellBox.height);
  expect(columnBox.height).toBe(8);
  expect(columnBox.width).toBeCloseTo(cellBox.width);
  await page.mouse.move(rowBox.x + rowBox.width + 2, rowBox.y + rowBox.height / 2, { steps: 12 });
  // Deliberately pause in the approach corridor longer than a normal hide delay.
  await page.waitForTimeout(700);
  await expect(handle(page, 'row')).toBeVisible();
  await handle(page, 'row').click();
  const panel = frame.locator('.ml-table-menu');
  await expect(panel).toBeVisible();
  const panelBox = await panel.boundingBox();
  expect(panelBox?.width).toBeLessThanOrEqual(164);
  expect(panelBox?.height).toBeLessThanOrEqual(248);
  await expect(panel.getByRole('menuitem').first()).not.toBeFocused();
  await expect(panel.getByRole('menuitem').first()).toHaveCSS('outline-style', 'none');
  const tableBox = await frame.locator('#write table').boundingBox();
  if (!panelBox || !tableBox) throw Error('Missing preview bounds');
  const x = Math.max(0, Math.min(rowBox.x, panelBox.x) - 12);
  const y = Math.max(0, tableBox.y - 16);
  await page.screenshot({
    path: info.outputPath('compact-mouse-menu.png'),
    clip: {
      x,
      y,
      width: tableBox.x + tableBox.width + 12 - x,
      height: panelBox.y + panelBox.height + 12 - y,
    },
  });
  await page.keyboard.press('ArrowDown');
  await expect(panel.getByRole('menuitem', { name: '上移行', exact: true })).toBeFocused();
  await expect(panel.getByRole('menuitem', { name: '上移行', exact: true })).toHaveCSS(
    'outline-width',
    '1px',
  );
  expect(await tableSource(page)).toBe(raw);
});

test('the unified menu replaces the old toolbar and preserves column alignment editing', async ({
  page,
}) => {
  const source =
    '| A | B | C | D | E | F |\n| --- | --- | --- | --- | --- | --- |\n| 1 | 2 | 3 | 4 | 5 | 6 |\n';
  await mountTableEditor(page, source);
  const frame = tableFrame(page);
  await frame.locator('#write tbody td').first().click();
  await frame.locator('#write tbody td').first().hover();
  await expect(frame.locator('.marklyra-table-edit')).toBeHidden();
  const actions = await menu(page, '#write tbody td:first-child', 'column');
  await actions.getByRole('menuitem', { name: '对齐方式', exact: true }).hover();
  await frame
    .getByRole('menu', { name: '对齐方式', exact: true })
    .getByRole('menuitemradio', { name: '居中对齐', exact: true })
    .click();
  await expect
    .poll(async () => {
      const alignment = (await tableModel(page)).align;
      return Array.isArray(alignment) ? alignment[0] : undefined;
    })
    .toBe('center');
  await tableHistory(page, 'undo');
  expect(await tableSource(page)).toBe(source);
});

test('keyboard menus preserve the caret on Escape and protect the header and last column', async ({
  page,
}) => {
  const source = '| Header |\n| --- |\n| Body |\n';
  await mountTableEditor(page, source);
  const frame = tableFrame(page);
  await frame.locator('#write th').click();
  const caret = () =>
    frame.locator('#write').evaluate(() => {
      const selection = document.getSelection();
      return { text: selection?.anchorNode?.textContent, offset: selection?.anchorOffset };
    });
  const before = await caret();
  await page.keyboard.press('Alt+Shift+T');
  const actions = frame.getByRole('menu', { name: '表格行操作', exact: true });
  await expect(actions).toBeVisible();
  await expect(actions.getByRole('menuitem', { name: '删除行', exact: true })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(frame.getByRole('menuitem', { name: '删除列', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(frame.getByRole('menu')).toHaveCount(0);
  expect(await caret()).toEqual(before);
  expect(await tableSource(page)).toBe(source);
});

test('a dismissed menu cannot execute a delayed callback against an unchanged document', async ({
  page,
}) => {
  await mountTableEditor(page, raw);
  const actions = await menu(page, '#write tbody tr:first-child td:first-child', 'row');
  const retired = await actions
    .getByRole('menuitem', { name: '删除行', exact: true })
    .elementHandle();
  await page.keyboard.press('Escape');
  await expect(tableFrame(page).getByRole('menu')).toHaveCount(0);
  await retired?.evaluate((element) => (element as HTMLElement).click());
  expect(await tableSource(page)).toBe(raw);
  expect(await tableErrors(page)).toEqual([]);
});

test('read-only, IME and document changes cannot retain an actionable handle', async ({ page }) => {
  await mountTableEditor(page, raw);
  const frame = tableFrame(page);
  await menu(page, '#write tbody td:first-child', 'row');
  await frame.locator('#write').evaluate((area) => {
    area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '中' }));
  });
  await expect(frame.locator('.ml-table-controls')).toBeHidden();
  await frame.locator('#write').evaluate((area) => {
    area.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    const runtime = window as unknown as LegacyGlobals;
    if (runtime.File) runtime.File.isLocked = true;
  });
  await frame.locator('#write tbody td').first().hover();
  await expect(frame.locator('.ml-table-controls')).toBeHidden();
  await frame.locator('#write').evaluate(() => {
    const runtime = window as unknown as LegacyGlobals;
    if (runtime.File) runtime.File.isLocked = false;
  });
  await menu(page, '#write tbody td:first-child', 'row');
  await page.evaluate(async () => {
    const editor = Reflect.get(window, 'marklyraEditor') as MarkLyraEditor;
    await editor.load('Replacement\n');
  });
  await expect(frame.locator('.ml-table-controls')).toBeHidden();
  expect(await tableSource(page)).toBe('Replacement\n');
});

for (const [axis, labels] of [
  ['row', ['上移行', '下移行', '在上方插入行', '在下方插入行', '删除行']],
  ['column', ['左移列', '右移列', '在左侧插入列', '在右侧插入列', '删除列']],
] as const) {
  for (const label of labels) {
    test(`${axis} ${label}: handle and existing context-menu command produce identical Markdown`, async ({
      page,
    }) => {
      const source = tableDocument(
        '| **标题** | H2 | H3 |\r\n| :--- | :---: | ---: |\n| a\\|b | `代码` | 中文 |\r\n| 😀 | ~~完成~~ | end |',
        'quote',
      );
      const selector = '#write tbody tr:first-child td:nth-child(2)';
      await mountTableEditor(page, source);
      await (await tableMenu(page, selector, label)).click();
      const expected = await tableSource(page);
      await mountTableEditor(page, source);
      const actions = await menu(page, selector, axis);
      await actions.getByRole('menuitem', { name: label, exact: true }).click();
      await expect.poll(() => tableSource(page)).toBe(expected);
      expect(expected).not.toMatch(/<table|rowspan|colspan/);
      await tableHistory(page, 'undo');
      expect(await tableSource(page)).toBe(source);
      expect(await tableErrors(page)).toEqual([]);
    });
  }
}

test('raw HTML tables do not acquire Markdown handles and source mode retires a menu', async ({
  page,
}) => {
  await mountTableEditor(page, '<table><tr><td>HTML only</td></tr></table>\n');
  const frame = tableFrame(page);
  const html = frame.locator('#write [mdtype="html_block"]');
  await expect(html).toBeVisible();
  await html.hover();
  await expect(frame.locator('.ml-table-controls')).toBeHidden();
  await page.evaluate(async (raw) => {
    const editor = Reflect.get(window, 'marklyraEditor') as MarkLyraEditor;
    await editor.load(raw);
  }, raw);
  await menu(page, '#write tbody tr:first-child td:first-child', 'row');
  await page.evaluate(async () => {
    const editor = Reflect.get(window, 'marklyraEditor') as MarkLyraEditor;
    await editor.execute({ type: 'toggleSource' });
  });
  await expect(frame.locator('.ml-table-controls')).toBeHidden();
  expect(await tableSource(page)).toBe(raw);
});

for (const theme of ['marklyra-light', 'marklyra-dark'] as const) {
  test(`${theme}: menu stays inside a narrow viewport and neither hover nor export contains UI`, async ({
    page,
  }, info) => {
    const source = tableDocument(raw, 'root');
    await page.setViewportSize({ width: 480, height: 440 });
    await mountTableEditor(page, source);
    await page.evaluate(async (theme) => {
      const editor = Reflect.get(window, 'marklyraEditor') as MarkLyraEditor;
      await editor.execute({ type: 'setTheme', theme });
    }, theme);
    await menu(page, '#write tbody tr:last-child td:last-child', 'row');
    const rect = await tableFrame(page).locator('.ml-table-menu').boundingBox();
    expect(rect).not.toBeNull();
    expect(rect?.x).toBeGreaterThanOrEqual(0);
    expect((rect?.x ?? 0) + (rect?.width ?? 0)).toBeLessThanOrEqual(480);
    expect((rect?.y ?? 0) + (rect?.height ?? 0)).toBeLessThanOrEqual(440);
    expect(await tableSource(page)).toBe(source);
    await expect(tableFrame(page).locator('#write .ml-table-controls')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`${theme}-narrow.png`) });
    const html = await page.evaluate(async () => {
      const editor = Reflect.get(window, 'marklyraEditor') as MarkLyraEditor;
      return editor.exportHTML();
    });
    expect(html).not.toContain('data-table-handle');
    expect(html).not.toContain('class="ml-table-controls"');
  });
}
