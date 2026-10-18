import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Frame, type Page, test } from '@playwright/test';
import type { CursorBookmark } from '../../packages/editor-runtime/src/protocol.js';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type Host = Window & { marklyraEditor: MarkLyraEditor };
interface Probe {
  active: boolean;
  setRanges: number;
  parses: number;
  commands: number;
  reads: (CursorBookmark | null)[];
}
type Child = Window & { editor: LegacyEditor; fixtureExpand: Probe };
interface Brush {
  queue: unknown[];
  addToQueue(id: string, inlineOnly: boolean): void;
  brushQueue(): Promise<unknown>;
  expand(): unknown;
}
async function mount(page: Page, source: string): Promise<Frame> {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as unknown as Host;
    await host.marklyraEditor.ready;
    await host.marklyraEditor.load(source);
    const control = document.createElement('input');
    control.id = 'host-control';
    control.value = 'Search draft';
    document.querySelector('header')?.append(control);
  }, source);
  const frame = page.frames().find((entry) => entry.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing original runtime');
  await frame.waitForFunction(
    () => ((window as unknown as Child).editor.brush as unknown as Brush).queue.length === 0,
  );
  await frame.evaluate(() => {
    const child = window as unknown as Child,
      editor = child.editor,
      brush = editor.brush as unknown as Brush,
      probe: Probe = { active: false, setRanges: 0, parses: 0, commands: 0, reads: [] };
    child.fixtureExpand = probe;
    const expand = brush.expand;
    brush.expand = function () {
      probe.active = true;
      try {
        return Reflect.apply(expand, this, arguments);
      } finally {
        probe.active = false;
      }
    };
    for (const [owner, name, key] of [
      [editor.selection, 'setRange', 'setRanges'],
      [editor, 'simpleParse', 'parses'],
      [editor.undo, 'exeCommand', 'commands'],
    ] as const) {
      const original = Reflect.get(owner, name) as (...args: unknown[]) => unknown;
      Reflect.set(owner, name, function (this: unknown, ...args: unknown[]) {
        if (probe.active) probe[key]++;
        return Reflect.apply(original, this, args);
      });
    }
    const read = editor.selection.buildUndo;
    editor.selection.buildUndo = function () {
      const value = Reflect.apply(read, this, arguments) as CursorBookmark | null;
      if (probe.active) probe.reads.push(value ? JSON.parse(JSON.stringify(value)) : null);
      return value;
    };
  });
  return frame;
}
const flush = (page: Page) =>
  page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
const command = (page: Page, type: 'undo' | 'redo') =>
  page.evaluate((type) => (window as unknown as Host).marklyraEditor.execute({ type }), type);

for (const offset of [0, 4]) {
  test(`original expand direct setRange at strong body ${offset} preserves host ownership`, async ({
    page,
  }, info) => {
    const raw = '**bold** tail',
      frame = await mount(page, raw);
    await frame.locator('#write').click();
    const control = page.locator('#host-control');
    await control.focus();
    await control.evaluate((input) =>
      (input as HTMLInputElement).setSelectionRange(2, 6, 'backward'),
    );
    const before = await frame.evaluate((offset) => {
      const child = window as unknown as Child,
        text = document.querySelector('strong [md-inline="plain"]')?.firstChild;
      if (!text || text.nodeType !== 3) throw Error('Missing body text');
      // Establish the unexpanded decoration fixture before the operation. The
      // assertion observes the real original setRange; it never repairs it later.
      document.querySelectorAll('.md-expand').forEach((element) => {
        element.classList.remove('md-expand');
      });
      getSelection()?.setBaseAndExtent(text, offset, text, offset);
      child.fixtureExpand.setRanges = 0;
      const before = child.editor.selection.buildUndo();
      (child.editor.brush as unknown as Brush).expand();
      return before;
    }, offset);
    const after = await frame.evaluate(() => ({
      cursor: (window as unknown as Child).editor.selection.buildUndo(),
      probe: (window as unknown as Child).fixtureExpand,
      html: (window as unknown as Child).editor.writingArea.innerHTML,
    }));
    expect(after.probe.setRanges).toBeGreaterThan(0);
    expect(after.probe.parses).toBe(0);
    expect(after.probe.commands).toBe(0);
    await expect(control).toBeFocused();
    expect(
      await control.evaluate((element) => {
        const input = element as HTMLInputElement;
        return [input.value, input.selectionStart, input.selectionEnd, input.selectionDirection];
      }),
    ).toEqual(['Search draft', 2, 6, 'backward']);
    expect(await flush(page)).toBe(raw);
    expect(after.cursor).toMatchObject({ id: 'n0', start: offset === 0 ? 0 : 8 });
    if (offset === 4 && info.project.name === 'chromium') {
      await info.attach('direct-expand-host-owner', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.focus());
    await page.keyboard.type('Z');
    const expected = offset === 0 ? `Z${raw}` : '**bold**Z tail';
    expect(await flush(page)).toBe(expected);
    await command(page, 'undo');
    expect(await flush(page)).toBe(raw);
    await command(page, 'redo');
    expect(await flush(page)).toBe(expected);
    await info.attach('direct-expand', {
      body: JSON.stringify({ raw, expected, before, after }),
      contentType: 'application/json',
    });
  });
}

for (const wrapper of ['', '**', '*']) {
  test(`inline expansion with ${wrapper || 'plain'} text leaves external selections untouched`, async ({
    page,
  }, info) => {
    const initial = `${wrapper}Alpha\nHeading\nBeta${wrapper}\n\nDelta`,
      frame = await mount(page, initial);
    await frame.locator('#write').click();
    const target = await frame.evaluate(() => {
      const area = (window as unknown as Child).editor.writingArea,
        walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
      let text = walker.nextNode();
      while (text && !text.textContent?.startsWith('Heading')) text = walker.nextNode();
      if (!text) throw Error('Missing Heading text');
      getSelection()?.setBaseAndExtent(text, 0, text, 0);
      const bookmark = (window as unknown as Child).editor.selection.buildUndo();
      if (!bookmark) throw Error('Missing real Heading bookmark');
      return bookmark;
    });
    await page.evaluate(
      (json) =>
        (window as unknown as Host).marklyraEditor.execute({
          type: 'restoreSelection',
          bookmark: JSON.parse(json) as CursorBookmark,
        }),
      JSON.stringify(target),
    );
    await page.keyboard.type('# ');
    // Drive the actual queued parser with its public original entry. No bookmark,
    // model node, parser result or branch condition is replaced by the harness.
    await frame.evaluate(async () => {
      const child = window as unknown as Child,
        paragraph = child.editor.writingArea.querySelector('p'),
        id = paragraph?.getAttribute('cid'),
        brush = child.editor.brush as unknown as Brush;
      if (!id) throw Error('Missing paragraph identity');
      brush.addToQueue(id, false);
      await brush.brushQueue();
    });
    const block = frame.locator('.md-block-like');
    await expect(block).toHaveCount(1);
    const results = await frame.evaluate(() => {
      const child = window as unknown as Child,
        editor = child.editor,
        brush = editor.brush as unknown as Brush,
        tail = [...editor.writingArea.querySelectorAll('[md-inline="plain"]')].find((element) =>
          element.textContent?.includes('Beta'),
        )?.firstChild;
      if (!tail || tail.nodeType !== 3) throw Error('Missing outside-inline tail');
      const records = [];
      for (const [anchor, head] of [
        [1, 1],
        [1, 3],
        [3, 1],
      ] as const) {
        getSelection()?.setBaseAndExtent(tail, anchor, tail, head);
        child.fixtureExpand.reads = [];
        child.fixtureExpand.parses = child.fixtureExpand.commands = 0;
        const before = editor.selection.buildUndo();
        brush.expand();
        records.push({
          anchor,
          head,
          before,
          reads: child.fixtureExpand.reads,
          parses: child.fixtureExpand.parses,
          commands: child.fixtureExpand.commands,
          after: editor.selection.buildUndo(),
        });
      }
      const delta = [...editor.writingArea.querySelectorAll('[md-inline="plain"]')].find(
        (element) => element.textContent === 'Delta',
      )?.firstChild;
      if (!delta || delta.nodeType !== 3) throw Error('Missing cross-cid text');
      const crossRecords = [];
      for (const backward of [false, true]) {
        if (backward) getSelection()?.setBaseAndExtent(delta, 3, tail, 1);
        else getSelection()?.setBaseAndExtent(tail, 1, delta, 3);
        child.fixtureExpand.reads = [];
        child.fixtureExpand.parses = child.fixtureExpand.commands = 0;
        const before = editor.selection.buildUndo();
        brush.expand();
        crossRecords.push({
          backward,
          before,
          after: editor.selection.buildUndo(),
          reads: child.fixtureExpand.reads,
          parses: child.fixtureExpand.parses,
          commands: child.fixtureExpand.commands,
        });
      }
      return {
        records,
        crossRecords,
        startId: tail.parentElement?.closest('[cid]')?.getAttribute('cid'),
        endId: delta.parentElement?.closest('[cid]')?.getAttribute('cid'),
        html: editor.writingArea.innerHTML,
        // Original renderer does not produce cross-cid descendants inside these
        // inline wrappers. Expansion must leave selections outside the target inline block untouched.
        nestedBlocks: editor.writingArea.querySelectorAll('[md-inline] .md-block-like').length,
      };
    });
    expect(results.nestedBlocks).toBe(0);
    for (const record of results.records) {
      expect(record.reads.length).toBeGreaterThan(0);
      expect(record.reads[0]).toMatchObject({ type: 'cursor', id: 'n0' });
      expect(record.reads[0]).not.toHaveProperty('endId');
      expect(record.parses).toBe(0);
      expect(record.commands).toBe(0);
      expect(record.after).toEqual(record.before);
    }
    for (const record of results.crossRecords) {
      expect(results.startId).toBe('n0');
      expect(results.endId).toBeTruthy();
      expect(results.endId).not.toBe(results.startId);
      expect(record.before).toMatchObject({
        type: 'cursor',
        startId: results.startId,
        endId: results.endId,
      });
      expect(record.before).not.toHaveProperty('id');
      expect(record.parses).toBe(0);
      expect(record.commands).toBe(0);
      expect(record.after).toEqual(record.before);
    }
    const saved = await flush(page);
    expect(saved).toBe(initial.replace('Heading', '# Heading'));
    await info.attach('inline-expansion-selection-guards', {
      body: JSON.stringify({ initial, saved, ...results }),
      contentType: 'application/json',
    });
  });
}
