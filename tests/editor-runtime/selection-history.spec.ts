import { writeFile } from 'node:fs/promises';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Frame, type Page, test } from '@playwright/test';
import type {
  LegacyEditor,
  LegacyGlobals,
} from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import {
  createImageEditor,
  dispatchImageTransfer,
  expectDecodedImage,
  type ImageTestWindow,
  setupImageHost,
} from './image-assets.helpers.js';

type Host = Window & { marklyraEditor: MarkLyraEditor; fixtureSelectionErrors: string[] };
type Probe = { pending: Set<number>; scheduled: number; completed: number };
const records = new WeakMap<Page, unknown[]>();
const source = 'Alpha **Bold** tail\r\n\r\nSecond *Middle* end\n\nThird';
async function mount(page: Page, text = source): Promise<Frame> {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (markdown) => {
    const host = window as unknown as Host;
    await host.marklyraEditor.ready;
    const Constructor = host.marklyraEditor.constructor as typeof MarkLyraEditor;
    host.marklyraEditor.destroy();
    const root = document.querySelector<HTMLElement>('#editor');
    if (!root) throw Error('Missing host');
    host.fixtureSelectionErrors = [];
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown,
      onError: (error) => host.fixtureSelectionErrors.push(error.message),
    });
    await host.marklyraEditor.ready;
  }, text);
  const frame = page.frames().find((value) => value.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing runtime');
  return frame;
}
const flush = (page: Page) =>
  page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
const command = (page: Page, type: 'undo' | 'redo' | 'toggleSource') =>
  page.evaluate((type) => (window as unknown as Host).marklyraEditor.execute({ type }), type);
async function select(frame: Frame, anchor: [number, number], head = anchor) {
  // Establish this precise DOM fixture only after the original load callbacks
  // already queued for the old initial caret have actually completed.
  await drain(frame);
  await frame.evaluate(
    ({ anchor, head }) => {
      const area = document.querySelector<HTMLElement>('#write');
      if (!area) throw Error('Missing area');
      area.focus();
      const point = ([block, offset]: [number, number]): [Node, number] => {
        const p = area.querySelectorAll(':scope > p')[block];
        if (!p) throw Error('Missing paragraph');
        const walker = document.createTreeWalker(p, 4);
        let node = walker.nextNode(),
          at = 0;
        while (node) {
          const length = node.textContent?.length ?? 0;
          if (offset >= at && offset <= at + length) return [node, offset - at];
          at += length;
          node = walker.nextNode();
        }
        throw Error('Missing point');
      };
      document.getSelection()?.setBaseAndExtent(...point(anchor), ...point(head));
    },
    { anchor, head },
  );
}
async function snapshot(page: Page, frame: Frame, label: string, rejected = false) {
  const native = await frame.evaluate(() => {
    const editor = (window as unknown as LegacyGlobals).editor;
    if (!editor) throw Error('Missing editor');
    const selection = document.getSelection();
    const point = (node: Node | null, offset: number) => {
      const element = node?.nodeType === 1 ? (node as Element) : node?.parentElement;
      const paragraph = element?.closest<HTMLElement>('#write > p[cid]');
      if (!node || !paragraph) return null;
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      range.setEnd(node, offset);
      return {
        cid: paragraph.getAttribute('cid'),
        sourceOffset: range.cloneContents().textContent?.length ?? 0,
        nodeType: node.nodeType,
        offset,
        parent: element?.tagName,
      };
    };
    const cm = editor.sourceView.cm;
    const pos = (value: { line: number; ch: number }) => ({ line: value.line, ch: value.ch });
    return {
      canonical: editor.getMarkdown(),
      dom: document.querySelector('#write')?.innerHTML,
      blocks: [...editor.writingArea.querySelectorAll<HTMLElement>(':scope > [cid]')].map(
        (element) => ({
          id: element.getAttribute('cid'),
          type: element.getAttribute('mdtype'),
          text: editor.getNode(element.getAttribute('cid') ?? '')?.get('text'),
        }),
      ),
      selection: {
        anchor: point(selection?.anchorNode ?? null, selection?.anchorOffset ?? 0),
        head: point(selection?.focusNode ?? null, selection?.focusOffset ?? 0),
      },
      bookmark: editor.selection.buildUndo(),
      index: editor.undo.index,
      history: editor.undo.commandStack.map((entry) => ({
        undo: Reflect.get(entry, 'undo'),
        redo: entry.redo,
      })),
      cm:
        editor.sourceView.inSourceMode && cm
          ? {
              ranges: cm
                .listSelections()
                .map((range) => ({ anchor: pos(range.anchor), head: pos(range.head) })),
              anchor: pos(cm.getCursor('anchor')),
              head: pos(cm.getCursor('head')),
              generation: cm.doc.history.generation,
              done: cm.doc.history.done.length,
              undone: cm.doc.history.undone.length,
            }
          : null,
    };
  });
  let raw: string;
  if (rejected) {
    try {
      raw = await flush(page);
    } catch (error) {
      raw = String(error);
    }
  } else raw = await flush(page);
  const value = { label, raw, native };
  records.get(page)?.push(value);
  return value;
}
test.beforeEach(async ({ page }) => {
  records.set(page, []);
  await page.addInitScript(() => {
    if (window === window.top) return;
    const probe: Probe = { pending: new Set(), scheduled: 0, completed: 0 };
    Reflect.set(window, 'fixtureSelectionTimers', probe);
    const schedule = window.setTimeout,
      cancel = window.clearTimeout;
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (typeof handler !== 'function' || (delay ?? 0) > 300)
        return schedule(handler, delay, ...args);
      const id = schedule(() => {
        try {
          Reflect.apply(handler, window, args);
        } finally {
          probe.pending.delete(id);
          probe.completed++;
        }
      }, delay);
      probe.pending.add(id);
      probe.scheduled++;
      return id;
    }) as typeof setTimeout;
    window.clearTimeout = ((id: number | undefined) => {
      if (id !== undefined) probe.pending.delete(id);
      cancel(id);
    }) as typeof clearTimeout;
  });
});
async function drain(frame: Frame) {
  const pending = await frame.evaluate(() => [
    ...(Reflect.get(window, 'fixtureSelectionTimers') as Probe).pending,
  ]);
  await expect
    .poll(() =>
      frame.evaluate(
        (ids) =>
          ids.filter((id) =>
            (Reflect.get(window, 'fixtureSelectionTimers') as Probe).pending.has(id),
          ).length,
        pending,
      ),
    )
    .toBe(0);
  return frame.evaluate(() => {
    const probe = Reflect.get(window, 'fixtureSelectionTimers') as Probe;
    return { scheduled: probe.scheduled, completed: probe.completed, pending: probe.pending.size };
  });
}
test.afterEach(async ({ page }, info) => {
  await writeFile(
    info.outputPath('selection-history.json'),
    JSON.stringify(records.get(page), null, 2),
  );
});
for (const reverse of [false, true])
  test(`cross-block ${reverse ? 'reverse' : 'forward'} Undo restores exact endpoints and replacement branch`, async ({
    page,
  }, info) => {
    const frame = await mount(page);
    await select(frame, reverse ? [1, 8] : [0, 7], reverse ? [0, 7] : [1, 8]);
    const before = await snapshot(page, frame, 'selected');
    await page.keyboard.press('Backspace');
    const edited = await snapshot(page, frame, 'deleted');
    expect(edited.raw).toBe('Alpha *Middle* end\r\n\r\nThird');
    await command(page, 'undo');
    const timers = await drain(frame);
    records.get(page)?.push({ label: 'original callbacks after Undo', timers });
    const undone = await snapshot(page, frame, 'undo');
    expect(undone.raw).toBe(source);
    expect(undone.native.selection).toEqual(before.native.selection);
    await command(page, 'redo');
    const redone = await snapshot(page, frame, 'redo');
    expect(redone.raw).toBe(edited.raw);
    expect(redone.native.selection).toEqual(edited.native.selection);
    await page.keyboard.insertText('Z');
    const typed = await snapshot(page, frame, 'typed after redo');
    expect(typed.raw).toBe('Alpha *ZMiddle* end\r\n\r\nThird');
    await command(page, 'undo');
    expect(await flush(page)).toBe(edited.raw);
    expect(await page.evaluate(() => (window as unknown as Host).fixtureSelectionErrors)).toEqual(
      [],
    );
    const retry = await mount(page);
    await select(retry, reverse ? [1, 8] : [0, 7], reverse ? [0, 7] : [1, 8]);
    await page.keyboard.press('Backspace');
    expect(await flush(page)).toBe(edited.raw);
    await command(page, 'undo');
    await drain(retry);
    await page.keyboard.insertText('Z');
    const replacement = await snapshot(page, retry, 'real replacement after Undo');
    expect(replacement.raw).toBe(typed.raw);
    if (reverse)
      await info.attach('cross-block-redo', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
  });
test('unsupported HTML reversed Undo preserves direction while source edit stays refused', async ({
  page,
}) => {
  const word = '<kbd>same</kbd>',
    raw = `${word}\r\n${word}\n${word}`;
  const frame = await mount(page, raw);
  await select(frame, [0, word.length + 1], [0, 0]);
  const before = await snapshot(page, frame, 'selected HTML');
  await page.keyboard.press('Backspace');
  await expect(flush(page)).rejects.toThrow('无法确定重复内容对应的原始源码位置');
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.getMarkdown())).toBe(
    raw,
  );
  await snapshot(page, frame, 'rejected unknown HTML', true);
  await command(page, 'undo');
  const timers = await drain(frame);
  records.get(page)?.push({ label: 'original callbacks after HTML Undo', timers });
  const undone = await snapshot(page, frame, 'undo HTML');
  expect(undone.raw).toBe(raw);
  expect(undone.native.selection).toEqual(before.native.selection);
  const errors = await page.evaluate(() =>
    (window as unknown as Host).fixtureSelectionErrors.splice(0),
  );
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.every((error) => error.includes('请撤销本次修改，再使用源码模式编辑'))).toBe(true);
  await command(page, 'toggleSource');
  await frame.evaluate(() => {
    const cm = (window as unknown as LegacyGlobals).editor?.sourceView.cm;
    if (!cm) throw Error('CM');
    cm.setSelections([{ anchor: { line: 0, ch: 0 }, head: { line: 1, ch: 0 } }], 0);
    cm.focus();
  });
  await page.keyboard.insertText('Safe');
  expect(await flush(page)).toBe(`Safe${word}\n${word}`);
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
  await command(page, 'redo');
  expect(await flush(page)).toBe(`Safe${word}\n${word}`);
});
for (const action of ['Backspace', 'Delete'] as const)
  test(`paragraph boundary ${action} keeps undo/redo caret and next input`, async ({ page }) => {
    const frame = await mount(page);
    await select(frame, action === 'Backspace' ? [1, 0] : [0, 19]);
    const before = await snapshot(page, frame, 'boundary');
    await page.keyboard.press(action);
    const edited = await snapshot(page, frame, 'merged');
    expect(edited.raw).toBe('Alpha **Bold** tailSecond *Middle* end\r\n\r\nThird');
    await command(page, 'undo');
    const undone = await snapshot(page, frame, 'undo boundary');
    expect(undone.raw).toBe(source);
    expect(undone.native.selection).toEqual(before.native.selection);
    await command(page, 'redo');
    const redone = await snapshot(page, frame, 'redo boundary');
    expect(redone.raw).toBe(edited.raw);
    expect(redone.native.selection).toEqual(edited.native.selection);
    await page.keyboard.insertText('Z');
    expect(await flush(page)).toBe('Alpha **Bold** tailZSecond *Middle* end\r\n\r\nThird');
  });
test('pasted text redo retains caret for subsequent real input', async ({ page }) => {
  const frame = await mount(page);
  await select(frame, [1, 4]);
  const before = await snapshot(page, frame, 'paste caret');
  await frame
    .locator('#write > p')
    .nth(1)
    .evaluate((element) => {
      const data = new DataTransfer();
      data.setData('text/plain', '中文😀');
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    });
  const edited = await snapshot(page, frame, 'pasted');
  expect(edited.raw).toBe(source.replace('Second', 'Seco中文😀nd'));
  await command(page, 'undo');
  const undone = await snapshot(page, frame, 'undo paste');
  expect(undone.raw).toBe(source);
  expect(undone.native.selection).toEqual(before.native.selection);
  await command(page, 'redo');
  const redone = await snapshot(page, frame, 'redo paste');
  expect(redone.raw).toBe(edited.raw);
  expect(redone.native.selection).toEqual(edited.native.selection);
  await page.keyboard.insertText('Z');
  expect(await flush(page)).toBe(source.replace('Second', 'Seco中文😀Znd'));
});
test('Source multiple directed ranges preserve primary, grouped Undo and format-only reload', async ({
  page,
}) => {
  const raw = '\uFEFFAlpha\r\nBeta\nGamma';
  const frame = await mount(page, raw);
  await command(page, 'toggleSource');
  await frame.evaluate(() => {
    const cm = (window as unknown as LegacyGlobals).editor?.sourceView.cm;
    if (!cm) throw Error('CM');
    cm.setSelections(
      [
        { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 3 } },
        { anchor: { line: 2, ch: 4 }, head: { line: 2, ch: 1 } },
      ],
      1,
    );
    cm.focus();
  });
  const before = await snapshot(page, frame, 'multi range');
  await page.keyboard.insertText('Q');
  const edited = await snapshot(page, frame, 'multi replacement');
  expect(edited.raw).toBe('\uFEFFAQha\r\nBeta\nGQa');
  await command(page, 'undo');
  const undone = await snapshot(page, frame, 'multi undo');
  expect(undone.raw).toBe(raw);
  expect(undone.native.cm?.ranges).toEqual(before.native.cm?.ranges);
  expect(undone.native.cm?.anchor).toEqual(before.native.cm?.anchor);
  expect(undone.native.cm?.head).toEqual(before.native.cm?.head);
  await command(page, 'redo');
  expect(await flush(page)).toBe(edited.raw);
  await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.reloadFromDisk((await editor.flush()).replace('\uFEFF', ''), {
      expectedSource: await editor.flush(),
      expectedRevision: editor.revision,
    });
  });
  const reload = await snapshot(page, frame, 'format-only reload');
  expect(reload.raw).toBe(edited.raw.slice(1));
  expect(reload.native.cm?.ranges).toEqual(edited.native.cm?.ranges);
  expect(reload.native.cm?.anchor).toEqual(edited.native.cm?.anchor);
  await command(page, 'undo');
  expect(await flush(page)).toBe(edited.raw);
  await command(page, 'redo');
  expect(await flush(page)).toBe(edited.raw.slice(1));
  await page.keyboard.insertText('Z');
  expect(await flush(page)).toBe('AQZha\r\nBeta\nGQZa');
});

test('synthetic image drop history retains its caret for next real input', async ({ page }) => {
  await setupImageHost(page);
  await createImageEditor(page, { source: 'Before tail', context: 'drop' });
  await page.evaluate(() => {
    const host = window as ImageTestWindow & Host;
    const editor = host.imageHostFixture.editors[0];
    if (!editor) throw Error('Editor');
    host.marklyraEditor = editor;
    host.fixtureSelectionErrors = [];
  });
  const frame = page.frames().find((value) => value.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Frame');
  await select(frame, [0, 7]);
  await snapshot(page, frame, 'drop target');
  expect(await dispatchImageTransfer(page, 'drop')).toBe(true);
  await expectDecodedImage(page);
  await drain(frame);
  const edited = await snapshot(page, frame, 'dropped');
  expect(edited.raw).toMatch(/^Before !\[drop\]\(<?assets\/drop\.png>?\)tail$/);
  await command(page, 'undo');
  expect(await flush(page)).toBe('Before tail');
  await command(page, 'redo');
  await expectDecodedImage(page);
  await drain(frame);
  const redone = await snapshot(page, frame, 'redo drop');
  expect(redone.raw).toBe(edited.raw);
  expect(redone.native.selection).toEqual(edited.native.selection);
  await page.keyboard.insertText('Z');
  const typed = await flush(page);
  expect(typed).toBe(edited.raw.replace('tail', 'Ztail'));
  expect(await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors)).toEqual(
    [],
  );
});
test('fenced CodeMirror multiple ranges retain primary and one replacement group', async ({
  page,
}) => {
  const raw = '\uFEFF```text\r\nAlpha\r\nBeta\nGamma\r\n```\r\n\r\nTail';
  const frame = await mount(page, raw);
  await expect(frame.locator('#write [mdtype="fences"] .CodeMirror')).toHaveCount(1);
  const snapshotCM = () =>
    frame.evaluate(() => {
      const owner = document.querySelector('#write [mdtype="fences"] .CodeMirror');
      const cm =
        owner &&
        (Reflect.get(owner, 'CodeMirror') as NonNullable<LegacyEditor['sourceView']['cm']> | null);
      if (!cm) throw Error('Fence CM');
      const pos = (value: { line: number; ch: number }) => ({ line: value.line, ch: value.ch });
      return {
        value: cm.getValue(),
        ranges: cm
          .listSelections()
          .map((range) => ({ anchor: pos(range.anchor), head: pos(range.head) })),
        anchor: pos(cm.getCursor('anchor')),
        head: pos(cm.getCursor('head')),
        generation: cm.doc.history.generation,
      };
    });
  await frame.evaluate(() => {
    const owner = document.querySelector('#write [mdtype="fences"] .CodeMirror');
    const cm =
      owner &&
      (Reflect.get(owner, 'CodeMirror') as NonNullable<LegacyEditor['sourceView']['cm']> | null);
    if (!cm) throw Error('Fence CM');
    cm.setSelections(
      [
        { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 3 } },
        { anchor: { line: 2, ch: 4 }, head: { line: 2, ch: 1 } },
      ],
      1,
    );
    cm.focus();
  });
  const before = await snapshotCM();
  records.get(page)?.push({ label: 'fence before', cm: before });
  await page.keyboard.insertText('Q');
  const edited = await snapshotCM();
  await snapshot(page, frame, 'fence edited original history');
  expect(await flush(page)).toBe(raw.replace('Alpha', 'AQha').replace('Gamma', 'GQa'));
  await command(page, 'undo');
  const undone = await snapshotCM();
  records.get(page)?.push({ label: 'fence undo', cm: undone });
  await snapshot(page, frame, 'fence Undo DOM and model');
  expect(await flush(page)).toBe(raw);
  expect(undone.ranges).toEqual(before.ranges);
  expect(undone.anchor).toEqual(before.anchor);
  expect(undone.head).toEqual(before.head);
  await command(page, 'redo');
  const redone = await snapshotCM();
  await snapshot(page, frame, 'fence Redo DOM and model');
  expect(redone.ranges).toEqual(edited.ranges);
  expect(await flush(page)).toBe(raw.replace('Alpha', 'AQha').replace('Gamma', 'GQa'));
  await page.keyboard.insertText('Z');
  expect(await flush(page)).toBe(raw.replace('Alpha', 'AQZha').replace('Gamma', 'GQZa'));
});

test('fenced history cannot apply retained multi ranges after same-cid CM doc swap', async ({
  page,
}) => {
  const raw = '```text\nAlpha\nBeta\nGamma\n```\n\nTail';
  const frame = await mount(page, raw);
  await expect(frame.locator('#write [mdtype="fences"] .CodeMirror')).toHaveCount(1);
  await frame.evaluate(() => {
    const owner = document.querySelector('#write [mdtype="fences"] .CodeMirror'),
      cm =
        owner &&
        (Reflect.get(owner, 'CodeMirror') as NonNullable<LegacyEditor['sourceView']['cm']> | null);
    if (!cm) throw Error('CM');
    cm.setSelections(
      [
        { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 3 } },
        { anchor: { line: 2, ch: 4 }, head: { line: 2, ch: 1 } },
      ],
      1,
    );
    cm.focus();
  });
  await page.keyboard.insertText('Q');
  expect(await flush(page)).toBe(raw.replace('Alpha', 'AQha').replace('Gamma', 'GQa'));
  const swap = await frame.evaluate(() => {
    type Code = NonNullable<LegacyEditor['sourceView']['cm']> & { swapDoc(doc: unknown): unknown };
    const owner = document.querySelector('#write [mdtype="fences"] .CodeMirror'),
      cm = owner && (Reflect.get(owner, 'CodeMirror') as Code | null);
    const Constructor = Reflect.get(window, 'CodeMirror') as { Doc: new (text: string) => unknown };
    if (!cm || !Constructor) throw Error('CM');
    const before = cm.doc;
    cm.swapDoc(new Constructor.Doc(cm.getValue()));
    cm.setSelections([{ anchor: { line: 1, ch: 1 }, head: { line: 1, ch: 1 } }], 0);
    cm.focus();
    return { same: before === cm.doc, cid: owner?.closest('[cid]')?.getAttribute('cid') };
  });
  expect(swap).toEqual({ same: false, cid: 'n0' });
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
  const ranges = await frame.evaluate(() => {
    const owner = document.querySelector('#write [mdtype="fences"] .CodeMirror'),
      cm =
        owner &&
        (Reflect.get(owner, 'CodeMirror') as NonNullable<LegacyEditor['sourceView']['cm']> | null);
    return cm?.listSelections().map(({ anchor, head }) => ({
      anchor: { line: anchor.line, ch: anchor.ch },
      head: { line: head.line, ch: head.ch },
    }));
  });
  expect(ranges).toHaveLength(1);
  records.get(page)?.push({ label: 'same-cid doc-swap guard', swap, ranges });
});

test('failed document replacement restores only signature-proven fenced history on the new CM owner', async ({
  page,
}) => {
  const raw = '```text\nAlpha\nBeta\nGamma\n```\n\nTail',
    frame = await mount(page, raw);
  await expect(frame.locator('#write [mdtype="fences"] .CodeMirror')).toHaveCount(1);
  await frame.evaluate(() => {
    const owner = document.querySelector('#write [mdtype="fences"] .CodeMirror'),
      cm =
        owner &&
        (Reflect.get(owner, 'CodeMirror') as NonNullable<LegacyEditor['sourceView']['cm']> | null);
    if (!cm) throw Error('CM');
    Reflect.set(window, 'fixtureOldCodeOwner', { cm, doc: cm.doc });
    cm.setSelections(
      [
        { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 3 } },
        { anchor: { line: 2, ch: 4 }, head: { line: 2, ch: 1 } },
      ],
      1,
    );
    cm.focus();
  });
  await page.keyboard.insertText('Q');
  const edited = raw.replace('Alpha', 'AQha').replace('Gamma', 'GQa');
  expect(await flush(page)).toBe(edited);
  await expect(
    page.evaluate(() =>
      (window as unknown as Host).marklyraEditor.load('Unsupported \uE027 marker\n'),
    ),
  ).rejects.toThrow('normalization');
  expect(await flush(page)).toBe(edited);
  const restored = await frame.evaluate(() => {
    const owner = document.querySelector('#write [mdtype="fences"] .CodeMirror'),
      cm =
        owner &&
        (Reflect.get(owner, 'CodeMirror') as NonNullable<LegacyEditor['sourceView']['cm']> | null),
      old = Reflect.get(window, 'fixtureOldCodeOwner') as { cm: unknown; doc: unknown };
    const editor = (window as unknown as LegacyGlobals).editor;
    return {
      sameCM: old.cm === cm,
      sameDoc: old.doc === cm?.doc,
      index: editor?.undo.index,
      entries: editor?.undo.commandStack.length,
      active: document.activeElement?.tagName,
    };
  });
  records.get(page)?.push({ label: 'failed load code owner', restored });
  expect(restored.index).toBe(0);
  expect(restored.entries).toBe(1);
  expect(restored.active).not.toBe('TEXTAREA');
  await command(page, 'undo');
  expect(await flush(page)).toBe(raw);
  const selected = await frame.evaluate(() => {
    const owner = document.querySelector('#write [mdtype="fences"] .CodeMirror'),
      cm =
        owner &&
        (Reflect.get(owner, 'CodeMirror') as NonNullable<LegacyEditor['sourceView']['cm']> | null);
    if (!cm) throw Error('CM');
    return {
      ranges: cm.listSelections().map((range) => ({
        anchor: { line: range.anchor.line, ch: range.anchor.ch },
        head: { line: range.head.line, ch: range.head.ch },
      })),
      anchor: cm.getCursor('anchor'),
      head: cm.getCursor('head'),
    };
  });
  expect(selected.ranges).toEqual([
    { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 3 } },
    { anchor: { line: 2, ch: 4 }, head: { line: 2, ch: 1 } },
  ]);
  expect(selected.anchor).toMatchObject({ line: 2, ch: 4 });
  expect(selected.head).toMatchObject({ line: 2, ch: 1 });
  await command(page, 'redo');
  expect(await flush(page)).toBe(edited);
  await page.keyboard.insertText('Z');
  expect(await flush(page)).toBe(raw.replace('Alpha', 'AQZha').replace('Gamma', 'GQZa'));
  const errors = await page.evaluate(() =>
    (window as unknown as Host).fixtureSelectionErrors.splice(0),
  );
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain('normalization');
});

test('original footnote cursor-only history cannot apply another entry directed endpoints', async ({
  page,
}) => {
  const raw = `${source}[^a]\n\n[^a]: Footnote`,
    frame = await mount(page, raw);
  await select(frame, [1, 8], [0, 7]);
  const before = await snapshot(page, frame, 'before edit and native cursor-only navigation');
  await page.keyboard.press('Backspace');
  const edited = await flush(page);
  await frame.locator('#write .md-footnote').click({ modifiers: ['Meta'] });
  const navigation = await frame.evaluate(() => {
    const undo = (window as unknown as LegacyGlobals).editor?.undo;
    if (!undo) throw Error('Undo');
    return {
      index: undo.index,
      cursorOnly: Reflect.get(undo.commandStack[undo.index] ?? {}, 'cursorOnly'),
      undo: Reflect.get(undo.commandStack[undo.index] ?? {}, 'undo'),
    };
  });
  expect(navigation.cursorOnly).toBe(true);
  records.get(page)?.push({ label: 'real footnote cursor-only entry', navigation });
  await command(page, 'undo');
  const first = await snapshot(page, frame, 'Undo native navigation');
  expect(first.raw).toBe(edited);
  await command(page, 'undo');
  await drain(frame);
  const second = await snapshot(page, frame, 'Undo actual content entry after cursor-only');
  expect(second.raw).toBe(raw);
  expect(second.native.selection).toEqual(before.native.selection);
  await page.keyboard.insertText('Z');
  expect(await flush(page)).toBe(edited.replace('Alpha *Middle', 'Alpha *ZMiddle'));
});

test('failed replacement keeps signature-proven cross-block selection while ordinary load revokes it', async ({
  page,
}) => {
  const frame = await mount(page);
  await select(frame, [1, 8], [0, 7]);
  const before = await snapshot(page, frame, 'cross-block before rejected load');
  await page.keyboard.press('Backspace');
  const edited = await flush(page);
  expect(edited).toBe('Alpha *Middle* end\r\n\r\nThird');
  await expect(
    page.evaluate(() =>
      (window as unknown as Host).marklyraEditor.load('Unsupported \uE027 marker\n'),
    ),
  ).rejects.toThrow('normalization');
  expect(await flush(page)).toBe(edited);
  await command(page, 'undo');
  await drain(frame);
  const restored = await snapshot(page, frame, 'cross-block Undo after failed load');
  expect(restored.raw).toBe(source);
  expect(restored.native.selection).toEqual(before.native.selection);
  await page.evaluate((value) => (window as unknown as Host).marklyraEditor.load(value), source);
  await select(frame, [0, 0]);
  await page.keyboard.insertText('Q');
  expect(await flush(page)).toBe(`Q${source}`);
  await command(page, 'undo');
  const fresh = await snapshot(page, frame, 'new ordinary load history');
  expect(fresh.raw).toBe(source);
  expect(fresh.native.selection.anchor?.sourceOffset).toBe(0);
  expect(fresh.native.selection.head?.sourceOffset).toBe(0);
  expect(fresh.native.selection.anchor?.cid).toBe(fresh.native.selection.head?.cid);
  const errors = await page.evaluate(() =>
    (window as unknown as Host).fixtureSelectionErrors.splice(0),
  );
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain('normalization');
});
