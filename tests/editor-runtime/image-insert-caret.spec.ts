import { writeFile } from 'node:fs/promises';
import { expect, type Frame, test } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import {
  createImageEditor,
  dispatchImageTransfer,
  expectDecodedImage,
  type ImageTestWindow,
  imageCommand,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

type Probe = { records: unknown[]; pending: Set<number> };
type Runtime = Window & { editor: LegacyEditor; fixtureImageProbe: Probe };
async function drain(frame: Frame) {
  const ids = await frame.evaluate(() => [
    ...(window as unknown as Runtime).fixtureImageProbe.pending,
  ]);
  await expect
    .poll(() =>
      frame.evaluate(
        (ids) =>
          ids.filter((id) => (window as unknown as Runtime).fixtureImageProbe.pending.has(id))
            .length,
        ids,
      ),
    )
    .toBe(0);
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window === window.top) return;
    const probe: Probe = { records: [], pending: new Set() };
    (window as unknown as Runtime).fixtureImageProbe = probe;
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
        }
      }, delay);
      probe.pending.add(id);
      return id;
    }) as typeof setTimeout;
    window.clearTimeout = ((id: number | undefined) => {
      if (id !== undefined) probe.pending.delete(id);
      cancel(id);
    }) as typeof clearTimeout;
  });
});
test.afterEach(async ({ page }, info) => {
  const frame = page.frames().find((entry) => entry.url().startsWith('http://127.0.0.1:4174/'));
  if (frame)
    await writeFile(
      info.outputPath('image-caret-trace.json'),
      JSON.stringify(
        await frame.evaluate(() => (window as unknown as Runtime).fixtureImageProbe.records),
        null,
        2,
      ),
    );
});
for (const history of [false, true])
  test(`image drop accepts the first key ${history ? 'after Redo' : 'without history'}`, async ({
    page,
  }, info) => {
    await setupImageHost(page);
    await createImageEditor(page, { source: 'Before tail', context: 'drop' });
    const frame = page.frames().find((entry) => entry.url().startsWith('http://127.0.0.1:4174/'));
    if (!frame) throw Error('Missing image runtime');
    await frame.evaluate(() => {
      const runtime = window as unknown as Runtime;
      const editor = runtime.editor;
      const probe = runtime.fixtureImageProbe;
      probe.records = [];
      const record = (label: string, extra?: unknown) => {
        const selection = getSelection(),
          paragraph = editor.writingArea.querySelector('p');
        const point = (node: Node | null, offset: number) => {
          if (!node || !paragraph?.contains(node)) return null;
          const range = document.createRange();
          range.selectNodeContents(paragraph);
          range.setEnd(node, offset);
          return {
            offset,
            text: node.textContent,
            parent: node.parentElement?.className,
            sourceOffset: range.cloneContents().textContent?.length,
            type: node.nodeType,
            connected: node.isConnected,
          };
        };
        probe.records.push({
          label,
          extra: extra === undefined ? undefined : JSON.parse(JSON.stringify(extra)),
          anchor: point(selection?.anchorNode ?? null, selection?.anchorOffset ?? 0),
          head: point(selection?.focusNode ?? null, selection?.focusOffset ?? 0),
          active: document.activeElement?.tagName,
          model: editor.getNode('n0')?.get('text'),
          dom: editor.writingArea.innerHTML,
          index: editor.undo.index,
        });
      };
      Reflect.set(window, 'fixtureImageRecord', record);
      for (const [owner, key] of [
        [editor, 'insertText'],
        [editor.undo, 'exeCommand'],
        [editor.brush, 'brushNode'],
        [editor.selection, 'buildUndo'],
      ] as const) {
        const original: unknown = Reflect.get(owner, key);
        if (typeof original !== 'function') throw Error(`Missing original ${key}`);
        Reflect.set(owner, key, function (this: unknown, ...args: unknown[]) {
          record(`${key}:before`, args);
          const result: unknown = Reflect.apply(original, this, args);
          record(
            `${key}:after`,
            typeof result === 'object' && result !== null
              ? JSON.parse(JSON.stringify(result))
              : result,
          );
          return result;
        });
      }
      const cursor = Reflect.get(window, '__MARKLYRA_RESTORE_BRUSH_CURSOR__');
      Reflect.set(
        window,
        '__MARKLYRA_RESTORE_BRUSH_CURSOR__',
        function (this: unknown, ...args: unknown[]) {
          record('brushCursor:before', args[1]);
          const result = Reflect.apply(cursor, this, args);
          record('brushCursor:after', result);
          return result;
        },
      );
      const paragraph = editor.writingArea.querySelector('p'),
        text = paragraph?.querySelector('span')?.firstChild;
      if (!text) throw Error('Missing initial text');
      editor.writingArea.focus();
      getSelection()?.setBaseAndExtent(text, 7, text, 7);
      record('target');
    });
    expect(await dispatchImageTransfer(page, 'drop')).toBe(true);
    await expectDecodedImage(page);
    await drain(frame);
    const capture = (label: string) =>
      frame.evaluate(
        (label) => (Reflect.get(window, 'fixtureImageRecord') as (label: string) => void)(label),
        label,
      );
    await capture('before-flush');
    const raw = await imageSource(page);
    await capture('after-flush');
    expect(raw).toMatch(/^Before !\[drop\]\(<?assets\/drop\.png>?\)tail$/);
    if (history) {
      await imageCommand(page, 'undo');
      expect(await imageSource(page)).toBe('Before tail');
      await imageCommand(page, 'redo');
      await expectDecodedImage(page);
      await drain(frame);
      await capture('after-redo');
      expect(await imageSource(page)).toBe(raw);
    }
    await page.keyboard.type('Z');
    const typed = await imageSource(page);
    await capture('first-key');
    await info.attach('image-first-key', {
      body: JSON.stringify({ raw, typed, history }),
      contentType: 'application/json',
    });
    expect(typed).toBe(raw.replace('tail', 'Ztail'));
    expect(await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors)).toEqual(
      [],
    );
  });
