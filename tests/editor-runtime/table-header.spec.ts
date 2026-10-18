import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  mountTableEditor,
  tableErrors,
  tableHistory,
  tableMeaning,
  tableMenu,
  tableModel,
  tableSource,
} from './table-editing.helpers.js';

test.beforeEach(async ({ page }) => {
  const baseline = process.env.TABLE_HEADER_BASELINE_FRAME;
  if (baseline)
    await page.route('http://127.0.0.1:4174/frame-host.js', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: await readFile(baseline),
      }),
    );
});

for (const headerOnly of [false, true])
  test(`header-before preserves delimiter and old linked row/cell identities, header-only=${headerOnly}`, async ({
    page,
  }) => {
    const table = headerOnly
      ? '| H1 | H2 |\r\n| :--- | ---: |'
      : '| H1 | H2 |\r\n| :--- | ---: |\n| R1A | R1B |\r\n| R2A | R2B |';
    const source = '\ufeffPreface\r\n\r\n' + table + '\r\n\r\nTail  \r\n';
    const expected =
      '\ufeffPreface\r\n\r\n|      |      |\r\n| :--- | ---: |' +
      (headerOnly ? '\r\n| H1 | H2 |' : '\n| H1 | H2 |\r\n| R1A | R1B |\r\n| R2A | R2B |') +
      '\r\n\r\nTail  \r\n';
    await mountTableEditor(page, source);
    const before = await tableModel(page);
    const action = await tableMenu(page, '#write thead th:first-child', '在上方插入行');
    await expect(action).toBeEnabled();
    await action.click();
    expect(await tableSource(page)).toBe(expected);
    const after = await tableModel(page);
    expect(after.id).toBe(before.id);
    expect(after.rows.slice(1)).toEqual(before.rows);
    expect(after.rows[0]?.cells.map((c) => c.text)).toEqual(['', '']);
    expect(after.domRows[0]?.map((c) => c.tag)).toEqual(['TH', 'TH']);
    expect(after.domRows.map((row) => row.map((cell) => cell.id))).toEqual(
      after.rows.map((row) => row.cells.map((cell) => cell.id)),
    );
    expect(after.domRows.slice(1).every((row) => row.every((c) => c.tag === 'TD'))).toBe(true);
    await tableHistory(page, 'undo');
    expect(await tableSource(page)).toBe(source);
    expect((await tableModel(page)).rows).toEqual(before.rows);
    await tableHistory(page, 'redo');
    expect(await tableSource(page)).toBe(expected);
    expect((await tableModel(page)).rows).toEqual(after.rows);
    expect(await tableErrors(page)).toEqual([]);
    const meaning = await tableMeaning(page);
    await mountTableEditor(page, expected);
    expect(await tableMeaning(page)).toEqual(meaning);
    expect(await tableSource(page)).toBe(expected);
    expect(await tableErrors(page)).toEqual([]);
  });

test('a stale unselected cell DOM identity disables all source-row actions without a write', async ({
  page,
}) => {
  const source = '\ufeff| H1 | H2 |\r\n| --- | --- |\n| R1A | R1B |\r\n| R2A | R2B |';
  await mountTableEditor(page, source);
  const cell = page
    .frameLocator('.marklyra-editor-frame')
    .locator('#write tbody tr:last-child [mdtype="table_cell"][cid]')
    .last();
  const cid = await cell.getAttribute('cid');
  if (!cid) throw Error('Missing authored cell identity');
  await cell.evaluate((element) => element.setAttribute('cid', 'foreign-unselected-cell'));
  const action = await tableMenu(
    page,
    '#write tbody tr:first-child td:first-child',
    '在上方插入行',
  );
  await expect(action).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await cell.evaluate((element, cid) => element.setAttribute('cid', cid), cid);
  expect(await tableSource(page)).toBe(source);
  expect(await tableErrors(page)).toEqual([]);
});

for (const container of ['quote', 'list', 'quote-list'] as const)
  test(`header-before remains in its ${container} source container with exact raw neighbors`, async ({
    page,
  }) => {
    const prefix = container === 'quote' ? '> ' : container === 'list' ? '   ' : '>    ';
    const lead =
      container === 'quote'
        ? ''
        : container === 'list'
          ? '- Parent\r\n\r\n'
          : '> - Parent\r\n>\r\n';
    const table = '| H1 | H2 |\r\n| :--- | ---: |\n| R1A | R1B |\r\n| R2A | R2B |';
    const mapped = (text: string) =>
      text
        .split(/(?<=\n)/u)
        .map((line) => prefix + line)
        .join('');
    const source = '\ufeffPreface\r\n\r\n' + lead + mapped(table) + '\r\n\r\nTail  \r\n';
    const expected =
      '\ufeffPreface\r\n\r\n' +
      lead +
      mapped('|      |      |\r\n| :--- | ---: |\n| H1 | H2 |\r\n| R1A | R1B |\r\n| R2A | R2B |') +
      '\r\n\r\nTail  \r\n';
    await mountTableEditor(page, source);
    const before = await tableModel(page);
    const action = await tableMenu(page, '#write thead th:first-child', '在上方插入行');
    await expect(action).toBeEnabled();
    await action.click();
    expect(await tableSource(page)).toBe(expected);
    const after = await tableModel(page);
    expect(after.rows.slice(1)).toEqual(before.rows);
    await tableHistory(page, 'undo');
    expect(await tableSource(page)).toBe(source);
    await tableHistory(page, 'redo');
    expect(await tableSource(page)).toBe(expected);
    expect(await tableErrors(page)).toEqual([]);
    const meaning = await tableMeaning(page);
    await mountTableEditor(page, expected);
    expect(await tableMeaning(page)).toEqual(meaning);
    expect(await tableSource(page)).toBe(expected);
    expect(await tableErrors(page)).toEqual([]);
  });
