import { writeFile } from 'node:fs/promises';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';
import type { LegacyGlobals } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type Host = Window & { marklyraEditor: MarkLyraEditor; wholeDocumentErrors: string[] };
const raw = 'Alpha first\r\n\r\nGamma delta\n';
test('whole-document reverse delete Undo replacement Undo keeps exact original source', async ({
  page,
}, info) => {
  const records: unknown[] = [],
    pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (markdown) => {
    const host = window as unknown as Host;
    await host.marklyraEditor.ready;
    const Constructor = host.marklyraEditor.constructor as typeof MarkLyraEditor;
    host.marklyraEditor.destroy();
    const root = document.querySelector<HTMLElement>('#editor');
    if (!root) throw Error('Host');
    host.wholeDocumentErrors = [];
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown,
      configuration: { sourceBOM: 'text' },
      onError: (error) => host.wholeDocumentErrors.push(error.message),
    });
    await host.marklyraEditor.ready;
  }, raw);
  const frame = page.frames().find((value) => value.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Runtime');
  const flush = () => page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
  const command = (type: 'undo' | 'redo' | 'toggleSource') =>
    page.evaluate((type) => (window as unknown as Host).marklyraEditor.execute({ type }), type);
  const snapshot = async (label: string) => {
    const native = await frame.evaluate(() => {
      const editor = (window as unknown as LegacyGlobals).editor;
      if (!editor) throw Error('Editor');
      const selection = document.getSelection();
      const position = (node: Node | null, offset: number) => {
        const element = node?.nodeType === 1 ? (node as Element) : node?.parentElement,
          block = element?.closest('[cid]');
        if (!node || !block) return null;
        const range = document.createRange();
        range.selectNodeContents(block);
        range.setEnd(node, offset);
        return {
          cid: block.getAttribute('cid'),
          offset: range.cloneContents().textContent?.length ?? 0,
        };
      };
      return {
        canonical: editor.getMarkdown(),
        dom: editor.writingArea.innerHTML,
        blocks: [...editor.writingArea.children].map((element) => {
          const cid = element.getAttribute('cid') ?? '',
            node = editor.getNode(cid);
          return { cid, text: node?.get('text'), mark: node?.toMark() };
        }),
        index: editor.undo.index,
        history: editor.undo.commandStack,
        bookmark: editor.selection.buildUndo(),
        selection: {
          anchor: position(selection?.anchorNode ?? null, selection?.anchorOffset ?? 0),
          head: position(selection?.focusNode ?? null, selection?.focusOffset ?? 0),
        },
      };
    });
    records.push({ label, native });
    return native;
  };
  try {
    expect(await flush()).toBe(raw);
    await frame.evaluate(() => {
      const area = document.querySelector<HTMLElement>('#write');
      if (!area) throw Error('Area');
      const paragraphs = area.querySelectorAll('p');
      const first = paragraphs[0],
        last = paragraphs[paragraphs.length - 1];
      if (!first || !last) throw Error('Paragraphs');
      const texts = (element: Element) => {
        const walker = document.createTreeWalker(element, 4),
          nodes: Node[] = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
        return nodes;
      };
      const firstText = texts(first)[0],
        lastText = texts(last).at(-1);
      if (!firstText || !lastText) throw Error('Text');
      area.focus();
      document
        .getSelection()
        ?.setBaseAndExtent(lastText, lastText.textContent?.length ?? 0, firstText, 0);
    });
    const selected = await snapshot('whole-document reversed selection');
    expect(selected.selection.anchor?.cid).not.toBe(selected.selection.head?.cid);
    expect(selected.selection.head?.offset).toBe(0);
    await page.keyboard.press('Backspace');
    await snapshot('deleted');
    expect(await flush()).toBe('\n');
    await command('undo');
    await snapshot('first Undo');
    expect(await flush()).toBe(raw);
    await page.keyboard.type('Q');
    await snapshot('actual replacement after Undo');
    expect(await flush()).toBe('Q\n');
    await command('undo');
    const restored = await snapshot('second Undo');
    expect(await flush()).toBe(raw);
    expect(restored.selection).toEqual(selected.selection);
    await command('redo');
    await snapshot('replacement Redo');
    expect(await flush()).toBe('Q\n');
    await command('undo');
    expect(await flush()).toBe(raw);
    await command('toggleSource');
    await snapshot('Source mode after history chain');
    expect(await flush()).toBe(raw);
    await command('toggleSource');
    await snapshot('WYS mode after Source');
    expect(await flush()).toBe(raw);
    expect(await page.evaluate(() => (window as unknown as Host).wholeDocumentErrors)).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await writeFile(
      info.outputPath('whole-document-history.json'),
      JSON.stringify(
        {
          raw,
          records,
          pageErrors,
          errors: await page.evaluate(() => (window as unknown as Host).wholeDocumentErrors),
        },
        null,
        2,
      ),
    );
  }
});
