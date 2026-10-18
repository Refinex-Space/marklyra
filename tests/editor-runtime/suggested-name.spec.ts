import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type Host = Window & { marklyraEditor: MarkLyraEditor };
type Child = Window & {
  editor: LegacyEditor;
  nameBefore?: {
    undo: object;
    entries: object[];
    anchor: Node | null;
    anchorOffset: number;
    focus: Node | null;
    focusOffset: number;
    active: Element | null;
  };
};
const frame = (page: Page) => page.frameLocator('.marklyra-editor-frame');
async function mount(page: Page, markdown: string) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (markdown) => {
    const host = window as unknown as Host,
      old = host.marklyraEditor;
    await old.ready;
    const Constructor = old.constructor as typeof MarkLyraEditor,
      container = old.element.parentElement;
    if (!container) throw Error('Missing container');
    old.destroy();
    host.marklyraEditor = new Constructor(container, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown,
      configuration: { sourceBOM: 'metadata' },
    });
    await host.marklyraEditor.ready;
    await host.marklyraEditor.flush();
  }, markdown);
}

for (const vector of [
  {
    name: 'first live heading',
    raw: '\uFEFFLead\r\n\r\n## First Heading\n\n# Later\r\n',
    expected: 'First Heading',
  },
  {
    name: 'quoted YAML title and date',
    raw: '\uFEFF---\r\ntitle: "A Great Day"\ndate: 2026-10-16\r\n---\n\n# Ignored\n\nTail',
    expected: '2026-10-16-A-Great-Day',
  },
  { name: 'ordinary first block', raw: 'Alpha **Bold**\r\n\r\nTail', expected: 'Alpha Bold' },
])
  test(`suggested filename uses original ${vector.name} without modifying source/history/DOM selection`, async ({
    page,
  }) => {
    await mount(page, vector.raw);
    const area = frame(page).locator('#write');
    await area.locator('p').last().click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
    const before = await page.evaluate(() => {
      const editor = (window as unknown as Host).marklyraEditor;
      return {
        source: editor.getMarkdown(),
        revision: editor.revision,
        selection: editor.getSelection(),
      };
    });
    await area.evaluate(() => {
      const child = window as unknown as Child,
        selection = document.getSelection();
      child.nameBefore = {
        undo: child.editor.undo,
        entries: [...child.editor.undo.commandStack],
        anchor: selection?.anchorNode ?? null,
        anchorOffset: selection?.anchorOffset ?? 0,
        focus: selection?.focusNode ?? null,
        focusOffset: selection?.focusOffset ?? 0,
        active: document.activeElement,
      };
    });
    expect(
      await page.evaluate(() => (window as unknown as Host).marklyraEditor.getSuggestedFileName()),
    ).toBe(vector.expected);
    const after = await page.evaluate(() => {
      const editor = (window as unknown as Host).marklyraEditor;
      return {
        source: editor.getMarkdown(),
        revision: editor.revision,
        selection: editor.getSelection(),
      };
    });
    expect(after).toEqual(before);
    expect(
      await area.evaluate(() => {
        const child = window as unknown as Child,
          before = child.nameBefore,
          selection = document.getSelection();
        return (
          !!before &&
          before.undo === child.editor.undo &&
          before.entries.length === child.editor.undo.commandStack.length &&
          before.entries.every((entry, i) => entry === child.editor.undo.commandStack[i]) &&
          before.anchor === selection?.anchorNode &&
          before.anchorOffset === selection?.anchorOffset &&
          before.focus === selection?.focusNode &&
          before.focusOffset === selection?.focusOffset &&
          before.active === document.activeElement
        );
      }),
    ).toBe(true);
    expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
      vector.raw,
    );
  });

test('source suggestion reads the original first line and keeps reverse CM selection and history', async ({
  page,
}) => {
  const raw = '\uFEFF# Alpha **Bold**\r\n\r\nTail';
  await mount(page, raw);
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
  );
  await frame(page)
    .locator('body')
    .evaluate(() => {
      const cm = (window as unknown as Child).editor.sourceView.cm;
      if (!cm) throw Error('Missing source CM');
      cm.setSelections([{ anchor: { line: 0, ch: 15 }, head: { line: 0, ch: 2 } }], 0);
      cm.focus();
    });
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
  const before = await frame(page)
    .locator('body')
    .evaluate(() => {
      const cm = (window as unknown as Child).editor.sourceView.cm;
      if (!cm) throw Error('Missing source CM');
      return {
        ranges: cm.listSelections(),
        generation: cm.doc.history.generation,
        value: cm.getValue(),
      };
    });
  expect(before.ranges).toMatchObject([{ anchor: { line: 0, ch: 15 }, head: { line: 0, ch: 2 } }]);
  expect(
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.getSuggestedFileName()),
  ).toBe('# Alpha Bold');
  expect(
    await frame(page)
      .locator('body')
      .evaluate(() => {
        const cm = (window as unknown as Child).editor.sourceView.cm;
        if (!cm) throw Error('Missing source CM');
        return {
          ranges: cm.listSelections(),
          generation: cm.doc.history.generation,
          value: cm.getValue(),
        };
      }),
  ).toEqual(before);
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(raw);
});
