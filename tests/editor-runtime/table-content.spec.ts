import { expect, test } from '@playwright/test';
import { tableDocument } from '../fixtures/table-source-fixtures.js';
import {
  mountTableEditor,
  tableErrors,
  tableFrame,
  tableHistory,
  tableMeaning,
  tableModel,
  tableSource,
} from './table-editing.helpers.js';

for (const container of ['root', 'quote'] as const) {
  test(`${container} synthetic HTML matrix paste edits the existing grid without resizing`, async ({
    page,
  }) => {
    const raw = '| H1 | H2 |\r\n| :--- | ---: |\n|  |  |\r\n|  |  |',
      source = tableDocument(raw, container),
      expected = tableDocument('| H1 | H2 |\r\n| :--- | ---: |\n| A | B |\r\n| C | D |', container);
    await mountTableEditor(page, source);
    const initial = await tableModel(page);
    await tableFrame(page).locator('#write tbody tr:first-child td:first-child').click();
    await tableFrame(page)
      .locator('#write')
      .evaluate((area) => {
        const data = new DataTransfer();
        data.setData('text/plain', 'A\tB\nC\tD');
        data.setData(
          'text/html',
          '<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>',
        );
        area.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
        );
      });
    expect(await tableSource(page)).toBe(expected);
    expect((await tableModel(page)).rows.map((r) => r.cells.map((c) => c.id))).toEqual(
      initial.rows.map((r) => r.cells.map((c) => c.id)),
    );
    await tableHistory(page, 'undo');
    expect(await tableSource(page)).toBe(source);
    await tableHistory(page, 'redo');
    expect(await tableSource(page)).toBe(expected);
    const meaning = await tableMeaning(page);
    expect(await tableErrors(page)).toEqual([]);
    await mountTableEditor(page, expected);
    expect(await tableMeaning(page)).toEqual(meaning);
  });
  for (const backward of [false, true])
    test(`${container} ${backward ? 'backward' : 'forward'} linear multicell delete retains grid, source and history`, async ({
      page,
    }) => {
      const raw = '| H1 | H2 |\r\n| :--- | ---: |\n| R1A | R1B |\r\n| R2A | R2B |',
        source = tableDocument(raw, container),
        expected = tableDocument('| H1 | H2 |\r\n| :--- | ---: |\n| R |  |\r\n|  | B |', container);
      await mountTableEditor(page, source);
      const initial = await tableModel(page);
      await tableFrame(page)
        .locator('#write')
        .evaluate((area, backward) => {
          const fields = [...area.querySelectorAll('tbody [mdtype="table_cell"][cid]')],
            text = (field: Element | undefined, expected: string) => {
              if (!field) return;
              const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
              for (let node = walker.nextNode(); node; node = walker.nextNode())
                if (node.textContent === expected) return node;
            },
            first = text(fields[0], 'R1A'),
            last = text(fields.at(-1), 'R2B');
          if (!first || !last) throw Error('Missing authored plain cell text');
          (fields[0] as HTMLElement).focus();
          if (backward) getSelection()?.setBaseAndExtent(last, 2, first, 1);
          else getSelection()?.setBaseAndExtent(first, 1, last, 2);
        }, backward);
      await page.keyboard.press('Delete');
      expect(await tableSource(page)).toBe(expected);
      expect((await tableModel(page)).rows.map((r) => r.cells.map((c) => c.id))).toEqual(
        initial.rows.map((r) => r.cells.map((c) => c.id)),
      );
      await tableHistory(page, 'undo');
      expect(await tableSource(page)).toBe(source);
      await tableHistory(page, 'redo');
      expect(await tableSource(page)).toBe(expected);
      const meaning = await tableMeaning(page);
      expect(await tableErrors(page)).toEqual([]);
      await mountTableEditor(page, expected);
      expect(await tableMeaning(page)).toEqual(meaning);
    });
}
