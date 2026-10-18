import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Frame, type Page, test } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import {
  createImageEditor,
  expectDecodedImage,
  type ImageTestWindow,
  imageCommand,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

type Host = Window & { marklyraEditor: MarkLyraEditor };
type Runtime = Window & {
  editor: LegacyEditor;
  fixtureMathGate: {
    entered: number;
    completed: number;
    arguments: unknown[][];
    callerCompleted: boolean;
    callerId: number | undefined;
    release(): void;
  };
};
const initial = '\uFEFF# Heading\r\n\r\nAlpha \n';
const flush = (page: Page) =>
  page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
const execute = (page: Page, type: 'undo' | 'redo') =>
  page.evaluate((type) => (window as unknown as Host).marklyraEditor.execute({ type }), type);

async function snapshot(frame: Frame) {
  return frame.evaluate(() => {
    const editor = (window as unknown as Runtime).editor;
    const selection = getSelection();
    const endpoint = (node: Node | null, offset: number) => {
      const path: number[] = [];
      let current = node;
      while (current && current !== editor.writingArea) {
        const parent = current.parentNode;
        if (!parent) break;
        path.unshift([...parent.childNodes].indexOf(current as ChildNode));
        current = parent;
      }
      return { path, offset, text: node?.textContent, connected: node?.isConnected };
    };
    const blocks: { cid: string; type: unknown; markdown: string }[] = [];
    const visited = new Set<string>();
    let node = editor.nodeMap.blocks.sortedFirst();
    while (node && !visited.has(node.cid)) {
      visited.add(node.cid);
      blocks.push({ cid: node.cid, type: node.get('type'), markdown: node.toMark() });
      node = node.get('after');
    }
    return {
      canonical: editor.getMarkdown(),
      blocks,
      bookmark: editor.selection.buildUndo(),
      anchor: endpoint(selection?.anchorNode ?? null, selection?.anchorOffset ?? 0),
      head: endpoint(selection?.focusNode ?? null, selection?.focusOffset ?? 0),
      focusCid: editor.focusCid,
      history: { index: editor.undo.index, size: editor.undo.commandStack.length },
      html: editor.writingArea.innerHTML,
      active: document.activeElement?.tagName,
      documentFocus: document.hasFocus(),
      gate: {
        entered: (window as unknown as Runtime).fixtureMathGate?.entered,
        completed: (window as unknown as Runtime).fixtureMathGate?.completed,
        callerCompleted: (window as unknown as Runtime).fixtureMathGate?.callerCompleted,
        callerId: (window as unknown as Runtime).fixtureMathGate?.callerId,
      },
    };
  });
}

async function pendingMath(page: Page, formula = false) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (raw) => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.ready;
    await editor.load(raw);
  }, initial);
  const frame = page.frames().find((entry) => entry.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing runtime runtime');
  await frame.evaluate((formula) => {
    const runtime = window as unknown as Runtime;
    if (formula) {
      const file = Reflect.get(window, 'File') as unknown as {
        option: { enableInlineMath: boolean };
      };
      file.option.enableInlineMath = true;
    }
    const math = Reflect.get(runtime.editor, 'mathInline') as {
      brush(...args: unknown[]): Promise<unknown>;
    };
    const original = math.brush;
    let release = () => {};
    const held = new Promise<void>((done) => {
      release = done;
    });
    const gate = {
      entered: 0,
      completed: 0,
      callerCompleted: false,
      callerId: undefined as number | undefined,
      arguments: [] as unknown[][],
      release,
    };
    runtime.fixtureMathGate = gate;
    const brush = runtime.editor.brush as unknown as { brushQueue(): Promise<unknown> };
    const originalQueue = brush.brushQueue;
    let activeQueue: number | undefined;
    let nextQueue = 0;
    brush.brushQueue = function () {
      const id = ++nextQueue;
      const previous = activeQueue;
      activeQueue = id;
      let result: Promise<unknown>;
      try {
        result = originalQueue.call(this);
      } finally {
        activeQueue = previous;
      }
      return result.finally(() => {
        if (gate.callerId === id) gate.callerCompleted = true;
      });
    };
    math.brush = async function (...args) {
      const caller = activeQueue;
      const result = await Reflect.apply(original, this, args);
      if (caller !== undefined && gate.entered === 0) {
        gate.entered++;
        gate.callerId = caller;
        gate.arguments.push(args.map((arg) => (typeof arg === 'string' ? arg : typeof arg)));
        await held;
        gate.completed++;
      }
      return result;
    };
  }, formula);
  await frame.locator('#write > p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(formula ? '$x$' : '**bold**');
  await frame.evaluate(() => {
    const runtime = window as unknown as Runtime;
    const brush = runtime.editor.brush as unknown as {
      addToQueue(cid: string, inlineOnly: boolean): void;
      brushQueue(): Promise<void>;
    };
    const cid = runtime.editor.writingArea.querySelector('p')?.getAttribute('cid');
    if (!cid) throw Error('Missing typed block');
    brush.addToQueue(cid, false);
    void brush.brushQueue();
  });
  await expect
    .poll(() => frame.evaluate(() => (window as unknown as Runtime).fixtureMathGate.entered))
    .toBe(1);
  expect(
    await frame.evaluate(() => (window as unknown as Runtime).fixtureMathGate.callerCompleted),
  ).toBe(false);
  return frame;
}

async function release(frame: Frame) {
  await frame.evaluate(() => (window as unknown as Runtime).fixtureMathGate.release());
  await expect
    .poll(() => frame.evaluate(() => (window as unknown as Runtime).fixtureMathGate.completed))
    .toBe(1);
  await expect
    .poll(() =>
      frame.evaluate(() => (window as unknown as Runtime).fixtureMathGate.callerCompleted),
    )
    .toBe(true);
}

for (const operation of ['new-input', 'new-selection', 'new-document'] as const)
  test(`an actual pending math continuation cannot replace ${operation}`, async ({
    page,
  }, info) => {
    const frame = await pendingMath(page, true);
    await expect(frame.locator('#write .md-inline-math')).toHaveCount(1);
    const held = await snapshot(frame);
    if (operation === 'new-input') {
      await page.keyboard.press('Enter');
      await page.keyboard.type('Z');
    } else if (operation === 'new-selection') {
      await frame.locator('#write > h1').dblclick({ position: { x: 30, y: 10 } });
      expect(await frame.evaluate(() => getSelection()?.toString())).toBe('Heading');
    } else {
      await page.evaluate(() =>
        (window as unknown as Host).marklyraEditor.load('New document\n\nTail'),
      );
      await frame.locator('#write > p').last().click();
      await page.keyboard.press('End');
      await page.keyboard.type('Z');
    }
    const beforeRaw = await flush(page);
    expect(beforeRaw).toBe(
      operation === 'new-document'
        ? 'New document\n\nTailZ'
        : initial.replace('Alpha ', operation === 'new-input' ? '\n\nZAlpha $x$' : 'Alpha $x$'),
    );
    const before = await snapshot(frame);
    await release(frame);
    const after = await snapshot(frame);
    await info.attach('math-await-before-assertion', {
      body: JSON.stringify({ operation, held, beforeRaw, before, after }, null, 2),
      contentType: 'application/json',
    });
    expect(after.bookmark).toEqual(before.bookmark);
    expect(after.anchor).toEqual(before.anchor);
    expect(after.head).toEqual(before.head);
    expect(after.blocks).toEqual(before.blocks);
    expect(after.history).toEqual(before.history);
    expect(await flush(page)).toBe(beforeRaw);
    await page.keyboard.type('Q');
    const next = await flush(page);
    expect(next).toBe(
      operation === 'new-selection'
        ? beforeRaw.replace('Heading', 'Q')
        : beforeRaw.replace('Z', 'ZQ'),
    );
    await execute(page, 'undo');
    expect(await flush(page)).toBe(beforeRaw);
    await execute(page, 'redo');
    expect(await flush(page)).toBe(next);
    if (operation === 'new-input')
      await info.attach('math-after-redo', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    await info.attach('math-await-ownership', {
      body: JSON.stringify({ operation, held, beforeRaw, before, after, next }, null, 2),
      contentType: 'application/json',
    });
  });

test('entering Source during a real math await preserves the new CodeMirror owner and carets', async ({
  page,
}, info) => {
  const frame = await pendingMath(page, true);
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
  );
  await frame.evaluate(() => {
    const cm = (window as unknown as Runtime).editor.sourceView.cm;
    if (!cm) throw Error('Missing actual Source CodeMirror');
    cm.setSelections(
      [0, 2].map((line) => ({ anchor: { line, ch: 9 }, head: { line, ch: 9 } })),
      1,
    );
    cm.focus();
  });
  const capture = () =>
    frame.evaluate(() => {
      const editor = (window as unknown as Runtime).editor;
      const cm = editor.sourceView.cm;
      if (!cm) throw Error('Missing Source CodeMirror');
      const pos = (value: { line: number; ch: number }) => ({ line: value.line, ch: value.ch });
      return {
        sourceMode: editor.sourceView.inSourceMode,
        value: cm.getValue(),
        ranges: cm.listSelections().map((range) => ({
          anchor: pos(range.anchor),
          head: pos(range.head),
        })),
        anchor: pos(cm.getCursor('anchor')),
        head: pos(cm.getCursor('head')),
        generation: cm.doc.history.generation,
        done: cm.doc.history.done.length,
        undone: cm.doc.history.undone.length,
        focused: Boolean(document.activeElement?.closest('#typora-source')),
      };
    });
  const raw = initial.replace('Alpha ', 'Alpha $x$');
  expect(await flush(page)).toBe(raw);
  const before = await capture();
  expect(before).toMatchObject({ sourceMode: true, focused: true });
  expect(before.ranges).toHaveLength(2);
  await release(frame);
  const after = await capture();
  expect(after).toEqual(before);
  expect(await flush(page)).toBe(raw);
  await page.keyboard.type('Q');
  const edited = raw.replace('Heading', 'HeadingQ').replace('$x$', '$x$Q');
  expect(await flush(page)).toBe(edited);
  await execute(page, 'undo');
  expect(await flush(page)).toBe(raw);
  await execute(page, 'redo');
  expect(await flush(page)).toBe(edited);
  await info.attach('source-owner-during-math-await', {
    body: JSON.stringify({ raw, before, after, edited }, null, 2),
    contentType: 'application/json',
  });
});

test('an unfocused iframe preserves its Host input owner until explicit editor focus', async ({
  page,
}, info) => {
  const frame = await pendingMath(page);
  await page.evaluate(() => {
    const control = document.createElement('input');
    control.id = 'host-owner';
    control.value = 'Other draft';
    document.querySelector('header')?.append(control);
  });
  const control = page.locator('#host-owner');
  await control.focus();
  await control.evaluate((element) =>
    (element as HTMLInputElement).setSelectionRange(2, 7, 'backward'),
  );
  await expect.poll(() => frame.evaluate(() => document.hasFocus())).toBe(false);
  const before = await snapshot(frame);
  const raw = await flush(page);
  await release(frame);
  const after = await snapshot(frame);
  await expect(control).toBeFocused();
  expect(
    await control.evaluate((element) => {
      const input = element as HTMLInputElement;
      return {
        value: input.value,
        anchor: input.selectionStart,
        head: input.selectionEnd,
        direction: input.selectionDirection,
      };
    }),
  ).toEqual({ value: 'Other draft', anchor: 2, head: 7, direction: 'backward' });
  expect(after.documentFocus).toBe(false);
  expect(after.blocks).toEqual(before.blocks);
  expect(after.history).toEqual(before.history);
  expect(await flush(page)).toBe(raw);
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.focus());
  await page.keyboard.type('Q');
  expect(await flush(page)).toBe(initial.replace('Alpha ', 'Alpha **bold**Q'));
  await info.attach('host-owner-ownership', {
    body: JSON.stringify({ before, after, raw, final: await snapshot(frame) }, null, 2),
    contentType: 'application/json',
  });
});

async function imageEditingSnapshot(page: Page) {
  return imageFrame(page)
    .locator('#write')
    .evaluate((write) => {
      const editor = (window as unknown as Runtime).editor;
      const selection = getSelection();
      const endpoint = (node: Node | null, offset: number) => ({
        text: node?.textContent,
        offset,
        connected: node?.isConnected,
        cid: (node?.nodeType === 1 ? (node as Element) : node?.parentElement)
          ?.closest('[cid]')
          ?.getAttribute('cid'),
      });
      return {
        bookmark: editor.selection.buildUndo(),
        index: editor.undo.index,
        size: editor.undo.commandStack.length,
        canonical: editor.getMarkdown(),
        anchor: endpoint(selection?.anchorNode ?? null, selection?.anchorOffset ?? 0),
        head: endpoint(selection?.focusNode ?? null, selection?.focusOffset ?? 0),
        models: [...write.querySelectorAll('[cid]')].map((element) => {
          const cid = element.getAttribute('cid');
          const model = cid ? editor.getNode(cid) : undefined;
          return { cid, type: model?.get('type'), markdown: model?.toMark() };
        }),
        paragraph: write.querySelector('p:last-child')?.innerHTML,
      };
    });
}

test('a pending image decoration cannot overwrite a newer caret or consume its first key', async ({
  page,
}, info) => {
  await setupImageHost(page);
  const raw = '\uFEFF![pixel](images/pixel.png)\r\n\r\nTail\n';
  await createImageEditor(page, { source: raw, context: 'image', resolve: 'defer' });
  const frame = imageFrame(page);
  await expect
    .poll(() => page.evaluate(() => (window as ImageTestWindow).imageHostFixture.resolves.length))
    .toBe(1);
  await frame.locator('#write > p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type('Z');
  const before = await imageEditingSnapshot(page);
  const edited = raw.replace('Tail', 'TailZ');
  expect(await imageSource(page)).toBe(edited);
  await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.releaseResolves('image'));
  await expectDecodedImage(page);
  const after = await imageEditingSnapshot(page);
  expect(after).toEqual(before);
  await page.keyboard.type('Q');
  expect(await imageSource(page)).toBe(raw.replace('Tail', 'TailZQ'));
  await imageCommand(page, 'undo');
  expect(await imageSource(page)).toBe(edited);
  await imageCommand(page, 'redo');
  expect(await imageSource(page)).toBe(raw.replace('Tail', 'TailZQ'));
  await info.attach('image-await-ownership', {
    body: JSON.stringify({ raw, before, after, edited }),
    contentType: 'application/json',
  });
});
