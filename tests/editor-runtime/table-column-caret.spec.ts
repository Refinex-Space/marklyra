import { expect, test } from '@playwright/test';
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

for (const container of ['root', 'quote', 'ordered-list'] as const)
  test(`${container} column insertion Redo restores its actual table cell caret before no-click typing`, async ({
    page,
  }, info) => {
    const source = tableDocument(
      '| H1 | H2 |\r\n| :--- | ---: |\n| Alpha | Beta |\r\n| Gamma | Delta |',
      container,
    );
    await mountTableEditor(page, source);
    const state = () =>
      tableFrame(page)
        .locator('#write')
        .evaluate(() => {
          const editor = (window as unknown as LegacyGlobals).editor;
          if (!editor) throw Error('Missing editor');
          const selection = getSelection(),
            node = selection?.anchorNode,
            element = node?.nodeType === 1 ? (node as Element) : node?.parentElement;
          return {
            cursor: editor.selection.buildUndo(),
            cid: element?.closest('[cid]')?.getAttribute('cid'),
            offset: selection?.anchorOffset,
            index: editor.undo.index,
            entry: editor.undo.commandStack[editor.undo.index],
          };
        });
    await (await tableMenu(page, '#write thead th:first-child', '在左侧插入列')).click();
    const edited = await tableSource(page),
      after = await state(),
      cell = (await tableModel(page)).rows[0]?.cells[0]?.id;
    expect(after.cid).toBe(cell);
    await tableHistory(page, 'undo');
    expect(await tableSource(page)).toBe(source);
    const undone = await state();
    await tableHistory(page, 'redo');
    expect(await tableSource(page)).toBe(edited);
    const redone = await state();
    await info.attach('native-table-history', {
      body: JSON.stringify({ after, undone, redone }, null, 2),
      contentType: 'application/json',
    });
    expect(redone.cid).toBe(cell);
    await page.keyboard.type('7');
    expect(await tableSource(page)).toBe(edited.replace('|  | H1', '| 7 | H1'));
    expect(await tableErrors(page)).toEqual([]);
  });

test('column cursor repair leaves an unknown mixed redo entry untouched', async ({ page }) => {
  const source = '| H1 | H2 |\n| :--- | ---: |\n| A1 | A2 |\n';
  await mountTableEditor(page, source);
  await tableFrame(page)
    .locator('#write')
    .evaluate(() => {
      const editor = (window as unknown as LegacyGlobals).editor;
      if (!editor) throw Error('Missing editor');
      const original = editor.tableEdit.addCol;
      editor.tableEdit.addCol = function (before) {
        original.call(this, before);
        const entry = editor.undo.commandStack[editor.undo.index],
          redo: unknown = entry && Reflect.get(entry, 'redo');
        if (!Array.isArray(redo)) throw Error('Missing authored redo');
        redo.push({ type: 'unknown-command' });
      };
    });
  await (await tableMenu(page, '#write thead th:first-child', '在左侧插入列')).click();
  await expect
    .poll(() => tableSource(page))
    .toBe('|  | H1 | H2 |\n| ---- | :--- | ---: |\n|  | A1 | A2 |\n');
  const types = await tableFrame(page)
    .locator('#write')
    .evaluate(() => {
      const editor = (window as unknown as LegacyGlobals).editor,
        entry = editor?.undo.commandStack[editor.undo.index],
        redo: unknown = entry && Reflect.get(entry, 'redo');
      if (!Array.isArray(redo)) throw Error('Missing authored redo');
      return redo.map((command) => command.type as unknown);
    });
  expect(types).toEqual(['replace', 'unknown-command']);
  expect(await tableSource(page)).toBe('|  | H1 | H2 |\n| ---- | :--- | ---: |\n|  | A1 | A2 |\n');
  expect(await tableErrors(page)).toEqual([]);
});
