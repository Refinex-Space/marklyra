import { fileURLToPath } from 'node:url';
import type { MarkLyraEditor, OutlineEntry } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';
import type { RuntimeOutline } from '../../packages/editor-runtime/src/runtime/outline.js';

type Host = Window & {
  marklyraEditor: MarkLyraEditor;
  outlineEvents: OutlineEntry[][];
  outlineErrors: string[];
};
const selector = 'h1[cid],h2[cid],h3[cid],h4[cid],h5[cid],h6[cid]';

test('empty initialization still notifies once and loading headings then plain text clears the outline', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  const result = await page.evaluate(async () => {
    const host = window as unknown as Host;
    await host.marklyraEditor.ready;
    const old = host.marklyraEditor,
      mount = old.element.parentElement;
    if (!mount) throw Error('Missing mount');
    const Constructor = old.constructor as typeof MarkLyraEditor;
    old.destroy();
    const events: OutlineEntry[][] = [];
    host.marklyraEditor = new Constructor(mount, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: '',
      onOutlineChange: (entries) => events.push(entries.map((entry) => ({ ...entry }))),
    });
    await host.marklyraEditor.ready;
    await host.marklyraEditor.flush();
    const initial = events.map((entries) => [...entries]);
    await host.marklyraEditor.load('# Heading');
    await host.marklyraEditor.load('Plain');
    return { initial, events, outline: host.marklyraEditor.getOutline() };
  });
  expect(result.initial).toEqual([[]]);
  expect(result.events).toHaveLength(3);
  expect(result.events[1]?.map(({ level, text }) => ({ level, text }))).toEqual([
    { level: 1, text: 'Heading' },
  ]);
  expect(result.events[2]).toEqual([]);
  expect(result.outline).toEqual([]);
});

test('outline observer tracks actual DOM dependencies synchronously and disconnects old roots', async ({
  page,
}) => {
  await page.goto('/');
  const module = `/@fs${fileURLToPath(
    new URL('../../packages/editor-runtime/src/runtime/outline.ts', import.meta.url),
  )}`;
  const observations = await page.evaluate(async (module) => {
    const { RuntimeOutline: Constructor } = (await import(module)) as {
      RuntimeOutline: typeof RuntimeOutline;
    };
    const outline = new Constructor();
    const root = document.createElement('div');
    root.innerHTML = '<h1 cid="first">First <em>title</em></h1><p>Body</p>';
    const paragraph = root.querySelector('p');
    const first = root.querySelector('h1');
    if (!paragraph || !first) throw Error('Missing fixture');
    const result: { label: string; entries: OutlineEntry[]; reused: boolean }[] = [];
    let previous: OutlineEntry[] | undefined;
    const record = (label: string, area: HTMLElement | null = root) => {
      const entries = outline.read(area);
      result.push({
        label,
        entries: entries.map((entry) => ({ ...entry })),
        reused: entries === previous,
      });
      previous = entries;
    };
    record('initial');
    paragraph.textContent = 'Changed body';
    record('body');
    const emphasis = first.querySelector('em');
    if (!emphasis?.firstChild) throw Error('Missing inline text');
    emphasis.firstChild.nodeValue = 'changed';
    record('heading text');
    first.setAttribute('cid', 'renamed');
    record('cid');
    const wrapper = document.createElement('section');
    wrapper.innerHTML = '<h2 cid="second">Second</h2>';
    root.prepend(wrapper);
    record('nested addition');
    root.append(wrapper);
    record('reorder');
    first.removeAttribute('cid');
    record('remove cid');
    wrapper.remove();
    record('remove subtree');
    const replacement = document.createElement('div');
    replacement.innerHTML = '<h3 cid="new">New root</h3>';
    record('replace root', replacement);
    first.setAttribute('cid', 'old detached');
    record('old root mutation', replacement);
    outline.dispose();
    record('disposed empty', null);
    outline.dispose();
    return result;
  }, module);
  expect(observations).toEqual([
    { label: 'initial', entries: [{ id: 'first', level: 1, text: 'First title' }], reused: false },
    { label: 'body', entries: [{ id: 'first', level: 1, text: 'First title' }], reused: true },
    {
      label: 'heading text',
      entries: [{ id: 'first', level: 1, text: 'First changed' }],
      reused: false,
    },
    { label: 'cid', entries: [{ id: 'renamed', level: 1, text: 'First changed' }], reused: false },
    {
      label: 'nested addition',
      entries: [
        { id: 'second', level: 2, text: 'Second' },
        { id: 'renamed', level: 1, text: 'First changed' },
      ],
      reused: false,
    },
    {
      label: 'reorder',
      entries: [
        { id: 'renamed', level: 1, text: 'First changed' },
        { id: 'second', level: 2, text: 'Second' },
      ],
      reused: false,
    },
    { label: 'remove cid', entries: [{ id: 'second', level: 2, text: 'Second' }], reused: false },
    { label: 'remove subtree', entries: [], reused: false },
    { label: 'replace root', entries: [{ id: 'new', level: 3, text: 'New root' }], reused: false },
    {
      label: 'old root mutation',
      entries: [{ id: 'new', level: 3, text: 'New root' }],
      reused: true,
    },
    { label: 'disposed empty', entries: [], reused: false },
  ]);
});

test('body input and repeated flush do not rescan or notify an unchanged outline', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async () => {
    const host = window as unknown as Host;
    await host.marklyraEditor.ready;
    const old = host.marklyraEditor,
      mount = old.element.parentElement;
    if (!mount) throw Error('Missing mount');
    const Constructor = old.constructor as typeof MarkLyraEditor;
    old.destroy();
    host.outlineEvents = [];
    host.outlineErrors = [];
    host.marklyraEditor = new Constructor(mount, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: '\uFEFF# First\r\n\r\nBody\n\n## Last',
      onOutlineChange: (value) => host.outlineEvents.push(value.map((entry) => ({ ...entry }))),
      onError: (error) => host.outlineErrors.push(String(error)),
    });
    await host.marklyraEditor.ready;
  });
  const frame = page.frames().find((frame) => frame.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing runtime');
  const body = frame.locator('#write > p');
  await body.click();
  await body.evaluate((element) => {
    const walker = document.createTreeWalker(element, 4);
    const text = walker.nextNode();
    if (!text) throw Error('Missing body text');
    const range = document.createRange();
    range.setStart(text, text.textContent?.length ?? 0);
    range.collapse(true);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
  await frame.evaluate(() => {
    const area = document.getElementById('write');
    if (!area) throw Error('Missing area');
    Reflect.set(window, 'outlineScans', 0);
    for (const receiver of [area, document]) {
      const original = receiver.querySelectorAll;
      Reflect.set(
        receiver,
        'querySelectorAll',
        function (this: Document | HTMLElement, ...args: unknown[]) {
          if (typeof args[0] === 'string' && args[0].includes('h1[cid]'))
            Reflect.set(window, 'outlineScans', Number(Reflect.get(window, 'outlineScans')) + 1);
          return Reflect.apply(original, this, args);
        },
      );
    }
  });
  const before = await page.evaluate(() => (window as unknown as Host).outlineEvents.length);
  await page.keyboard.type('X');
  for (let count = 0; count < 3; count++)
    expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
      '\uFEFF# First\r\n\r\nBodyX\n\n## Last',
    );
  expect(await frame.evaluate(() => Reflect.get(window, 'outlineScans'))).toBe(0);
  expect(await page.evaluate(() => (window as unknown as Host).outlineEvents.length)).toBe(before);
  // Heading conversion and history must still refresh the same outline.
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'heading', level: 2 }),
  );
  for (const type of ['undo', 'redo'] as const) {
    const actual = await page.evaluate(() =>
      (window as unknown as Host).marklyraEditor.getOutline(),
    );
    const visible = await frame.locator(selector).evaluateAll((nodes) =>
      nodes.map((element) => ({
        id: element.getAttribute('cid') ?? '',
        level: Number(element.tagName[1]),
        text: element.textContent ?? '',
      })),
    );
    expect(actual).toEqual(visible);
    expect(actual).toHaveLength(type === 'undo' ? 3 : 2);
    await page.evaluate(
      (type) => (window as unknown as Host).marklyraEditor.execute({ type }),
      type,
    );
  }
  expect(
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.getOutline()),
  ).toHaveLength(3);
  expect(await page.evaluate(() => (window as unknown as Host).outlineErrors)).toEqual([]);
});
