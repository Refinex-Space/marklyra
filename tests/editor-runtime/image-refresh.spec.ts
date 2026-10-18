import { expect, test } from '@playwright/test';
import {
  createImageEditor,
  expectDecodedImage,
  focusEnd,
  type ImageTestWindow,
  imageCommand,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

interface Position {
  line: number;
  ch: number;
}
interface CodeMirror {
  focus(): void;
  setCursor(position: Position): void;
  setSelections(selections: { anchor: Position; head: Position }[], primary?: number): void;
  listSelections(): { anchor: Position; head: Position }[];
}
interface NativeWindow extends Window {
  editor: {
    selection: { buildUndo(): unknown };
    sourceView: { inSourceMode: boolean; cm?: CodeMirror };
    undo: { index: number; commandStack: unknown[] };
  };
}

for (const mode of [
  'plain-caret',
  'reverse-selection',
  'source-caret',
  'source-selection',
  'source-multiple',
  'code-selection',
  'code-multiple',
] as const) {
  test(`host image decoration retains ${mode}, source and history`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await setupImageHost(page);
    const source =
      '\uFEFFIntro\r\n\r\n```js\r\nconst value = 1;\r\n```\n\nBefore\r\n\r\n' +
      Array.from({ length: 4 }, (_, at) => `![pixel ${at}](images/pixel-${at}.png)`).join(
        '\r\n\r\n',
      ) +
      '\n\nAfter';
    await createImageEditor(page, { source, context: 'refresh-doc', resolve: 'defer' });
    const frame = imageFrame(page);
    // The fixture includes a lazily initialized original code fence. Establish
    // that actual instance before comparing decoration effects on its selection.
    await expect(frame.locator('#write .CodeMirror')).toHaveCount(1);
    if (mode.startsWith('source-')) {
      await page.evaluate(() =>
        (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'toggleSource' }),
      );
      await frame.locator('#write').evaluate((_, sourceMode) => {
        const cm = (window as unknown as NativeWindow).editor.sourceView.cm;
        if (!cm) throw new Error('Missing source CodeMirror');
        cm.focus();
        if (sourceMode === 'source-multiple')
          cm.setSelections(
            [
              { anchor: { line: 3, ch: 5 }, head: { line: 3, ch: 1 } },
              { anchor: { line: 4, ch: 3 }, head: { line: 4, ch: 0 } },
            ],
            1,
          );
        else if (sourceMode === 'source-selection')
          cm.setSelections([{ anchor: { line: 4, ch: 3 }, head: { line: 4, ch: 0 } }]);
        else cm.setCursor({ line: 4, ch: 3 });
      }, mode);
    } else if (mode === 'code-selection' || mode === 'code-multiple') {
      await expect(frame.locator('#write .CodeMirror').first()).toBeVisible();
      await frame
        .locator('#write .CodeMirror')
        .first()
        .evaluate((element, multiple) => {
          const cm = Reflect.get(element, 'CodeMirror') as CodeMirror | undefined;
          if (!cm) throw new Error('Missing fenced CodeMirror');
          cm.focus();
          cm.setSelections(
            multiple
              ? [
                  { anchor: { line: 0, ch: 2 }, head: { line: 0, ch: 0 } },
                  { anchor: { line: 0, ch: 12 }, head: { line: 0, ch: 7 } },
                ]
              : [{ anchor: { line: 0, ch: 7 }, head: { line: 0, ch: 2 } }],
            multiple ? 1 : 0,
          );
        }, mode === 'code-multiple');
    } else {
      await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.editors[0]?.focus());
      await frame.locator('#write').evaluate((area, reversed) => {
        const paragraph = [...area.querySelectorAll('p')].find(
          (item) => item.textContent === 'After',
        );
        const text = paragraph
          ? document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT).nextNode()
          : null;
        if (!text) throw new Error('Missing target paragraph');
        const selection = window.getSelection();
        if (!selection) throw new Error('Missing native selection');
        selection.setBaseAndExtent(text, reversed ? 5 : 2, text, reversed ? 1 : 2);
      }, mode === 'reverse-selection');
    }
    if (process.env.RECOVERY_IMAGE_REFRESH_FALLBACK === '1') {
      await frame.locator('#write').evaluate(() => {
        const selection = (window as unknown as NativeWindow).editor.selection;
        const original = selection.buildUndo;
        selection.buildUndo = function () {
          const result = original.call(this);
          if (result && typeof result === 'object')
            Object.defineProperty(result, '__testNonJSON', { value: true, configurable: true });
          return result;
        };
      });
    }
    const capture = () =>
      frame.locator('#write').evaluate((area) => {
        const native = (window as unknown as NativeWindow).editor;
        const selection = window.getSelection();
        const code = area.querySelector('.CodeMirror');
        const cm = code ? (Reflect.get(code, 'CodeMirror') as CodeMirror | undefined) : undefined;
        return {
          bookmark: JSON.stringify(native.selection.buildUndo()),
          sourceMode: native.sourceView.inSourceMode,
          text: selection?.toString(),
          anchor: selection?.anchorOffset,
          head: selection?.focusOffset,
          codeSelections: JSON.stringify(cm?.listSelections()),
          sourceSelections: JSON.stringify(native.sourceView.cm?.listSelections()),
          index: native.undo.index,
          history: native.undo.commandStack.length,
        };
      });
    const before = await capture();
    await page.evaluate(() =>
      (window as ImageTestWindow).imageHostFixture.releaseResolves('refresh-doc'),
    );
    await expectDecodedImage(page);
    await expect
      .poll(() =>
        frame
          .locator('#write img')
          .evaluateAll(
            (images) =>
              images.filter(
                (image) =>
                  (image as HTMLImageElement).naturalWidth > 0 &&
                  (image as HTMLImageElement).src.includes('__image_fixture__'),
              ).length,
          ),
      )
      .toBe(4);
    await frame
      .locator('#write')
      .evaluate(
        () =>
          new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          ),
      );
    expect(await capture()).toEqual(before);
    expect(await imageSource(page)).toBe(source);
    if (mode.startsWith('source-'))
      await page.evaluate(() =>
        (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'toggleSource' }),
      );
    await focusEnd(page);
    await page.keyboard.type('X');
    await expect.poll(() => imageSource(page)).toBe(`${source}X`);
    await imageCommand(page, 'undo');
    expect(await imageSource(page)).toBe(source);
    await imageCommand(page, 'redo');
    expect(await imageSource(page)).toBe(`${source}X`);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors)).toEqual(
      [],
    );
  });
}
