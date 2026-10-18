import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';
import { installInputCostRecorder } from '../../tools/performance/input-cost-recorder.mjs';

type Policy = 'preserve-native-binding' | 'legacy-invalidating-control';
interface BindingState {
  present: boolean;
  nodeMethodMatches: boolean;
  mapMethodMatches: boolean;
}
interface ProbeWindow extends Window {
  __MARKLYRA_NATIVE_SERIALIZATION__: { nodePrototype: { toMark(): string }; nodeToMark(): string };
  __cost: {
    enabled: boolean;
    phase: string;
    nodes: Record<string, number>;
    installNodeCounter(prototype: object): void;
    serializerBinding: { before: BindingState; after: BindingState; nodeCounter: string };
  };
  editor: { nodeMap: { toMark(): string } };
}
const source = '# Performance\r\n\r\nAlpha **bold**\n\n- parent\n  - child\n\nTail';
for (const policy of ['preserve-native-binding', 'legacy-invalidating-control'] satisfies Policy[])
  test(`performance recorder ${policy} reports actual serializer binding and preserves source/history`, async ({
    page,
  }) => {
    await page.context().addInitScript(installInputCostRecorder, { nodeCounterPolicy: policy });
    await page.goto('/');
    await page.waitForFunction(() => Boolean(Reflect.get(window, 'marklyraEditor')));
    await page.evaluate(async (source) => {
      const editor = (window as unknown as Window & { marklyraEditor: MarkLyraEditor })
        .marklyraEditor;
      await editor.ready;
      await editor.load(source);
    }, source);
    const frame = page.frames().find((frame) => frame.url().startsWith('http://127.0.0.1:4174/'));
    if (!frame) throw new Error('Missing actual runtime frame');
    const observed = await frame.evaluate(() => {
      const w = window as unknown as ProbeWindow,
        capability = w.__MARKLYRA_NATIVE_SERIALIZATION__;
      if (!capability || !Object.isFrozen(capability))
        throw new Error('Missing actual frozen native binding');
      w.__cost.enabled = true;
      w.__cost.phase = 'serialization';
      w.__cost.installNodeCounter(capability.nodePrototype);
      w.editor.nodeMap.toMark();
      const area = document.querySelector('#write') as HTMLElement;
      const last = area.lastElementChild;
      if (!last?.textContent?.endsWith('Tail')) throw new Error('Unexpected tail paragraph');
      area.focus();
      const walker = document.createTreeWalker(last, NodeFilter.SHOW_TEXT);
      let tail = walker.nextNode();
      if (!tail) throw new Error('Missing tail text node');
      let next = walker.nextNode();
      while (next) {
        tail = next;
        next = walker.nextNode();
      }
      const range = document.createRange();
      range.setStart(tail, tail.textContent?.length ?? 0);
      range.collapse(true);
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return { ...w.__cost.serializerBinding, nodes: w.__cost.nodes.serialization ?? 0 };
    });
    expect(observed.before.nodeMethodMatches).toBe(true);
    expect(observed.before.mapMethodMatches).toBe(true);
    expect(observed.after.mapMethodMatches).toBe(true);
    expect(observed.after.nodeMethodMatches).toBe(policy === 'preserve-native-binding');
    expect(observed.nodes > 0).toBe(policy === 'legacy-invalidating-control');
    await page.keyboard.type('x');
    const flush = () =>
      page.evaluate(() =>
        (window as unknown as Window & { marklyraEditor: MarkLyraEditor }).marklyraEditor.flush(),
      );
    expect(await flush()).toBe(source + 'x');
    await page.evaluate(() =>
      (window as unknown as Window & { marklyraEditor: MarkLyraEditor }).marklyraEditor.execute({
        type: 'undo',
      }),
    );
    expect(await flush()).toBe(source);
    await page.evaluate(() =>
      (window as unknown as Window & { marklyraEditor: MarkLyraEditor }).marklyraEditor.execute({
        type: 'redo',
      }),
    );
    expect(await flush()).toBe(source + 'x');
  });
