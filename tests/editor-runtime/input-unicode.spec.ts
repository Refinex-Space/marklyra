import { readFileSync } from 'node:fs';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';
import type {
  LegacyEditor,
  LegacyGlobals,
} from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import {
  advancedErrors,
  advancedFrame,
  advancedHistory,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';
import { settleMarkerClick, settleMarkerClickTasks } from './marker-selection.helpers.js';

const vectors: unknown = JSON.parse(
  readFileSync(new URL('../editor-compatibility/input-vectors.json', import.meta.url), 'utf8'),
);
if (!vectors || typeof vectors !== 'object' || !Array.isArray(Reflect.get(vectors, 'unicode')))
  throw Error('Invalid input vectors');
const samples = (Reflect.get(vectors, 'unicode') as unknown[]).map((value) => {
  if (!value || typeof value !== 'object' || typeof Reflect.get(value, 'text') !== 'string')
    throw Error('Invalid Unicode sample');
  return Reflect.get(value, 'text') as string;
});
const payload = samples.join(' ');
const contexts = [
  { id: 'paragraph', source: '\ufeffAlpha MARK Omega\r\n\r\nTail  \n' },
  { id: 'strong-boundary', source: '\ufeffAlpha **MARK** Omega\r\n\r\nTail  \n' },
  { id: 'link-boundary', source: '\ufeffAlpha [MARK](target.md) Omega\r\n\r\nTail  \n' },
  { id: 'list', source: '\ufeff- MARK\r\n- Keep\n\nTail  \r\n' },
  {
    id: 'table-cell',
    source: '\ufeff| A | B |\r\n| :--- | ---: |\n| MARK | untouched |\r\n\r\nTail  \n',
  },
  { id: 'code', source: '\ufeff```text\r\nMARK\n```\r\n\r\nTail  \n' },
  { id: 'source', source: '\ufeffAlpha MARK Omega\r\n\r\nTail  \n' },
] as const;
for (const context of contexts)
  test(`direct Unicode replacement and exact history in ${context.id} (not system IME)`, async ({
    page,
  }, info) => {
    await mountAdvanced(page, context.source);
    const frame = advancedFrame(page);
    if (context.id === 'paragraph' || context.id.endsWith('-boundary'))
      await settleMarkerClick(page);
    if (context.id === 'source')
      await page.evaluate(() =>
        (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor.execute({
          type: 'toggleSource',
        }),
      );
    if (context.id.endsWith('-boundary')) {
      // A DOM range alone does not establish the native editor's formatting
      // context. Select the actual word with a trusted user gesture, then
      // observe its pending marker callbacks before inserting Unicode text.
      await frame
        .locator(context.id === 'strong-boundary' ? '#write strong' : '#write a')
        .first()
        .dblclick();
      await settleMarkerClickTasks(page);
    } else if (context.id === 'source' || context.id === 'code') {
      const selector =
        context.id === 'source'
          ? '#typora-source .CodeMirror'
          : '#write [mdtype="fences"] .CodeMirror';
      await frame.locator(selector).evaluate((wrapper) => {
        const cm = Reflect.get(wrapper, 'CodeMirror') as NonNullable<
            LegacyEditor['sourceView']['cm']
          >,
          value = cm.getValue(),
          at = value.indexOf('MARK');
        if (at < 0) throw Error('Missing actual CM marker');
        const position = (offset: number) => {
          const before = value.slice(0, offset).split('\n');
          return { line: before.length - 1, ch: before.at(-1)?.length ?? 0 };
        };
        cm.focus();
        cm.setSelections([{ anchor: position(at), head: position(at + 4) }]);
      });
    } else
      await frame.locator('#write').evaluate((area) => {
        (area as HTMLElement).focus();
        const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
        let found: Node | null = null;
        for (let node = walker.nextNode(); node; node = walker.nextNode())
          if (node.textContent?.includes('MARK')) {
            found = node;
            break;
          }
        if (!found) throw Error('Missing rendered marker');
        const at = found.textContent?.indexOf('MARK') ?? -1;
        getSelection()?.setBaseAndExtent(found, at, found, at + 4);
      });
    const before = await frame.locator('body').evaluate(() => {
      const editor = (window as unknown as LegacyGlobals).editor;
      return {
        bookmark: editor?.selection.buildUndo(),
        sourceMode: editor?.sourceView.inSourceMode,
      };
    });
    const readSelection = () =>
      frame.locator('body').evaluate((_, id) => {
        const selector =
          id === 'source'
            ? '#typora-source .CodeMirror'
            : id === 'code'
              ? '#write [mdtype="fences"] .CodeMirror'
              : null;
        if (selector) {
          const wrapper = document.querySelector(selector);
          const cm =
            wrapper &&
            (Reflect.get(wrapper, 'CodeMirror') as NonNullable<
              LegacyEditor['sourceView']['cm']
            > | null);
          if (!cm) throw Error('Missing current CM');
          return { text: cm.getSelection(), bookmark: cm.listSelections() };
        }
        return {
          text: getSelection()?.toString() ?? '',
          bookmark: (window as unknown as LegacyGlobals).editor?.selection.buildUndo(),
        };
      }, context.id);
    expect((await readSelection()).text).toBe('MARK');
    await page.keyboard.insertText(payload);
    const expected = context.source.replace('MARK', payload);
    await expect.poll(() => advancedSource(page)).toBe(expected);
    const editedSelection = await readSelection();
    expect(editedSelection.text).toBe('');
    await advancedHistory(page, 'undo');
    await expect.poll(() => advancedSource(page)).toBe(context.source);
    expect((await readSelection()).text).toBe('MARK');
    await advancedHistory(page, 'redo');
    await expect.poll(() => advancedSource(page)).toBe(expected);
    expect(await readSelection()).toEqual(editedSelection);
    if (context.id === 'source') {
      await page.evaluate(() =>
        (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor.execute({
          type: 'toggleSource',
        }),
      );
      expect(await advancedSource(page)).toBe(expected);
    }
    const continued = context.id.endsWith('-boundary')
      ? context.source.replace('MARK', `${payload}!`)
      : undefined;
    if (continued !== undefined) {
      await page.keyboard.insertText('!');
      await expect.poll(() => advancedSource(page)).toBe(continued);
    }
    await info.attach('Unicode-direct-text', {
      body: JSON.stringify({
        context: context.id,
        classification: 'direct-text; no system candidate asserted',
        before,
        editedSelection,
        payload,
        payloadUTF16: payload.length,
        source: context.source,
        edited: expected,
        ...(continued === undefined ? {} : { continued }),
        roundtrip: true,
      }),
      contentType: 'application/json',
    });
    expect(await advancedErrors(page)).toEqual([]);
  });
