import { expect, test } from '@playwright/test';
import {
  repeatedTable,
  tableContainers,
  tableDocument,
  tableRowFixtures,
} from '../fixtures/table-source-fixtures.js';
import {
  mountTableEditor,
  tableErrors,
  tableHistory,
  tableMeaning,
  tableMenu,
  tableModel,
  tableSource,
} from './table-editing.helpers.js';

for (const container of tableContainers)
  for (const fixture of tableRowFixtures)
    test(`${container} ${fixture.id}: exact source, linked identities, history and semantic reparse`, async ({
      page,
    }) => {
      const source = tableDocument(repeatedTable, container),
        expected = tableDocument(fixture.expected, container);
      await mountTableEditor(page, source);
      const before = await tableModel(page);
      const action = await tableMenu(page, fixture.selector, fixture.label);
      await expect(action).toBeEnabled();
      await action.click();
      expect(await tableSource(page)).toBe(expected);
      const after = await tableModel(page);
      const survivors =
        fixture.kind === 'delete' ? before.rows.filter((_, i) => i !== fixture.at) : before.rows;
      expect(
        fixture.kind === 'insert' ? after.rows.filter((_, i) => i !== fixture.at) : after.rows,
      ).toEqual(survivors);
      expect(after.path).toEqual(before.path);
      expect(after.align).toEqual(before.align);
      expect(after.domRows.map((row) => row.map((cell) => cell.id))).toEqual(
        after.rows.map((row) => row.cells.map((cell) => cell.id)),
      );
      await tableHistory(page, 'undo');
      expect(await tableSource(page)).toBe(source);
      expect((await tableModel(page)).rows).toEqual(before.rows);
      await tableHistory(page, 'redo');
      expect(await tableSource(page)).toBe(expected);
      const meaning = await tableMeaning(page);
      expect(await tableErrors(page)).toEqual([]);
      await mountTableEditor(page, expected);
      expect(await tableMeaning(page)).toEqual(meaning);
      expect(await tableSource(page)).toBe(expected);
      expect(await tableErrors(page)).toEqual([]);
    });
