import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { readSelectionText } from '../../packages/editor-runtime/src/runtime/selection-text.js';

test('native caret shortcut preserves reversed, cross-block and form-control selection text', async ({
  page,
}) => {
  await page.goto('/');
  const module = `/@fs${fileURLToPath(new URL('../../packages/editor-runtime/src/runtime/selection-text.ts', import.meta.url))}`;
  const cases = await page.evaluate(async (module) => {
    const { readSelectionText: read } = (await import(module)) as {
      readSelectionText: typeof readSelectionText;
    };
    const area = document.createElement('div');
    area.innerHTML =
      '<div contenteditable><p>Alpha <strong>Bravo😀</strong></p><p>Next</p></div><input value="Input value"><textarea>Textarea value</textarea>';
    document.body.append(area);
    const selection = getSelection();
    if (!selection) throw Error('No native Selection');
    const prototype = Object.getPrototypeOf(selection) as Selection;
    const original = prototype.toString;
    let calls = 0;
    prototype.toString = function () {
      calls++;
      return original.call(this);
    };
    const result: {
      name: string;
      native: string;
      actual: string;
      calls: number;
      type: string;
      collapsed: boolean;
      unchanged: boolean;
    }[] = [];
    const record = (name: string) => {
      const before = [
        selection.anchorNode,
        selection.anchorOffset,
        selection.focusNode,
        selection.focusOffset,
      ];
      const native = original.call(selection);
      calls = 0;
      const actual = read(selection);
      result.push({
        name,
        native,
        actual,
        calls,
        type: selection.type,
        collapsed: selection.isCollapsed,
        unchanged: before.every(
          (value, i) =>
            value ===
            [
              selection.anchorNode,
              selection.anchorOffset,
              selection.focusNode,
              selection.focusOffset,
            ][i],
        ),
      });
    };
    try {
      selection.removeAllRanges();
      record('none');
      const editable = area.firstElementChild as HTMLElement;
      editable.focus();
      const first = area.querySelector('p')?.firstChild;
      const strong = area.querySelector('strong')?.firstChild;
      const last = area.querySelectorAll('p')[1]?.firstChild;
      if (!first || !strong || !last) throw Error('Missing fixture nodes');
      selection.setBaseAndExtent(first, 2, first, 2);
      record('caret');
      selection.setBaseAndExtent(strong, 7, strong, 0);
      record('reversed');
      selection.setBaseAndExtent(first, 0, last, 4);
      record('cross-block');
      for (const tag of ['input', 'textarea'] as const) {
        const field = area.querySelector(tag);
        if (!field) throw Error('Missing control');
        field.focus();
        field.setSelectionRange(0, 3);
        record(`${tag} range`);
        field.setSelectionRange(2, 2);
        record(`${tag} caret`);
      }
    } finally {
      prototype.toString = original;
      selection.removeAllRanges();
      area.remove();
    }
    return result;
  }, module);
  for (const entry of cases) {
    expect(entry.actual, entry.name).toBe(entry.native);
    expect(entry.unchanged, entry.name).toBe(true);
    expect(entry.calls, entry.name).toBe(entry.type === 'Caret' || entry.type === 'None' ? 0 : 1);
  }
  expect(cases.find((entry) => entry.name === 'reversed')?.actual).toBe('Bravo😀');
  expect(cases.find((entry) => entry.name === 'input range')).toMatchObject({
    actual: 'Inp',
    type: 'Range',
    collapsed: true,
  });
  expect(cases.find((entry) => entry.name === 'textarea range')).toMatchObject({
    actual: 'Tex',
    type: 'Range',
    collapsed: true,
  });
});
