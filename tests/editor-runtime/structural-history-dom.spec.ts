import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { build } from 'vite';
import type { LegacyGlobals } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import {
  createImageEditor,
  type ImageTestWindow,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';
import { selectStructure } from './structural-commands.helpers.js';

type Oracle = typeof import('../../packages/editor-runtime/src/runtime/structural-history-dom.js') &
  typeof import('../../packages/editor-runtime/src/runtime/policy-serialization.js') &
  typeof import('../../packages/editor-runtime/src/runtime/policy-options.js');
let bundle = '';
test.beforeAll(async () => {
  const dir = fileURLToPath(new URL('../../packages/editor-runtime/src/runtime/', import.meta.url));
  const entry = dir + 'structural-history-dom.ts';
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [
      {
        name: 'history-dom-oracle',
        transform(code, id) {
          if (id === entry)
            return (
              code +
              '\n' +
              ['policy-serialization', 'policy-options']
                .map((name) => `export * from ${JSON.stringify(dir + name + '.ts')};`)
                .join('\n')
            );
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: { entry, name: 'MarkLyraHistoryDOMOracle', formats: ['iife'] },
    },
  });
  if (!Array.isArray(result)) throw Error('Missing in-memory oracle');
  const chunk = result[0]?.output.find((value) => value.type === 'chunk');
  if (chunk?.type !== 'chunk') throw Error('Missing oracle chunk');
  bundle = chunk.code;
});
const source = '\uFEFF009. ALPHA\r\n010. BETA\n011. GAMMA\r\n\r\nTAIL  \r\n';
const expected = source.replace('010. BETA\n', '010. BETA\n11. 1\n');
async function command(page: import('@playwright/test').Page, type: 'undo' | 'redo') {
  await page.evaluate(
    (type) => (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type }),
    type,
  );
}
test.beforeEach(async ({ page }) => {
  const path = process.env.STRUCTURAL_HISTORY_BASELINE_FRAME;
  if (path)
    await page.route('http://127.0.0.1:4174/frame-host.js', async (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(path) }),
    );
  await setupImageHost(page);
  await createImageEditor(page, { source, context: 'structural-redo-dom' });
  const frame = imageFrame(page);
  await selectStructure(frame, 'BETA');
  await page.keyboard.press('Enter');
  await page.keyboard.press('1');
  expect(await imageSource(page)).toBe(expected);
  await command(page, 'undo');
  await command(page, 'undo');
  expect(await imageSource(page)).toBe(source);
});

test('full Enter Undo/Redo preserves one DOM item per native model identity and the next real key', async ({
  page,
}) => {
  const frame = imageFrame(page);
  for (let cycle = 0; cycle < 3; cycle++) {
    await command(page, 'redo');
    expect(await frame.locator('#write > ol > li').count()).toBe(4);
    await command(page, 'redo');
    expect(await imageSource(page)).toBe(expected);
    const view = await frame.locator('#write').evaluate((area) => ({
      ids: [...area.querySelectorAll('[cid]')].map((el) => el.getAttribute('cid')),
      paragraphs: [...area.querySelectorAll('li > p[cid]')].map((el) => el.textContent),
    }));
    expect(new Set(view.ids).size).toBe(view.ids.length);
    expect(view.paragraphs).toEqual(['ALPHA', 'BETA', '1', 'GAMMA']);
    await command(page, 'undo');
    await command(page, 'undo');
    expect(await imageSource(page)).toBe(source);
  }
  await command(page, 'redo');
  await command(page, 'redo');
  await page.keyboard.press('2');
  expect(await imageSource(page)).toBe(expected.replace('11. 1\n', '11. 12\n'));
  expect(await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors)).toEqual(
    [],
  );
});

test('duplicate DOM repair rejects stale history, composition, controls and nonempty copies without changing model/history/selection', async ({
  page,
}) => {
  await command(page, 'redo');
  const frame = imageFrame(page);
  const actualFrame = page.frames().find((f) => f.url().includes('127.0.0.1:4174/index.html'));
  if (!actualFrame) throw Error('Missing original runtime frame');
  await actualFrame.addScriptTag({ content: bundle });
  const result = await frame.locator('#write').evaluate((area) => {
    const runtime = window as unknown as LegacyGlobals & { MarkLyraHistoryDOMOracle: Oracle };
    const editor = runtime.editor;
    if (!editor) throw Error('Missing native model');
    const helper = runtime.MarkLyraHistoryDOMOracle,
      selection = getSelection();
    const paragraph = (
      selection?.anchorNode?.nodeType === 1
        ? (selection.anchorNode as Element)
        : selection?.anchorNode?.parentElement
    )?.closest('p[cid]');
    const keep = paragraph?.parentElement;
    if (!paragraph || !keep?.matches('li[cid]') || !selection?.anchorNode)
      throw Error('Missing active empty item');
    const extra = keep.cloneNode(true) as Element;
    keep.after(extra);
    const entry = editor.undo.commandStack[editor.undo.index];
    if (!entry) throw Error('Missing actual redo entry');
    const canonical = editor.getMarkdown(),
      serialized = helper.serializePolicyModel(
        runtime,
        helper.capturePolicyModel(runtime),
        helper.readMarkdownPolicy(runtime),
      );
    const context = {
      editor,
      canonical,
      blocks: serialized.blocks,
      ending: runtime.File?.useCRLF ? ('\r\n' as const) : ('\n' as const),
    };
    const state = {
      anchor: selection.anchorNode,
      offset: selection.anchorOffset,
      stack: editor.undo.commandStack,
      index: editor.undo.index,
    };
    const stale = helper.repairStructuralHistoryDOM(runtime, context, {
      redo: Reflect.get(entry, 'redo'),
    });
    editor.isIME = true;
    const composing = helper.repairStructuralHistoryDOM(runtime, context, entry);
    editor.isIME = false;
    const p = extra.querySelector('p');
    if (!p) throw Error('Missing duplicate paragraph');
    p.textContent = 'foreign';
    const nonempty = helper.repairStructuralHistoryDOM(runtime, context, entry);
    p.replaceChildren(...[...paragraph.childNodes].map((n) => n.cloneNode(true)));
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const control = helper.repairStructuralHistoryDOM(runtime, context, entry);
    input.remove();
    (area as HTMLElement).focus();
    selection.setBaseAndExtent(state.anchor, state.offset, state.anchor, state.offset);
    const repaired = helper.repairStructuralHistoryDOM(runtime, context, entry);
    return {
      stale,
      composing,
      nonempty,
      control,
      repaired,
      removed: !extra.isConnected,
      unchanged:
        editor.getMarkdown() === canonical &&
        editor.undo.commandStack === state.stack &&
        editor.undo.index === state.index &&
        selection.anchorNode === state.anchor &&
        selection.anchorOffset === state.offset,
    };
  });
  expect(result).toEqual({
    stale: false,
    composing: false,
    nonempty: false,
    control: false,
    repaired: true,
    removed: true,
    unchanged: true,
  });
  expect(await imageSource(page)).toBe(source.replace('010. BETA\n', '010. BETA\n11. \n'));
  expect(await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors)).toEqual(
    [],
  );
});
