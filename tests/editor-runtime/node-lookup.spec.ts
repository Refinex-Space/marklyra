import { fileURLToPath } from 'node:url';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import type { installNodeLookup } from '../../packages/editor-runtime/src/runtime/node-lookup.js';

const moduleUrl = `http://127.0.0.1:4173/@fs${fileURLToPath(
  new URL('../../packages/editor-runtime/src/runtime/node-lookup.ts', import.meta.url),
)}`;
type Module = { installNodeLookup: typeof installNodeLookup };
interface NativeEditor {
  writingArea: HTMLElement;
  findElemById(...args: unknown[]): { length: number; [index: number]: Element };
}
type NativeWindow = Window & {
  editor: NativeEditor;
  $: (element: Element | null) => { length: number; [index: number]: Element };
};
type HostWindow = Window & { marklyraEditor: MarkLyraEditor };
async function emptyPage(page: Page) {
  await page.route('**/__lookup_fixture__', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  );
  await page.goto('/__lookup_fixture__');
}

test('DOM lookup invalidates duplicate order, moves, negative hits and cid changes before delivery', async ({
  page,
}) => {
  await emptyPage(page);
  const result = await page.evaluate(async (url) => {
    const { installNodeLookup: install } = (await import(url)) as Module;
    const area = document.createElement('div');
    area.innerHTML = '<p cid="a">A</p><section><p cid="b">B</p></section><p cid="a">A2</p>';
    document.body.append(area);
    const jquery = (element: Element | null) => (element ? [element] : []);
    const editor = {
      writingArea: area,
      findElemById(id: unknown) {
        return jquery(id ? this.writingArea.querySelector(`[cid="${id}"]`) : null);
      },
    };
    const original = editor.findElemById;
    const lookup = install(editor, jquery);
    if (!lookup) throw Error('Lookup installation failed');
    const observations: { label: string; exact: boolean }[] = [];
    const check = (label: string, id: string) => {
      const actual = editor.findElemById(id),
        expected = original.call(editor, id);
      observations.push({
        label,
        exact: actual.length === expected.length && actual[0] === expected[0],
      });
    };
    check('initial duplicate first', 'a');
    check('negative', 'new');
    const duplicate = document.createElement('p');
    duplicate.setAttribute('cid', 'a');
    area.prepend(duplicate);
    check('earlier duplicate while old result connected', 'a');
    area.append(duplicate);
    check('move first duplicate to end', 'a');
    const earlier = area.querySelector('[cid="a"]');
    if (!earlier) throw Error('Missing earlier duplicate');
    earlier.setAttribute('cid', 'new');
    check('old cid after rename', 'a');
    check('negative cache after rename', 'new');
    earlier.removeAttribute('cid');
    check('attribute removal', 'new');
    const subtree = document.createElement('section');
    subtree.innerHTML = '<section><p cid="new">New</p><p cid="a">Nested first</p></section>';
    area.prepend(subtree);
    check('negative after nested insertion', 'new');
    check('earlier nested duplicate', 'a');
    subtree.remove();
    subtree.querySelector('[cid="new"]')?.setAttribute('cid', 'changed-away');
    check('removed subtree changed while detached', 'new');
    check('removed duplicate subtree', 'a');
    area.querySelector('[cid="b"]')?.replaceWith(duplicate);
    check('moving existing duplicate replaces another cid', 'b');
    check('moving existing duplicate changes first match', 'a');
    area.innerHTML = '<p cid="a">replacement same cid</p>';
    check('innerHTML replacement with reused cid', 'a');
    const secondRoot = document.createElement('div');
    secondRoot.innerHTML = '<p cid="a">second root</p>';
    editor.writingArea = secondRoot;
    check('dynamic detached root', 'a');
    area.innerHTML = '<p cid="a">old root mutation</p>';
    check('old root no longer owns lookup', 'a');
    secondRoot.setAttribute('cid', 'root-only');
    check('query excludes root itself', 'root-only');
    secondRoot.firstElementChild?.remove();
    await Promise.resolve();
    check('observer callback invalidation', 'a');
    lookup.dispose();
    return { observations, restored: editor.findElemById === original };
  }, moduleUrl);
  expect(result.observations.length).toBe(18);
  expect(result.observations.filter((item) => !item.exact)).toEqual([]);
  expect(result.restored).toBe(true);
});

test('lookup uses fresh wrappers, targeted invalidation and a bounded cache', async ({ page }) => {
  await emptyPage(page);
  const result = await page.evaluate(async (url) => {
    const { installNodeLookup: install } = (await import(url)) as Module;
    const area = document.createElement('div');
    area.innerHTML = Array.from({ length: 520 }, (_, at) => `<p cid="n${at}">${at}</p>`).join('');
    let calls = 0;
    const query = area.querySelector;
    Object.defineProperty(area, 'querySelector', {
      value(this: Element, selector: string) {
        calls++;
        return query.call(this, selector);
      },
    });
    const jquery = (element: Element | null) => (element ? [element] : []);
    const editor = {
      writingArea: area,
      findElemById(id: unknown) {
        return jquery(id ? this.writingArea.querySelector(`[cid="${id}"]`) : null);
      },
    };
    const lookup = install(editor, jquery);
    if (!lookup) throw Error('Lookup installation failed');
    const first = editor.findElemById('n0');
    first.length = 0;
    const second = editor.findElemById('n0');
    const initialCalls = calls;
    area.lastElementChild?.setAttribute('cid', 'renamed');
    area.firstElementChild?.setAttribute('class', 'unrelated');
    if (area.firstElementChild) area.firstElementChild.textContent = 'changed text';
    editor.findElemById('n0');
    const afterUnrelated = calls;
    for (let at = 1; at <= 512; at++) editor.findElemById(`n${at}`);
    const beforeEvicted = calls;
    editor.findElemById('n0');
    const evictionQueries = calls - beforeEvicted;
    // More than the subtree scan budget: clear, without requiring a whole-tree scan.
    const large = document.createElement('section');
    large.innerHTML = '<i></i>'.repeat(2_050);
    area.append(large);
    const beforeLarge = calls;
    editor.findElemById('n0');
    const largeQueries = calls - beforeLarge;
    const beforeHit = calls;
    editor.findElemById('n0');
    const cachedAfterLarge = calls === beforeHit;
    lookup.dispose();
    return {
      fresh: first !== second && second.length === 1,
      initialCalls,
      afterUnrelated,
      evictionQueries,
      largeQueries,
      cachedAfterLarge,
    };
  }, moduleUrl);
  expect(result).toEqual({
    fresh: true,
    initialCalls: 1,
    afterUnrelated: 1,
    evictionQueries: 1,
    largeQueries: 1,
    cachedAfterLarge: true,
  });
});

test('unsupported calls preserve native coercion, receiver and descriptor lifecycle', async ({
  page,
}) => {
  await emptyPage(page);
  const result = await page.evaluate(async (url) => {
    const { installNodeLookup: install } = (await import(url)) as Module;
    const area = document.createElement('div');
    area.innerHTML = '<p cid="a">A</p><p cid="1">One</p><p cid="中文">Chinese</p>';
    const jquery = (element: Element | null) => (element ? [element] : []);
    let nativeCalls = 0;
    const proto = {
      findElemById(this: { writingArea: HTMLElement }, id?: unknown) {
        nativeCalls++;
        return jquery(id ? this.writingArea.querySelector(`[cid="${id}"]`) : null);
      },
    };
    const editor = Object.assign(
      Object.create(proto) as typeof proto & { writingArea: HTMLElement },
      {
        writingArea: area,
      },
    );
    const lookup = install(editor, jquery);
    if (!lookup) throw Error('Lookup installation failed');
    const again = install(editor, jquery);
    const calls: unknown[][] = [
      [],
      [null],
      [''],
      [0],
      [1],
      ['中文'],
      ['a', 'extra'],
      [{ toString: () => 'a' }],
      ['a\n'],
    ];
    const results = calls.map((args) => {
      const read = (method: typeof editor.findElemById) => {
        try {
          return { text: Reflect.apply(method, editor, args)[0]?.textContent ?? null };
        } catch (error) {
          return { error: error instanceof Error ? error.name : String(error) };
        }
      };
      const at = nativeCalls;
      const actual = read(editor.findElemById);
      const delegated = nativeCalls === at + 1;
      return {
        exact: JSON.stringify(actual) === JSON.stringify(read(proto.findElemById)),
        delegated,
      };
    });
    const other = { writingArea: document.createElement('div') };
    other.writingArea.innerHTML = '<p cid="a">Other</p>';
    const receiver = editor.findElemById.call(other, 'a')[0]?.textContent;
    lookup.dispose();
    const inheritedRestored =
      !Object.hasOwn(editor, 'findElemById') && editor.findElemById === proto.findElemById;
    const second = install(editor, jquery);
    const replacement = () => [];
    editor.findElemById = replacement;
    second?.dispose();
    const replacementPreserved = editor.findElemById === replacement;
    const locked = { writingArea: area };
    Object.defineProperty(locked, 'findElemById', { value: proto.findElemById, writable: false });
    const lockedRejected = install(locked, jquery) === undefined;
    return {
      results,
      sameHandle: again === lookup,
      receiver,
      inheritedRestored,
      replacementPreserved,
      lockedRejected,
    };
  }, moduleUrl);
  expect(result.results.every((item) => item.exact && item.delegated)).toBe(true);
  expect(result).toMatchObject({
    sameHandle: true,
    receiver: 'Other',
    inheritedRestored: true,
    replacementPreserved: true,
    lockedRejected: true,
  });
});

test('native jQuery lookup retains source, selection and history through edits and loads', async ({
  page,
}) => {
  const module = await page.request.get(moduleUrl);
  expect(module.ok()).toBe(true);
  const frameModule = 'http://127.0.0.1:4174/__node-lookup-probe__.js';
  const body = await module.text();
  await page.route(frameModule, (route) => route.fulfill({ contentType: 'text/javascript', body }));
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as HostWindow).marklyraEditor));
  const source = '\uFEFF# Heading\r\n\r\nAlpha **bold** 中文😀\n\nTail';
  await page.evaluate(async (source) => {
    const editor = (window as unknown as HostWindow).marklyraEditor;
    await editor.ready;
    await editor.load(source);
    editor.focus();
  }, source);
  const frame = page.frames().find((entry) => entry.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing runtime frame');
  const native = await frame.evaluate(async (url) => {
    const { installNodeLookup: install } = (await import(url)) as Module;
    const host = window as unknown as NativeWindow;
    const original = host.editor.findElemById;
    const lookup = install(host.editor, host.$);
    if (!lookup) throw Error('Lookup installation failed');
    const area = host.editor.writingArea;
    const id = area.lastElementChild?.getAttribute('cid');
    if (!id) throw Error('Missing tail cid');
    const expected = original.call(host.editor, id);
    const first = host.editor.findElemById(id);
    first.length = 0;
    const second = host.editor.findElemById(id);
    const paragraph = second[0];
    if (!paragraph) throw Error('Missing native lookup result');
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let tail: Node | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) tail = node;
    if (!tail) throw Error('Missing tail text');
    const selection = getSelection();
    selection?.setBaseAndExtent(
      tail,
      tail.textContent?.length ?? 0,
      tail,
      tail.textContent?.length ?? 0,
    );
    return { fresh: first !== second, exact: second[0] === expected[0], length: second.length };
  }, frameModule);
  expect(native).toEqual({ fresh: true, exact: true, length: 1 });
  await page.keyboard.type('X');
  const flush = () => page.evaluate(() => (window as unknown as HostWindow).marklyraEditor.flush());
  expect(await flush()).toBe(source + 'X');
  await page.evaluate(() =>
    (window as unknown as HostWindow).marklyraEditor.execute({ type: 'undo' }),
  );
  expect(await flush()).toBe(source);
  await page.evaluate(() =>
    (window as unknown as HostWindow).marklyraEditor.execute({ type: 'redo' }),
  );
  expect(await flush()).toBe(source + 'X');
  await page.evaluate(async () => {
    const editor = (window as unknown as HostWindow).marklyraEditor;
    await editor.execute({ type: 'toggleSource' });
    await editor.execute({ type: 'toggleSource' });
  });
  expect(await flush()).toBe(source + 'X');
  const next = 'New\r\n\r\nLast';
  await page.evaluate(
    (source) => (window as unknown as HostWindow).marklyraEditor.load(source),
    next,
  );
  expect(await flush()).toBe(next);
  const exact = await frame.evaluate(() => {
    const editor = (window as unknown as NativeWindow).editor;
    return Array.from(editor.writingArea.querySelectorAll('[cid]')).every((element) => {
      const id = element.getAttribute('cid');
      return id && editor.findElemById(id)[0] === editor.writingArea.querySelector(`[cid="${id}"]`);
    });
  });
  expect(exact).toBe(true);
});

test('seeded real DOM mutations preserve the first matching cid across observer delivery boundaries', async ({
  page,
}) => {
  await emptyPage(page);
  const result = await page.evaluate(async (url) => {
    const { installNodeLookup: install } = (await import(url)) as Module;
    const root = document.createElement('div');
    const outside = document.createElement('aside');
    document.body.append(root, outside);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'always-missing'];
    let seed = 0x6d2b79f5;
    const random = (length: number) => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) % length;
    };
    let serial = 0;
    const leaf = (id = ids[random(ids.length - 1)] ?? 'a') => {
      const element = document.createElement('p');
      element.setAttribute('data-oracle', String(++serial));
      element.setAttribute('cid', id);
      element.textContent = `Node ${serial}`;
      return element;
    };
    const choose = (area: Element): HTMLElement | undefined => {
      const nodes = area.querySelectorAll<HTMLElement>('[data-oracle]');
      return nodes[random(Math.max(1, nodes.length))];
    };
    const jquery = (element: Element | null) => (element ? [element] : []);
    const editor = {
      writingArea: root,
      findElemById(id: unknown) {
        return jquery(id ? this.writingArea.querySelector(`[cid="${id}"]`) : null);
      },
    };
    const lookup = install(editor, jquery);
    if (!lookup) throw Error('Lookup installation failed');
    root.append(leaf('a'), leaf('a'), leaf('b'));
    let comparisons = 0;
    const compare = (step: number, boundary: string) => {
      for (const id of ids) {
        const actual = editor.findElemById(id);
        const expected = root.querySelector(`[cid="${id}"]`);
        if (actual.length !== Number(Boolean(expected)) || (actual[0] ?? null) !== expected)
          throw Error(
            `seed=0x6d2b79f5 step=${step} boundary=${boundary} cid=${id} ` +
              `expected=${expected?.getAttribute('data-oracle')} actual=${actual[0]?.getAttribute('data-oracle')}`,
          );
        comparisons++;
      }
    };
    const operations = Array.from({ length: 8 }, () => 0);
    let microtasks = 0;
    compare(-1, 'initial');
    for (let step = 0; step < 400; step++) {
      if (!root.firstElementChild) root.append(leaf());
      const node = choose(root);
      if (!node) throw Error('Missing root fixture node');
      const operation = step % operations.length;
      operations[operation] = (operations[operation] ?? 0) + 1;
      switch (operation) {
        case 0:
          root.append(leaf());
          break;
        case 1:
          root.prepend(leaf(node.getAttribute('cid') ?? 'a'));
          break;
        case 2:
          outside.append(node);
          break;
        case 3:
          if (random(4)) node.setAttribute('cid', ids[random(ids.length - 1)] ?? 'a');
          else node.removeAttribute('cid');
          break;
        case 4: {
          const returning = choose(outside) ?? leaf();
          returning.setAttribute('cid', ids[random(ids.length - 1)] ?? 'b');
          if (random(2)) root.prepend(returning);
          else root.append(returning);
          break;
        }
        case 5:
          node.remove();
          break;
        case 6: {
          const subtree = document.createElement('section');
          subtree.setAttribute('data-oracle', String(++serial));
          subtree.append(leaf(), leaf());
          node.replaceWith(subtree);
          break;
        }
        case 7: {
          const oldId = node.getAttribute('cid') ?? 'c';
          outside.append(node);
          node.setAttribute('cid', ids[random(ids.length - 1)] ?? 'd');
          if (random(2)) {
            // Deliver the removal before the detached subtree mutates again.
            await Promise.resolve();
            microtasks++;
          }
          const nested = choose(node) ?? node;
          nested.setAttribute('cid', ids[random(ids.length - 1)] ?? 'e');
          root.prepend(leaf(oldId));
          root.append(node);
          break;
        }
      }
      // Keep the fixture small, with detached subtrees retained in `outside` so
      // their cid mutations exercise the browser's transient observation rules.
      if (root.querySelectorAll('[data-oracle]').length > 70) root.firstElementChild?.remove();
      if (outside.querySelectorAll('[data-oracle]').length > 70)
        outside.firstElementChild?.remove();
      if (random(3) === 0) {
        await Promise.resolve();
        microtasks++;
        compare(step, 'after observer microtask');
      } else compare(step, 'synchronous takeRecords');
      // A second immediate lookup also verifies the freshly cached first match.
      compare(step, 'repeated read');
    }
    lookup.dispose();
    return { seed: '0x6d2b79f5', steps: 400, comparisons, microtasks, operations };
  }, moduleUrl);
  expect(result.seed).toBe('0x6d2b79f5');
  expect(result.steps).toBe(400);
  expect(result.comparisons).toBe(5_607);
  expect(result.operations).toEqual(Array.from({ length: 8 }, () => 50));
  expect(result.microtasks).toBeGreaterThan(100);
});
