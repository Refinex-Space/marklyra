import { expect, type Page, test } from '@playwright/test';
import type { LegacyGlobals } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import { tableDocument } from '../fixtures/table-source-fixtures.js';
import {
  mountTableEditor,
  tableErrors,
  tableFrame,
  tableHistory,
  tableSource,
} from './table-editing.helpers.js';

const raw =
  '| H1 | H2 | H3 |\r\n| :--- | :---: | ---: |\n| **已有** | 普通 | `code` |\r\n| a\\|b | *斜体* | [链接](https://example.test) |';

async function menu(page: Page, axis: 'row' | 'column', selector: string) {
  const frame = tableFrame(page);
  await frame.locator(selector).hover();
  await frame
    .getByRole('button', { name: axis === 'row' ? '行操作' : '列操作', exact: true })
    .click();
  const result = frame.getByRole('menu', {
    name: axis === 'row' ? '表格行操作' : '表格列操作',
    exact: true,
  });
  await expect(result).toBeVisible();
  return result;
}
const historyIndex = (page: Page) =>
  tableFrame(page)
    .locator('#write')
    .evaluate(() => (window as unknown as LegacyGlobals).editor?.undo.index);

async function align(page: Page, label: string) {
  await tableFrame(page).getByRole('menuitem', { name: '对齐方式', exact: true }).hover();
  await tableFrame(page)
    .getByRole('menu', { name: '对齐方式', exact: true })
    .getByRole('menuitemradio', { name: label, exact: true })
    .click();
}

for (const container of ['root', 'quote', 'ordered-list'] as const) {
  test(`${container}: title row makes only its cell contents bold in one undoable Markdown operation`, async ({
    page,
  }) => {
    const source = tableDocument(raw, container);
    await mountTableEditor(page, source);
    const before = await historyIndex(page);
    await (await menu(page, 'row', '#write tbody tr:first-child td:first-child'))
      .getByRole('menuitem', { name: '设为标题行', exact: true })
      .click();
    const expected = tableDocument(
      raw.replace('| **已有** | 普通 | `code` |', '| **已有** | **普通** | **`code`** |'),
      container,
    );
    await expect.poll(() => tableSource(page)).toBe(expected);
    expect(await historyIndex(page)).toBe((before ?? 0) + 1);
    await expect(tableFrame(page).locator('#write tbody tr:first-child strong')).toHaveCount(3);
    await tableHistory(page, 'undo');
    expect(await tableSource(page)).toBe(source);
    await tableHistory(page, 'redo');
    expect(await tableSource(page)).toBe(expected);
    const repeated = await menu(page, 'row', '#write tbody tr:first-child td:first-child');
    await expect(
      repeated.getByRole('menuitem', { name: '设为标题行', exact: true }),
    ).toBeDisabled();
    expect(await tableSource(page)).toBe(expected);
    expect(await tableErrors(page)).toEqual([]);
  });
  test(`${container}: title column preserves escaped pipes, other cells and the structural header`, async ({
    page,
  }) => {
    const source = tableDocument(raw, container);
    await mountTableEditor(page, source);
    await (await menu(page, 'column', '#write tbody tr:last-child td:first-child'))
      .getByRole('menuitem', { name: '设为标题列', exact: true })
      .click();
    const expected = tableDocument(
      raw.replace('| H1 |', '| **H1** |').replace('| a\\|b |', '| **a\\|b** |'),
      container,
    );
    await expect.poll(() => tableSource(page)).toBe(expected);
    await expect(tableFrame(page).locator('#write thead tr')).toHaveCount(1);
    await expect(tableFrame(page).locator('#write tbody tr')).toHaveCount(2);
    await tableHistory(page, 'undo');
    expect(await tableSource(page)).toBe(source);
    await tableHistory(page, 'redo');
    expect(await tableSource(page)).toBe(expected);
    expect(await tableErrors(page)).toEqual([]);
  });
}

test('title formatting retains inline meaning, skips blank cells and does not toggle existing bold off', async ({
  page,
}, info) => {
  const source =
    '| A | B | C | D |\n| --- | --- | --- | --- |\n| **bold** and plain | __already__ | *emphasis* |  |\n';
  await mountTableEditor(page, source);
  await (await menu(page, 'row', '#write tbody td:first-child'))
    .getByRole('menuitem', { name: '设为标题行', exact: true })
    .click();
  const expected = source.replace(
    '| **bold** and plain | __already__ | *emphasis* |  |',
    '| **bold and plain** | __already__ | __*emphasis*__ |  |',
  );
  await expect.poll(() => tableSource(page)).toBe(expected);
  await expect(tableFrame(page).locator('#write tbody td').nth(3)).toHaveText('');
  await tableHistory(page, 'undo');
  expect(await tableSource(page)).toBe(source);
  await tableHistory(page, 'redo');
  await menu(page, 'column', '#write tbody td:nth-child(2)');
  await tableFrame(page).getByRole('menuitem', { name: '对齐方式', exact: true }).hover();
  const submenu = tableFrame(page).getByRole('menu', { name: '对齐方式', exact: true });
  await expect(submenu).toBeVisible();
  const first = await tableFrame(page).locator('.ml-table-menu').first().boundingBox();
  const second = await submenu.boundingBox();
  if (!first || !second) throw Error('Missing menu preview bounds');
  const x = Math.max(0, Math.min(first.x, second.x) - 10);
  const y = Math.max(0, Math.min(first.y, second.y) - 10);
  await page.screenshot({
    path: info.outputPath('unified-column-menu.png'),
    clip: {
      x,
      y,
      width: Math.max(first.x + first.width, second.x + second.width) + 10 - x,
      height: Math.max(first.y + first.height, second.y + second.height) + 10 - y,
    },
  });
  expect(await tableErrors(page)).toEqual([]);
});

test('a failed native formatting render restores the complete table without adding history', async ({
  page,
}) => {
  const source = tableDocument(raw, 'quote');
  await mountTableEditor(page, source);
  const index = await historyIndex(page);
  const actions = await menu(page, 'row', '#write tbody tr:first-child td:first-child');
  await tableFrame(page)
    .locator('#write [mdtype="table"][cid]')
    .evaluate(() => {
      const original = document.createElement;
      const setter = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')?.set;
      if (!setter) throw Error('Missing native HTML parser');
      Reflect.set(document, 'createElement', (name: string, options?: ElementCreationOptions) => {
        const element = original.call(document, name, options);
        if (name === 'template') {
          document.createElement = original;
          Object.defineProperty(element, 'innerHTML', {
            set: () => setter.call(element, '<div>invalid table render</div>'),
          });
        }
        return element;
      });
    });
  await actions.getByRole('menuitem', { name: '设为标题行', exact: true }).click();
  await expect.poll(() => tableSource(page)).toBe(source);
  expect(await historyIndex(page)).toBe(index);
  expect(await tableErrors(page)).toEqual([expect.stringContaining('表格格式渲染未通过校验')]);
  await (await menu(page, 'row', '#write tbody tr:first-child td:first-child'))
    .getByRole('menuitem', { name: '设为标题行', exact: true })
    .click();
  expect(await tableSource(page)).not.toBe(source);
  await tableHistory(page, 'undo');
  expect(await tableSource(page)).toBe(source);
});

test('heading formatting preserves code pipes and link destinations while normalizing mixed bold markers', async ({
  page,
}) => {
  const source =
    '| A | B | C |\n| --- | --- | --- |\n| **one** and __two__ | [link](https://example.test/a_b?q=**x**) | `a\\|b` |\n';
  await mountTableEditor(page, source);
  await (await menu(page, 'row', '#write tbody td:first-child'))
    .getByRole('menuitem', { name: '设为标题行', exact: true })
    .click();
  const expected = source.replace(
    '| **one** and __two__ | [link](https://example.test/a_b?q=**x**) | `a\\|b` |',
    '| **one and two** | __[link](https://example.test/a_b?q=**x**)__ | **`a\\|b`** |',
  );
  await expect.poll(() => tableSource(page)).toBe(expected);
  await expect(tableFrame(page).locator('#write tbody strong a')).toHaveAttribute(
    'href',
    'https://example.test/a_b?q=**x**',
  );
  await expect(tableFrame(page).locator('#write tbody strong code')).toBeVisible();
  await tableHistory(page, 'undo');
  expect(await tableSource(page)).toBe(source);
  expect(await tableErrors(page)).toEqual([]);
});

for (const [label, delimiter, alignment] of [
  ['左对齐', /^:-+$/, 'left'],
  ['居中对齐', /^:-+:$/, 'center'],
  ['右对齐', /^-+:$/, 'right'],
] as const) {
  test(`${label}: menu alignment updates only the Markdown column declaration and supports undo`, async ({
    page,
  }) => {
    const source = '| First | Second |\r\n| ---- | :----: |\n| A | B |\r\n';
    await mountTableEditor(page, source);
    const frame = tableFrame(page);
    await frame.locator('#write tbody td').first().click();
    await expect(frame.locator('.ty-table-edit')).toBeHidden();
    await menu(page, 'column', '#write tbody td:first-child');
    await align(page, label);
    const actual = await tableSource(page);
    expect(actual.split(/\r?\n/)[1]?.split('|')[1]?.trim()).toMatch(delimiter);
    await expect(frame.locator('#write tbody td').first()).toHaveCSS('text-align', alignment);
    expect(actual).toContain('| A | B |\r\n');
    expect(actual).toContain('| First | Second |\r\n');
    await tableHistory(page, 'undo');
    expect(await tableSource(page)).toBe(source);
    await menu(page, 'column', '#write tbody td:first-child');
    await align(page, label);
    const index = await historyIndex(page);
    await menu(page, 'column', '#write tbody td:first-child');
    await align(page, label);
    expect(await historyIndex(page)).toBe(index);
    expect(await tableErrors(page)).toEqual([]);
  });
}

test('delete table is available in either axis menu and restores the whole table on undo', async ({
  page,
}) => {
  const source = tableDocument(raw, 'root');
  await mountTableEditor(page, source);
  await (await menu(page, 'row', '#write tbody tr:first-child td:first-child'))
    .getByRole('menuitem', { name: '删除表格', exact: true })
    .click();
  await expect(tableFrame(page).locator('#write table')).toHaveCount(0);
  expect(await tableSource(page)).toContain('Preface');
  expect(await tableSource(page)).toContain('keep CODE');
  await tableHistory(page, 'undo');
  expect(await tableSource(page)).toBe(source);
  await (await menu(page, 'column', '#write tbody tr:first-child td:first-child'))
    .getByRole('menuitem', { name: '删除表格', exact: true })
    .click();
  await expect(tableFrame(page).locator('#write table')).toHaveCount(0);
  await tableHistory(page, 'undo');
  expect(await tableSource(page)).toBe(source);
});

test('heading, column movement and alignment share an ordered undo/redo history', async ({
  page,
}) => {
  const source = tableDocument(raw, 'ordered-list');
  await mountTableEditor(page, source);
  const states = [source];
  await (await menu(page, 'row', '#write tbody tr:first-child td:first-child'))
    .getByRole('menuitem', { name: '设为标题行', exact: true })
    .click();
  states.push(await tableSource(page));
  await (await menu(page, 'column', '#write tbody tr:first-child td:first-child'))
    .getByRole('menuitem', { name: '右移列', exact: true })
    .click();
  states.push(await tableSource(page));
  await menu(page, 'column', '#write tbody tr:first-child td:first-child');
  await align(page, '右对齐');
  states.push(await tableSource(page));
  for (const expected of states.slice(0, -1).reverse()) {
    await tableHistory(page, 'undo');
    expect(await tableSource(page)).toBe(expected);
  }
  for (const expected of states.slice(1)) {
    await tableHistory(page, 'redo');
    expect(await tableSource(page)).toBe(expected);
  }
  expect(await tableErrors(page)).toEqual([]);
});

for (const width of [480, 1280]) {
  test(`${width}px: alignment submenu opens to the available side and supports keyboard back navigation`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 650 });
    const source = '| A | B | C |\n| --- | --- | ---: |\n| a | b | c |\n';
    await mountTableEditor(page, source);
    const frame = tableFrame(page);
    const parent = await menu(page, 'column', '#write tbody tr:first-child td:last-child');
    const trigger = parent.getByRole('menuitem', { name: '对齐方式', exact: true });
    await trigger.focus();
    await page.keyboard.press('ArrowRight');
    const submenu = frame.getByRole('menu', { name: '对齐方式', exact: true });
    await expect(submenu).toBeVisible();
    await expect(submenu.getByRole('menuitemradio', { name: '右对齐', exact: true })).toBeFocused();
    const rect = await submenu.boundingBox();
    if (!rect) throw Error('Missing submenu geometry');
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    await expect(submenu).toHaveAttribute('data-side', width === 480 ? 'left' : 'right');
    await page.screenshot({ path: info.outputPath(`alignment-${width}.png`) });
    await page.keyboard.press('ArrowLeft');
    await expect(submenu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(parent).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(frame.getByRole('menu')).toHaveCount(0);
    expect(await tableSource(page)).toBe(source);
  });
}

test('closing only the alignment submenu retires its callbacks while keeping the parent usable', async ({
  page,
}) => {
  await mountTableEditor(page, raw);
  const frame = tableFrame(page);
  const parent = await menu(page, 'column', '#write tbody tr:first-child td:first-child');
  const trigger = parent.getByRole('menuitem', { name: '对齐方式', exact: true });
  await trigger.hover();
  const submenu = frame.getByRole('menu', { name: '对齐方式', exact: true });
  const retired = await submenu
    .getByRole('menuitemradio', { name: '居中对齐', exact: true })
    .elementHandle();
  await page.keyboard.press('Escape');
  await expect(submenu).toHaveCount(0);
  await expect(parent).toBeVisible();
  await retired?.evaluate((element) => (element as HTMLElement).click());
  expect(await tableSource(page)).toBe(raw);
  await trigger.click();
  await submenu.getByRole('menuitemradio', { name: '居中对齐', exact: true }).click();
  expect(await tableSource(page)).not.toBe(raw);
  await tableHistory(page, 'undo');
  expect(await tableSource(page)).toBe(raw);
  expect(await tableErrors(page)).toEqual([]);
});
