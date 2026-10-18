import { readFile } from 'node:fs/promises';
import { expect, type FrameLocator, type Page, test } from '@playwright/test';
import type { LegacyGlobals } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import { structuralKeyboardFixtures } from '../fixtures/structural-keyboard-fixtures.js';
import {
  createImageEditor,
  type ImageTestWindow,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';
import { selectStructure, structuralSemantics } from './structural-commands.helpers.js';

test.beforeEach(async ({ page }) => {
  const baseline = process.env.STRUCTURAL_KEYBOARD_BASELINE_FRAME;
  if (baseline) {
    const bytes = await readFile(baseline);
    await page.route('http://127.0.0.1:4174/frame-host.js', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: bytes }),
    );
  }
});

async function execute(page: Page, type: 'undo' | 'redo' | 'toggleSource') {
  await page.evaluate(
    (type) => (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type }),
    type,
  );
}
async function selectPoint(frame: FrameLocator, text: string, offset: number) {
  await frame.locator('#write').evaluate(
    (area, selection) => {
      const paragraph = [...area.querySelectorAll('p[cid]')].find(
        (p) => p.textContent === selection.text,
      );
      if (!paragraph) throw Error('Missing authored multiline paragraph');
      (area as HTMLElement).focus();
      if (selection.offset === 0 && paragraph.textContent === '') {
        const range = document.createRange();
        range.setStart(paragraph, 0);
        range.collapse(true);
        const native = getSelection();
        native?.removeAllRanges();
        native?.addRange(range);
        return;
      }
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let remaining = selection.offset;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const length = node.textContent?.length ?? 0;
        if (remaining <= length) {
          const range = document.createRange();
          range.setStart(node, remaining);
          range.collapse(true);
          const native = getSelection();
          native?.removeAllRanges();
          native?.addRange(range);
          return;
        }
        remaining -= length;
      }
      throw Error('Missing authored multiline offset');
    },
    { text, offset },
  );
}
async function selected(frame: FrameLocator) {
  return frame.locator('#write').evaluate((area) => {
    const selection = area.ownerDocument.getSelection();
    const point = (node: Node | null, offset: number) => {
      const paragraph = (node?.nodeType === 1 ? (node as Element) : node?.parentElement)?.closest(
        'p[cid]',
      );
      if (!node || !paragraph) return null;
      const range = area.ownerDocument.createRange();
      range.selectNodeContents(paragraph);
      range.setEnd(node, offset);
      return {
        text: paragraph.textContent,
        offset: range.cloneContents().textContent?.length ?? 0,
      };
    };
    return {
      anchor: point(selection?.anchorNode ?? null, selection?.anchorOffset ?? 0),
      focus: point(selection?.focusNode ?? null, selection?.focusOffset ?? 0),
      collapsed: selection?.isCollapsed,
    };
  });
}

for (const partial of [false, true])
  for (const backward of [false, true])
    for (const key of ['Backspace', 'Delete'])
      test(`multi-item ${partial ? 'partial' : 'whole'} ${key} ${backward ? 'backward' : 'forward'} preserves source, directed history and item ownership`, async ({
        page,
      }) => {
        await setupImageHost(page);
        const source = '\uFEFF009. Alpha\r\n010. Beta\n011. Gamma\r\n\r\nTail  \r\n';
        const expected = partial
          ? '\uFEFF009. Alpha\r\n010. Bemma\r\n\r\nTail  \r\n'
          : '\uFEFF009. Alpha\r\n010. \r\n\r\nTail  \r\n';
        await createImageEditor(page, { source, context: 'multi-item-direction' });
        const frame = imageFrame(page);
        await selectStructure(frame, 'Beta', 'Gamma', backward);
        if (partial)
          await frame.locator('#write').evaluate((area, backward) => {
            const find = (text: string) => {
              const paragraph = [...area.querySelectorAll('p[cid]')].find(
                (p) => p.textContent === text,
              );
              return (
                paragraph && document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT).nextNode()
              );
            };
            const a = find('Beta'),
              b = find('Gamma');
            if (!a || !b) throw Error('Missing authored partial range');
            getSelection()?.setBaseAndExtent(backward ? b : a, 2, backward ? a : b, 2);
          }, backward);
        const before = await selected(frame);
        await page.keyboard.press(key);
        expect(await imageSource(page)).toBe(expected);
        const meaning = await structuralSemantics(frame);
        await execute(page, 'undo');
        expect(await imageSource(page)).toBe(source);
        expect(await selected(frame)).toEqual(before);
        await execute(page, 'redo');
        expect(await imageSource(page)).toBe(expected);
        const second = await createImageEditor(page, {
          source: expected,
          context: 'multi-item-reparse',
        });
        expect(await structuralSemantics(imageFrame(page, second))).toEqual(meaning);
        expect(
          await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors),
        ).toEqual([]);
      });

for (const fixture of structuralKeyboardFixtures)
  test(`${fixture.id}: raw source, original canonical/selection, history and independent reparse`, async ({
    page,
  }) => {
    await setupImageHost(page);
    await createImageEditor(page, { source: fixture.source, context: fixture.id });
    const frame = imageFrame(page),
      channel = await frame.locator('body').evaluate(() => location.href);
    if ('paragraph' in fixture) await selectPoint(frame, fixture.paragraph, fixture.offset);
    else await selectStructure(frame, 'Beta');
    await page.keyboard.press(fixture.key);
    const typed = 'typedText' in fixture ? fixture.typedText : 'Next';
    if (typed) await page.keyboard.type(typed);
    expect(await imageSource(page)).toBe(fixture.expected);
    expect(
      await frame.locator('#write').evaluate(() => {
        const editor = (window as unknown as LegacyGlobals).editor;
        if (!editor) throw Error('Missing original runtime');
        return editor.getMarkdown().replaceAll('\r\n', '\n');
      }),
    ).toBe(fixture.originalCanonicalLf);
    const end = { text: fixture.afterText, offset: fixture.afterOffset };
    expect(await selected(frame)).toEqual({ anchor: end, focus: end, collapsed: true });
    await execute(page, 'undo');
    expect(await imageSource(page)).toBe(
      'undoExpected' in fixture ? fixture.undoExpected : fixture.expected.replace('Next', 'Nex'),
    );
    const undone = { text: fixture.undoText, offset: fixture.undoOffset };
    expect(await selected(frame)).toEqual({ anchor: undone, focus: undone, collapsed: true });
    await execute(page, 'redo');
    expect(await imageSource(page)).toBe(fixture.expected);
    expect(await selected(frame)).toEqual({ anchor: end, focus: end, collapsed: true });
    const meaning = await structuralSemantics(frame);
    const second = await createImageEditor(page, {
      source: fixture.expected,
      context: 'structural-independent-reparse',
    });
    expect(await structuralSemantics(imageFrame(page, second))).toEqual(meaning);
    await page.evaluate(
      (index) => (window as ImageTestWindow).imageHostFixture.editors[index]?.destroy(),
      second,
    );
    // The original engine owns grouping. Walk its actual entries rather than
    // pretending that one Undo must remove both Enter and an entire typed word.
    for (let count = 0; count < 12; count++) {
      const canUndo = await frame
        .locator('#write')
        .evaluate(() => (window as unknown as LegacyGlobals).editor?.undo.hasUndo());
      if (!canUndo) break;
      await execute(page, 'undo');
      await imageSource(page);
    }
    expect(await imageSource(page)).toBe(fixture.source);
    expect(await frame.locator('body').evaluate(() => location.href)).toBe(channel);
    expect(await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors)).toEqual(
      [],
    );
  });

test('marker merge history survives live policy changes and Source round trips without changing raw indentation', async ({
  page,
}) => {
  await setupImageHost(page);
  const source =
    '\uFEFF009. Alpha\r\n010. Beta\n011. Gamma\r\n\r\n- Outer\r\n  - Inner\n\r\nTail  \r\n';
  const merged = source.replace('Alpha\r\n010. Beta\n', 'Alpha\r\n\r\n   Beta\n\n');
  await createImageEditor(page, { source, context: 'marker-policy-sequence' });
  const frame = imageFrame(page),
    channel = await frame.locator('body').evaluate(() => location.href);
  await selectPoint(frame, 'Beta', 0);
  await page.keyboard.press('Backspace');
  expect(await imageSource(page)).toBe(merged);
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.setMarkdownPreferences({
      indentSize: 3,
    }),
  );
  expect(await imageSource(page)).toBe(merged);
  await execute(page, 'undo');
  expect(await imageSource(page)).toBe(source);
  await execute(page, 'redo');
  expect(await imageSource(page)).toBe(merged);
  await execute(page, 'toggleSource');
  expect(await imageSource(page)).toBe(merged);
  await execute(page, 'toggleSource');
  expect(await imageSource(page)).toBe(merged);
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.setMarkdownPreferences({
      indentSize: 2,
    }),
  );
  expect(await imageSource(page)).toBe(merged);
  for (let count = 0; count < 16 && (await imageSource(page)) !== source; count++) {
    await execute(page, 'undo');
    await imageSource(page);
  }
  expect(await imageSource(page)).toBe(source);
  expect(await frame.locator('body').evaluate(() => location.href)).toBe(channel);
  expect(await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors)).toEqual(
    [],
  );
});

for (const depth of [1, 2])
  test(`quote depth ${depth} exits one ancestor per Enter with source and history intact`, async ({
    page,
  }) => {
    await setupImageHost(page);
    const prefix = '> '.repeat(depth),
      source = `\uFEFF${prefix}Alpha\r\n\r\nTail  \r\n`;
    await createImageEditor(page, { source, context: 'quote-exit' });
    const frame = imageFrame(page);
    await selectPoint(frame, 'Alpha', 5);
    for (let i = 0; i <= depth; i++) await page.keyboard.press('Enter');
    const expected = `\uFEFF${prefix}Alpha\r\n\r\n\r\n\r\nTail  \r\n`;
    expect(await imageSource(page)).toBe(expected);
    const point = { text: '', offset: 0 };
    expect(await selected(frame)).toEqual({ anchor: point, focus: point, collapsed: true });
    await execute(page, 'undo');
    expect(await imageSource(page)).not.toBe(expected);
    await execute(page, 'redo');
    expect(await imageSource(page)).toBe(expected);
    const meaning = await structuralSemantics(frame);
    const second = await createImageEditor(page, {
      source: expected,
      context: 'quote-exit-reparse',
    });
    expect(await structuralSemantics(imageFrame(page, second))).toEqual(meaning);
    for (let i = 0; i <= depth; i++) {
      await execute(page, 'undo');
      await imageSource(page);
    }
    expect(await imageSource(page)).toBe(source);
    expect(await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors)).toEqual(
      [],
    );
  });

test('padded ordered markers retain exact history through physical Tab and Shift+Tab', async ({
  page,
}) => {
  await setupImageHost(page);
  const source = '\uFEFF009. ALPHA\r\n010. BETA\n011. GAMMA\r\n\r\nTAIL  \r\n';
  const nested = source.replace('010. BETA\n', '   1. BETA\n');
  const outdented = source.replace('010. BETA\n', '10. BETA\n');
  await createImageEditor(page, { source, context: 'padded-indent-history' });
  const frame = imageFrame(page);
  await selectStructure(frame, 'BETA');
  await page.keyboard.press('Tab');
  expect(await imageSource(page)).toBe(nested);
  await page.keyboard.press('Shift+Tab');
  expect(await imageSource(page)).toBe(outdented);
  for (let cycle = 0; cycle < 3; cycle++) {
    await execute(page, 'undo');
    expect(await imageSource(page)).toBe(nested);
    await execute(page, 'undo');
    expect(await imageSource(page)).toBe(source);
    await execute(page, 'redo');
    expect(await imageSource(page)).toBe(nested);
    await execute(page, 'redo');
    expect(await imageSource(page)).toBe(outdented);
  }
  await execute(page, 'undo');
  await execute(page, 'undo');
  expect(await imageSource(page)).toBe(source);
  expect(await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors)).toEqual(
    [],
  );
});
