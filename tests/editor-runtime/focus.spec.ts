import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';

type Host = Window & { marklyraEditor: MarkLyraEditor };
interface Position {
  line: number;
  ch: number;
}
interface CM {
  focus(): void;
  setSelections(ranges: { anchor: Position; head: Position }[], primary?: number): void;
  listSelections(): { anchor: Position; head: Position }[];
  getHistory(): unknown;
}
type Frame = Window & { editor: { writingArea: HTMLElement; sourceView: { cm: CM } } };
async function load(page: Page, source: string) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.ready;
    await editor.load(source);
    const button = document.createElement('button');
    button.id = 'statistics-host-control';
    button.textContent = 'Host';
    document.body.append(button);
  }, source);
  const frame = page.frames().find((f) => f.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing runtime');
  return frame;
}
async function queryBlurFocus(page: Page) {
  await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    for (let i = 0; ; i++) {
      try {
        await editor.getStatistics();
        break;
      } catch (error) {
        if (i > 5) throw error;
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    }
  });
  await page.locator('#statistics-host-control').click();
  // Model the host's dialog focus restoration: iframe.focus() alone can leave
  // the child body's focus active while retaining its native selection.
  await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.focus();
  });
}
for (const reverse of [false, true]) {
  test(`statistics host round-trip preserves WYS input ownership (reverse=${reverse})`, async ({
    page,
  }) => {
    const frame = await load(page, 'Alpha beta');
    await expect(frame.locator('#write')).toContainText('Alpha beta');
    await frame.evaluate((reverse) => {
      const area = (window as unknown as Frame).editor.writingArea;
      area.focus();
      const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
      let text: Node | null = walker.nextNode();
      while (text && text.textContent !== 'Alpha beta') text = walker.nextNode();
      if (!text) throw Error('Missing exact paragraph text');
      getSelection()?.setBaseAndExtent(text, reverse ? 5 : 0, text, reverse ? 0 : 5);
    }, reverse);
    await queryBlurFocus(page);
    expect(
      await frame.evaluate(() => ({
        active: document.activeElement?.id,
        text: getSelection()?.toString(),
        anchor: getSelection()?.anchorOffset,
        head: getSelection()?.focusOffset,
      })),
    ).toEqual({ active: 'write', text: 'Alpha', anchor: reverse ? 5 : 0, head: reverse ? 0 : 5 });
    await page.keyboard.type('X');
    expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
      'X beta',
    );
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }));
    expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
      'Alpha beta',
    );
  });
}
for (const mode of ['source', 'code'] as const) {
  test(`statistics host round-trip preserves ${mode} CM directions and real replacement`, async ({
    page,
  }) => {
    const source =
      mode === 'source' ? 'Alpha beta\nGamma delta' : '```js\nAlpha beta\nGamma delta\n```\n';
    const frame = await load(page, source);
    if (mode === 'source')
      await page.evaluate(() =>
        (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
      );
    const before = await frame.evaluate((mode) => {
      const editor = (window as unknown as Frame).editor;
      const cm =
        mode === 'source'
          ? editor.sourceView.cm
          : (
              editor.writingArea.querySelector('.CodeMirror') as
                | (HTMLElement & { CodeMirror: CM })
                | null
            )?.CodeMirror;
      if (!cm) throw Error('Missing CM');
      cm.focus();
      cm.setSelections(
        [
          { anchor: { line: 0, ch: 5 }, head: { line: 0, ch: 0 } },
          { anchor: { line: 1, ch: 0 }, head: { line: 1, ch: 5 } },
        ],
        1,
      );
      return { selections: cm.listSelections(), history: cm.getHistory() };
    }, mode);
    await queryBlurFocus(page);
    const after = await frame.evaluate((mode) => {
      const editor = (window as unknown as Frame).editor;
      const cm =
        mode === 'source'
          ? editor.sourceView.cm
          : (editor.writingArea.querySelector('.CodeMirror') as HTMLElement & { CodeMirror: CM })
              .CodeMirror;
      return {
        selections: cm.listSelections(),
        history: cm.getHistory(),
        active: document.activeElement?.tagName,
      };
    }, mode);
    expect(after).toEqual({ ...before, active: 'TEXTAREA' });
    await page.keyboard.type('X');
    expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
      source.replace('Alpha', 'X').replace('Gamma', 'X'),
    );
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }));
    expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
      source,
    );
  });
}
