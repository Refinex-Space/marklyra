import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Frame, type Page, test } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

interface Brush {
  queue: unknown[];
  brushQueue(): Promise<unknown>;
  addToQueue(id: string, checkModified: boolean): void;
}
type Host = Window & { marklyraEditor: MarkLyraEditor };
type Child = Window & {
  editor: LegacyEditor;
  focusBrush: {
    entered: number;
    completed: number;
    originalCalls: number;
    firstOriginalCompleted: boolean;
    release(): void;
  };
};
const initial = '\uFEFF# Heading\r\n\r\nAlpha \n';
const edited = '\uFEFF# Heading\r\n\r\nAlpha **bold**\n';

async function mount(page: Page): Promise<Frame> {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as unknown as Host;
    await host.marklyraEditor.ready;
    await host.marklyraEditor.load(source);
    const control = document.createElement('input');
    control.id = 'outside-focus-control';
    control.value = 'Search draft';
    document.querySelector('header')?.append(control);
  }, initial);
  const frame = page.frames().find((entry) => entry.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw new Error('Missing runtime');
  await frame.waitForFunction(() => {
    const brush = (window as unknown as Child).editor.brush as unknown as Brush;
    return brush.queue.length === 0;
  });
  await frame.evaluate(() => {
    const child = window as unknown as Child;
    const brush = child.editor.brush as unknown as Brush;
    const original = brush.brushQueue;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const probe = {
      entered: 0,
      completed: 0,
      originalCalls: 0,
      firstOriginalCompleted: false,
      release,
    };
    child.focusBrush = probe;
    // Hold the real next parser callback across the focus handoff. The
    // scheduler and callback still execute, with no timer fast-forward or cancellation.
    brush.brushQueue = async function () {
      probe.entered++;
      await gate;
      const ordinal = ++probe.originalCalls;
      try {
        return await original.call(this);
      } finally {
        probe.completed++;
        if (ordinal === 1) probe.firstOriginalCompleted = true;
      }
    };
  });
  await frame.locator('#write p').click();
  await page.keyboard.press('End');
  await page.keyboard.type('**bold**');
  await expect
    .poll(() => frame.evaluate(() => (window as unknown as Child).focusBrush.entered))
    .toBeGreaterThan(0);
  return frame;
}
async function finishBrush(frame: Frame) {
  await frame.evaluate(() => (window as unknown as Child).focusBrush.release());
  await expect
    .poll(() => frame.evaluate(() => (window as unknown as Child).focusBrush.completed))
    .toBeGreaterThan(0);
}
async function flush(page: Page) {
  return page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
}

test('pending original parsing keeps host input focus, range and draft, then restores the remapped editor caret', async ({
  page,
}) => {
  const frame = await mount(page);
  const control = page.locator('#outside-focus-control');
  await control.focus();
  await control.evaluate((element) =>
    (element as HTMLInputElement).setSelectionRange(2, 6, 'backward'),
  );
  await finishBrush(frame);
  await expect(control).toBeFocused();
  expect(
    await control.evaluate((element) => {
      const input = element as HTMLInputElement;
      return [input.value, input.selectionStart, input.selectionEnd, input.selectionDirection];
    }),
  ).toEqual(['Search draft', 2, 6, 'backward']);
  expect(await flush(page)).toBe(edited);
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.focus());
  await page.keyboard.type('X');
  expect(await flush(page)).toBe(edited.replace('**bold**', '**bold**X'));
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }));
  expect(await flush(page)).toBe(edited);
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'redo' }));
  expect(await flush(page)).toBe(edited.replace('**bold**', '**bold**X'));
});

test('a new pointer selection wins over an already deferred cursor', async ({ page }) => {
  const frame = await mount(page);
  await page.locator('#outside-focus-control').focus();
  await finishBrush(frame);
  await frame.locator('#write h1').click();
  await page.keyboard.press('End');
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.focus());
  await page.keyboard.type('Z');
  expect(await flush(page)).toBe(edited.replace('Heading', 'HeadingZ'));
});

test('late math brush completion cannot restore a cursor from before Enter', async ({ page }) => {
  const frame = await mount(page);
  await frame.evaluate(() => {
    const child = window as unknown as Child;
    // Establish the raw view of the text just typed. A separate refresh
    // can otherwise normalize it before this controlled queue callback runs.
    // Markdown/model text is unchanged; the real parser still performs the render.
    const paragraph = child.editor.writingArea.querySelector('p');
    if (!paragraph) throw new Error('Missing typed paragraph');
    paragraph.textContent = 'Alpha **bold**';
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(false);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    const math = Reflect.get(child.editor, 'mathInline') as { brush(...args: unknown[]): unknown };
    const original = math.brush;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const probe = { entered: false, release };
    Reflect.set(window, 'lateMathProbe', probe);
    math.brush = async function (...args: unknown[]) {
      const result = await Reflect.apply(original, this, args);
      if (!probe.entered) {
        probe.entered = true;
        await gate;
      }
      return result;
    };
    const cid = paragraph.getAttribute('cid');
    if (!cid) throw new Error('Missing queued paragraph identity');
    // A timer can enter our wrapper with an empty queue. Enqueue this
    // raw view through the API so its actual async parser must run.
    (child.editor.brush as unknown as Brush).addToQueue(cid, false);
    child.focusBrush.release();
  });
  await frame.waitForFunction(
    () => (Reflect.get(window, 'lateMathProbe') as { entered: boolean }).entered,
  );
  await page.keyboard.press('Enter');
  const before = await frame.evaluate(() => ({
    bookmark: (window as unknown as Child).editor.selection.buildUndo(),
    cid: (window as unknown as Child).editor.focusCid,
  }));
  const sourceAfterEnter = await flush(page);
  await frame.evaluate(() =>
    (Reflect.get(window, 'lateMathProbe') as { release(): void }).release(),
  );
  await expect
    .poll(() =>
      frame.evaluate(() => (window as unknown as Child).focusBrush.firstOriginalCompleted),
    )
    .toBe(true);
  expect(
    await frame.evaluate(() => ({
      bookmark: (window as unknown as Child).editor.selection.buildUndo(),
      cid: (window as unknown as Child).editor.focusCid,
    })),
  ).toEqual(before);
  expect(await flush(page)).toBe(sourceAfterEnter);
  await page.keyboard.type('Z');
  const after = await flush(page);
  expect(after).not.toBe(sourceAfterEnter);
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }));
  expect(await flush(page)).toBe(sourceAfterEnter);
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'redo' }));
  expect(await flush(page)).toBe(after);
});
