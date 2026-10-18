import { expect, test } from '@playwright/test';
import { tableDocument } from '../fixtures/table-source-fixtures.js';
import {
  mountTableEditor,
  tableErrors,
  tableHistory,
  tableMeaning,
  tableMenu,
  tableModel,
  tableSource,
} from './table-editing.helpers.js';

for (const container of ['root', 'quote', 'ordered-list'] as const)
  for (const operation of ['delete', 'left', 'right'] as const)
    test(`${container} ${operation} column preserves source fragments and column alignment`, async ({
      page,
    }) => {
      const raw =
          '| H1  | H2 |  H3 |\r\n| :--- | :---: | ----: |\n| A1  | A2 |  A3 |\r\n| B1  | B2 |  B3 |',
        source = tableDocument(raw, container),
        expectedTable =
          operation === 'delete'
            ? '| H1  |  H3 |\r\n| :--- | ----: |\n| A1  |  A3 |\r\n| B1  |  B3 |'
            : operation === 'left'
              ? '| H2 | H1  |  H3 |\r\n| :---: | :--- | ----: |\n| A2 | A1  |  A3 |\r\n| B2 | B1  |  B3 |'
              : '| H1  |  H3 | H2 |\r\n| :--- | ----: | :---: |\n| A1  |  A3 | A2 |\r\n| B1  |  B3 | B2 |',
        expected = tableDocument(expectedTable, container);
      await mountTableEditor(page, source);
      const initial = await tableModel(page),
        order = operation === 'delete' ? [0, 2] : operation === 'left' ? [1, 0, 2] : [0, 2, 1];
      const item = await tableMenu(
        page,
        '#write thead th:nth-child(2)',
        operation === 'delete' ? '删除列' : operation === 'left' ? '左移列' : '右移列',
      );
      await item.click();
      expect(await tableSource(page)).toBe(expected);
      const after = await tableModel(page);
      expect(after.rows.map((r) => r.cells)).toEqual(
        initial.rows.map((r) => order.map((i) => r.cells[i])),
      );
      expect(after.align).toEqual(
        order.map((i) => initial.align && (initial.align as unknown[])[i]),
      );
      expect(after.path).toEqual(initial.path);
      await tableHistory(page, 'undo');
      expect(await tableSource(page)).toBe(source);
      await tableHistory(page, 'redo');
      expect(await tableSource(page)).toBe(expected);
      const meaning = await tableMeaning(page);
      expect(await tableErrors(page)).toEqual([]);
      await mountTableEditor(page, expected);
      expect(await tableMeaning(page)).toEqual(meaning);
    });

for (const container of ['root', 'quote', 'ordered-list'] as const)
  for (const before of [true, false])
    test(`${container} inserts ${before ? 'left' : 'right'} column with synchronized alignment and exact survivors`, async ({
      page,
    }) => {
      const raw = '| H1 | H2 |\r\n| :--- | ---: |\n| A1 | A2 |\r\n| B1 | B2 |';
      const source = tableDocument(raw, container);
      await mountTableEditor(page, source);
      const initial = await tableModel(page);
      const item = await tableMenu(
        page,
        '#write thead th:first-child',
        before ? '在左侧插入列' : '在右侧插入列',
      );
      await expect(item).toBeEnabled();
      await item.click();
      const edited = await tableSource(page),
        model = await tableModel(page);
      const expectedTable = before
        ? '|  | H1 | H2 |\r\n| ---- | :--- | ---: |\n|  | A1 | A2 |\r\n|  | B1 | B2 |'
        : '| H1 |  | H2 |\r\n| :--- | ---- | ---: |\n| A1 |  | A2 |\r\n| B1 |  | B2 |';
      expect(edited).toBe(tableDocument(expectedTable, container));
      expect(model.align).toEqual(before ? [null, 'left', 'right'] : ['left', null, 'right']);
      expect(model.rows.map((r) => r.cells.filter((_, i) => i !== (before ? 0 : 1)))).toEqual(
        initial.rows.map((r) => r.cells),
      );
      expect(model.path).toEqual(initial.path);
      await tableHistory(page, 'undo');
      expect(await tableSource(page)).toBe(source);
      await tableHistory(page, 'redo');
      expect(await tableSource(page)).toBe(edited);
      const meaning = await tableMeaning(page);
      expect(await tableErrors(page)).toEqual([]);
      await mountTableEditor(page, edited);
      expect(await tableMeaning(page)).toEqual(meaning);
      expect(await tableErrors(page)).toEqual([]);
    });
