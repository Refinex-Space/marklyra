import { expect, test } from '@playwright/test';
import { tableDocument } from '../fixtures/table-source-fixtures.js';
import {
  mountTableEditor,
  tableErrors,
  tableFrame,
  tableHistory,
  tableMeaning,
  tableMenu,
  tableModel,
  tableSource,
} from './table-editing.helpers.js';

for (const container of ['root', 'quote', 'ordered-list'] as const) {
  for (const up of [true, false])
    test(`${container} moves ${up ? 'first body up into header' : 'header down'} keeping untouched physical lines`, async ({
      page,
    }) => {
      const raw = '| H1 | H2 |\r\n| :--- | ---: |\n| A1 | A2 |\r\n| B1 | B2 |',
        moved = '| A1 | A2 |\r\n| :--- | ---: |\n| H1 | H2 |\r\n| B1 | B2 |',
        source = tableDocument(raw, container),
        expected = tableDocument(moved, container);
      await mountTableEditor(page, source);
      const initial = await tableModel(page);
      const action = await tableMenu(
        page,
        up ? '#write tbody tr:first-child td:first-child' : '#write thead th:first-child',
        up ? '上移行' : '下移行',
      );
      await action.click();
      expect(await tableSource(page)).toBe(expected);
      expect((await tableModel(page)).rows).toEqual([
        initial.rows[1],
        initial.rows[0],
        initial.rows[2],
      ]);
      await tableHistory(page, 'undo');
      expect(await tableSource(page)).toBe(source);
      await tableHistory(page, 'redo');
      expect(await tableSource(page)).toBe(expected);
      const meaning = await tableMeaning(page);
      expect(await tableErrors(page)).toEqual([]);
      await mountTableEditor(page, expected);
      expect(await tableMeaning(page)).toEqual(meaning);
    });
  for (const kind of ['last-body-tab', 'header-only-tab', 'first-header-shift-tab'] as const)
    test(`${container} ${kind} adds precisely one body row with reversible source`, async ({
      page,
    }) => {
      const only = kind === 'header-only-tab',
        raw = '| H1 | H2 |\r\n| :--- | ---: |' + (only ? '' : '\n| A1 | A2 |'),
        source = tableDocument(raw, container);
      await mountTableEditor(page, source);
      const initial = await tableModel(page);
      const selector =
        kind === 'last-body-tab'
          ? '#write tbody tr:last-child td:last-child'
          : kind === 'header-only-tab'
            ? '#write thead th:last-child'
            : '#write thead th:first-child';
      await tableFrame(page).locator(selector).click();
      await page.keyboard.press(kind === 'first-header-shift-tab' ? 'Shift+Tab' : 'Tab');
      const edited = await tableSource(page),
        current = await tableModel(page),
        at = kind === 'first-header-shift-tab' ? 1 : initial.rows.length;
      expect(current.rows.length).toBe(initial.rows.length + 1);
      expect(current.rows.filter((_, i) => i !== at)).toEqual(initial.rows);
      expect(current.rows[at]?.cells.map((c) => c.text)).toEqual(['', '']);
      expect(edited).toContain('| :--- | ---: |');
      await tableHistory(page, 'undo');
      expect(await tableSource(page)).toBe(source);
      await tableHistory(page, 'redo');
      expect(await tableSource(page)).toBe(edited);
      const meaning = await tableMeaning(page);
      expect(await tableErrors(page)).toEqual([]);
      await mountTableEditor(page, edited);
      expect(await tableMeaning(page)).toEqual(meaning);
    });
}
