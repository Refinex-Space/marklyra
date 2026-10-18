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

for (const quote of [false, true])
  test(`deleting the computed-width maximum row preserves all other raw lines, quote=${quote}`, async ({
    page,
  }) => {
    const table =
      '| H1 | H2 |\r\n| :--- | ---: |\n| much-longer-than-others | very-long-content |\r\n| short | small |\n| tail | last |\r\n';
    const source =
      '\ufeff' +
      (quote
        ? table
            .split(/(?<=\n)/u)
            .map((line) => '> ' + line)
            .join('')
        : table);
    await mountTableEditor(page, source);
    const format = await tableMenu(
      page,
      '#write tbody tr:first-child td:first-child',
      '整理表格源码',
    );
    await format.click();
    const formatted = await tableSource(page),
      before = await tableModel(page);
    const lines = [...formatted.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/gu)].filter(
      (match) => match[0] !== '',
    );
    const removed = lines[2];
    if (!removed || !removed[0].includes('much-longer-than-others'))
      throw Error('Missing authored formatted row');
    const expected =
      formatted.slice(0, removed.index) + formatted.slice(removed.index + removed[0].length);
    const action = await tableMenu(page, '#write tbody tr:first-child td:first-child', '删除行');
    await expect(action).toBeEnabled();
    await action.click();
    expect(await tableSource(page)).toBe(expected);
    const after = await tableModel(page);
    expect(after.rows).toEqual(before.rows.filter((_, i) => i !== 1));
    expect(after.align).toEqual(before.align);
    await tableHistory(page, 'undo');
    expect(await tableSource(page)).toBe(formatted);
    await tableHistory(page, 'redo');
    expect(await tableSource(page)).toBe(expected);
    const meaning = await tableMeaning(page);
    expect(await tableErrors(page)).toEqual([]);
    await mountTableEditor(page, expected);
    expect(await tableMeaning(page)).toEqual(meaning);
    expect(await tableSource(page)).toBe(expected);
    expect(await tableErrors(page)).toEqual([]);
  });
