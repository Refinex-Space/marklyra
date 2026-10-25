import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';
import { engineWithoutCapability } from './engine-source-fixture.js';

type Host = Window & { marklyraEditor: MarkLyraEditor };
interface CountedFrame extends Window {
  __nodeSerializationCalls: number;
  editor: { nodeMap: { blocks: { toArray(): { toMark(): string }[] } } };
}

for (const eol of ['\n', '\r\n']) {
  test(`flush shares one serialization with source tracking (${JSON.stringify(eol)})`, async ({
    page,
  }) => {
    const source = `\uFEFFAlpha 中文😀${eol}${eol}Beta${eol}`;
    await page.goto('/');
    await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
    await page.evaluate(async (source) => {
      const editor = (window as unknown as Host).marklyraEditor;
      await editor.ready;
      await editor.load(source);
    }, source);
    const frame = page.frames().find((f) => f.url().startsWith('http://127.0.0.1:4174/'));
    if (!frame) throw Error('Missing runtime');
    const roots = await frame.evaluate(() => {
      const target = window as unknown as CountedFrame;
      const nodes = target.editor.nodeMap.blocks.toArray();
      const first = nodes[0];
      if (!first) throw Error('Missing block');
      // Prototype wrapper preserves the adapter preflight and counts actual
      // native per-block invocations, including the former second tracking pass.
      const proto = Object.getPrototypeOf(first) as { toMark(): string };
      const original = proto.toMark;
      target.__nodeSerializationCalls = 0;
      proto.toMark = function () {
        target.__nodeSerializationCalls++;
        return original.call(this);
      };
      return nodes.length;
    });
    const actual = await page.evaluate(async () =>
      (window as unknown as Host).marklyraEditor.flush(),
    );
    expect(actual).toBe(source);
    expect(
      await frame.evaluate(() => (window as unknown as CountedFrame).__nodeSerializationCalls),
    ).toBe(roots);
    // The next read must perform another real serialization rather than reuse text.
    await page.evaluate(async () => (window as unknown as Host).marklyraEditor.flush());
    expect(
      await frame.evaluate(() => (window as unknown as CountedFrame).__nodeSerializationCalls),
    ).toBe(roots * 2);
  });
}

for (const runtime of [false, true]) {
  test(`empty contributions share their exact native read (capability=${runtime})`, async ({
    page,
  }) => {
    if (!runtime) {
      const body = await engineWithoutCapability('__MARKLYRA_NATIVE_SERIALIZATION__');
      await page.route('http://127.0.0.1:4174/appsrc/main.js', (route) =>
        route.fulfill({ contentType: 'text/javascript', body }),
      );
    }
    const source = '\uFEFFAlpha\r\n\r\n```js\r\n\r\n```\n\n| a | b |\n|---|---|\n| | y |';
    await page.goto('/');
    await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
    await page.evaluate(async (source) => {
      const editor = (window as unknown as Host).marklyraEditor;
      await editor.ready;
      await editor.load(source);
    }, source);
    const frame = page.frames().find((entry) => entry.url().startsWith('http://127.0.0.1:4174/'));
    if (!frame) throw Error('Missing runtime');
    const roots = await frame.evaluate((expectedCapability) => {
      const target = window as unknown as CountedFrame;
      if (Boolean(Reflect.get(window, '__MARKLYRA_NATIVE_SERIALIZATION__')) !== expectedCapability)
        throw Error('Wrong generated main.js for this test');
      const nodes = target.editor.nodeMap.blocks.toArray();
      target.__nodeSerializationCalls = 0;
      for (const node of nodes) {
        const original = node.toMark;
        // The original whole-map serializer calls its private u, not a root's
        // public toMark. A tracking snapshot replay would call these wrappers.
        node.toMark = function () {
          target.__nodeSerializationCalls++;
          return original.call(this);
        };
      }
      return nodes.length;
    }, runtime);
    expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
      source,
    );
    const calls = await frame.evaluate(
      () => (window as unknown as CountedFrame).__nodeSerializationCalls,
    );
    if (runtime) expect(calls).toBe(0);
    else expect(calls).toBeGreaterThanOrEqual(roots);
    expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
      source,
    );
    const later = await frame.evaluate(
      () => (window as unknown as CountedFrame).__nodeSerializationCalls,
    );
    if (runtime) expect(later).toBe(0);
    else expect(later).toBeGreaterThan(calls);
  });
}
