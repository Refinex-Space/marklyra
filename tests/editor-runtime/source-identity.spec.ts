import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';

type Host = Window &
  typeof globalThis & {
    marklyraEditor: MarkLyraEditor;
    sourceErrors: { message: string; code: unknown }[];
  };
const raw = 'Start\r\n\r\nsame\r\n\r\nsame\n\nEnd\n';
const remainingFirst = 'Start\r\n\r\nsame\r\n\r\nEnd\n';
const remainingSecond = 'Start\r\n\r\nsame\n\nEnd\n';
async function start(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const editor = (window as Host).marklyraEditor;
    await editor.ready;
    const Constructor = editor.constructor as typeof MarkLyraEditor;
    editor.destroy();
    const host = window as Host;
    host.sourceErrors = [];
    const mount = document.querySelector<HTMLElement>('#editor');
    if (!mount) throw new Error('Missing example mount');
    host.marklyraEditor = new Constructor(mount, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      onError: (error) =>
        host.sourceErrors.push({
          message: error.message,
          code: Reflect.get(error, 'code') ?? null,
        }),
    });
    await host.marklyraEditor.ready;
  }, raw);
}
const takeErrors = (page: Page) => page.evaluate(() => (window as Host).sourceErrors.splice(0));
test.afterEach(async ({ page }) => {
  expect(await takeErrors(page)).toEqual([]);
});
const flush = (page: Page) => page.evaluate(() => (window as Host).marklyraEditor.flush());
const command = (page: Page, type: 'undo' | 'redo' | 'toggleSource') =>
  page.evaluate((type) => (window as Host).marklyraEditor.execute({ type }), type);
async function deleteParagraph(page: Page, index: 0 | 1, sourceMode: boolean) {
  const frame = page.frames().find((frame) => frame.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw new Error('Missing isolated runtime');
  if (sourceMode) {
    // Use real keyboard selection. CodeMirror renders CRLF as one keyboard step.
    await frame.locator('.CodeMirror textarea').focus();
    await frame.evaluate((index) => {
      const runtime = Reflect.get(window, 'editor') as {
        sourceView: { cm: { setCursor(pos: { line: number; ch: number }): void; focus(): void } };
      };
      runtime.sourceView.cm.setCursor({ line: index === 0 ? 2 : 4, ch: 0 });
      runtime.sourceView.cm.focus();
    }, index);
    await page.keyboard.down('Shift');
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    expect(
      await frame.evaluate(() => {
        const editor = Reflect.get(window, 'editor') as {
          sourceView: { cm: { getSelection(): string } };
        };
        return editor.sourceView.cm.getSelection();
      }),
    ).toBe('same\r\n\r\n');
  } else {
    await frame.locator('#write').evaluate((root, index) => {
      const blocks = root.querySelectorAll(':scope > p');
      const start = blocks[index + 1]?.firstChild,
        end = blocks[index + 2]?.firstChild;
      if (!start || !end) throw new Error('Missing traced paragraph');
      (root as HTMLElement).focus();
      const range = document.createRange();
      range.setStart(start, 0);
      range.setEnd(end, 0);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }, index);
    expect(await frame.evaluate(() => window.getSelection()?.toString())).toBe('same\n\n');
  }
  await page.keyboard.press('Backspace');
}
for (const sourceMode of [false, true]) {
  for (const index of [0, 1] as const) {
    test(`${sourceMode ? 'source' : 'WYSIWYG'} deletion ${index + 1} preserves surviving repeated block bytes and history`, async ({
      page,
    }) => {
      await start(page);
      if (sourceMode) await command(page, 'toggleSource');
      await deleteParagraph(page, index, sourceMode);
      const expected = index === 0 ? remainingSecond : remainingFirst;
      expect(await flush(page)).toBe(expected);
      await command(page, 'undo');
      expect(await flush(page)).toBe(raw);
      await command(page, 'redo');
      expect(await flush(page)).toBe(expected);
      await command(page, 'undo');
      expect(await flush(page)).toBe(raw);
      await deleteParagraph(page, index === 0 ? 1 : 0, sourceMode);
      expect(await flush(page)).toBe(index === 0 ? remainingFirst : remainingSecond);
      await command(page, 'undo');
      expect(await flush(page)).toBe(raw);
    });
  }
}

test('proven same-block soft-line deletion preserves raw and remains consistent with source-mode editing', async ({
  page,
}) => {
  await start(page);
  const source = 'same\r\nsame\nsame';
  await page.evaluate((source) => (window as Host).marklyraEditor.load(source), source);
  const frame = page.frames().find((frame) => frame.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw new Error('Missing runtime');
  await frame.locator('#write').evaluate((root) => {
    const parts = root.querySelectorAll('.md-plain');
    const first = parts[0]?.firstChild,
      second = parts[1]?.firstChild;
    if (!first || !second) throw new Error('Missing soft-line source nodes');
    (root as HTMLElement).focus();
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(second, 0);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await page.keyboard.press('Backspace');
  expect(await flush(page)).toBe('same\nsame');
  await command(page, 'undo');
  expect(await flush(page)).toBe(source);
  await command(page, 'toggleSource');
  await frame.evaluate(() => {
    const editor = Reflect.get(window, 'editor') as {
      sourceView: { cm: { focus(): void; setCursor(pos: { line: number; ch: number }): void } };
    };
    editor.sourceView.cm.setCursor({ line: 0, ch: 0 });
    editor.sourceView.cm.focus();
  });
  await page.keyboard.down('Shift');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Backspace');
  expect(await flush(page)).toBe('same\nsame');
  await command(page, 'undo');
  expect(await flush(page)).toBe(source);
});

for (const mode of [false, true])
  test(`${mode ? 'source' : 'WYSIWYG'} failed document load restores repeated-block history checkpoint identities`, async ({
    page,
  }) => {
    await start(page);
    if (mode) await command(page, 'toggleSource');
    await deleteParagraph(page, 0, mode);
    expect(await flush(page)).toBe(remainingSecond);
    await expect(
      page.evaluate(() => (window as Host).marklyraEditor.load('Unsupported \uE027 marker\n')),
    ).rejects.toThrow();
    expect(await flush(page)).toBe(remainingSecond);
    await command(page, 'undo');
    expect(await flush(page)).toBe(raw);
    await command(page, 'redo');
    expect(await flush(page)).toBe(remainingSecond);
    const errors = await takeErrors(page);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors, JSON.stringify(errors)).toEqual(
      errors.map(() => expect.objectContaining({ code: 'UNSUPPORTED_NORMALIZATION' })),
    );
  });

for (const sourceMode of [false, true])
  test(`${sourceMode ? 'source' : 'WYSIWYG'} grouped typing and repeated deletion do not become false history transitions`, async ({
    page,
  }) => {
    await start(page);
    await page.evaluate(() => (window as Host).marklyraEditor.load('alpha\r\n\r\nkeep\n'));
    if (sourceMode) await command(page, 'toggleSource');
    const frame = page.frames().find((frame) => frame.url().startsWith('http://127.0.0.1:4174/'));
    if (!frame) throw new Error('Missing runtime');
    if (sourceMode)
      await frame.evaluate(() => {
        const editor = Reflect.get(window, 'editor') as {
          sourceView: { cm: { focus(): void; setCursor(pos: { line: number; ch: number }): void } };
        };
        editor.sourceView.cm.setCursor({ line: 0, ch: 5 });
        editor.sourceView.cm.focus();
      });
    else
      await frame
        .locator('#write > p')
        .first()
        .evaluate((block) => {
          const node = block.firstChild?.firstChild ?? block.firstChild;
          if (!node) throw new Error('Missing text');
          (block as HTMLElement).focus();
          const range = document.createRange();
          range.setStart(node, node.textContent?.length ?? 0);
          range.collapse(true);
          window.getSelection()?.removeAllRanges();
          window.getSelection()?.addRange(range);
        });
    for (const char of ['a', 'b', 'c']) {
      await page.keyboard.type(char);
      await flush(page);
    }
    expect(await flush(page)).toBe('alphaabc\r\n\r\nkeep\n');
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Backspace');
      await flush(page);
    }
    expect(await flush(page)).toBe('alpha\r\n\r\nkeep\n');
    await command(page, 'undo');
    expect((await flush(page)).includes('alpha')).toBe(true);
  });

test('CRLF WYSIWYG Enter and multiline paste preserve exact protocol text through mode switches and history', async ({
  page,
}) => {
  await start(page);
  const initial = 'Alpha\r\n\r\nEnd\r\n';
  await page.evaluate((source) => (window as Host).marklyraEditor.load(source), initial);
  const child = page.frameLocator('.marklyra-editor-frame');
  await child
    .locator('#write > p')
    .first()
    .evaluate((block) => {
      (block as HTMLElement).focus();
      const range = document.createRange();
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let leaf: Node | null = null;
      let next = walker.nextNode();
      while (next) {
        leaf = next;
        next = walker.nextNode();
      }
      if (!leaf) throw new Error('Missing text leaf');
      range.setStart(leaf, leaf.textContent?.length ?? 0);
      range.collapse(true);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
  await page.keyboard.press('Enter');
  await page.keyboard.type('Beta');
  expect(await flush(page)).toBe('Alpha\r\n\r\nBeta\r\n\r\nEnd\r\n');
  await page.evaluate(() =>
    (window as Host).marklyraEditor.execute({
      type: 'insertText',
      text: 'Gamma\r\n\r\nDelta',
    }),
  );
  const pasted = await flush(page);
  expect(pasted).toBe('Alpha\r\n\r\nBetaGamma\r\n\r\nDelta\r\n\r\nEnd\r\n');
  await command(page, 'undo');
  expect(await flush(page)).toBe('Alpha\r\n\r\nBeta\r\n\r\nEnd\r\n');
  await command(page, 'redo');
  expect(await flush(page)).toBe(pasted);
  await command(page, 'toggleSource');
  expect(await flush(page)).toBe(pasted);
  await command(page, 'toggleSource');
  expect(await flush(page)).toBe(pasted);
});
