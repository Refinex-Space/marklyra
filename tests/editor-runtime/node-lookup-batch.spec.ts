import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { RuntimeNodeLookup } from '../../packages/editor-runtime/src/runtime/node-lookup.js';

const moduleUrl = `/@fs${fileURLToPath(new URL('../../packages/editor-runtime/src/runtime/node-lookup.ts', import.meta.url))}`;

test('image batch indexes once and preserves first-match semantics through synchronous mutations', async ({
  page,
}) => {
  await page.route('**/__batch_lookup__', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  );
  await page.goto('/__batch_lookup__');
  const result = await page.evaluate(async (url) => {
    const { RuntimeNodeLookup: Lookup } = (await import(url)) as {
      RuntimeNodeLookup: typeof RuntimeNodeLookup;
    };
    const area = document.createElement('div');
    area.innerHTML = Array.from(
      { length: 1000 },
      (_, i) => `<p cid="n${i}"><span>text</span></p>`,
    ).join('');
    document.body.append(area);
    const query = area.querySelector;
    let queries = 0;
    area.querySelector = function <E extends Element = Element>(selector: string): E | null {
      queries++;
      return query.call(this, selector) as E | null;
    };
    const editor = {
      writingArea: area,
      findElemById(id: unknown) {
        return [query.call(this.writingArea, `[cid="${String(id)}"]`)];
      },
    };
    const original = editor.findElemById;
    const lookup = Lookup.install(editor, (element: Element | null) => [element]);
    if (!lookup) throw Error('No lookup');
    const ids = Array.from({ length: 1000 }, (_, i) => `n${i}`);
    const exact: boolean[] = [];
    const check = (id: string) =>
      exact.push(editor.findElemById(id)[0] === original.call(editor, id)[0]);
    let firstPassQueries = -1;
    lookup.batch([...ids, 'new'], () => {
      for (const id of ids) check(id);
      firstPassQueries = queries;
      const duplicate = document.createElement('p');
      duplicate.setAttribute('cid', 'n500');
      area.prepend(duplicate);
      check('n500');
      area.append(duplicate);
      check('n500');
      duplicate.setAttribute('cid', 'new');
      check('new');
      query.call(area, '[cid="n501"]')?.replaceWith(duplicate);
      check('n501');
      check('new');
      lookup.batch(['n500', 'new'], () => {
        duplicate.remove();
        check('new');
        check('n500');
      });
      area.innerHTML = '<p cid="n500">replacement</p>';
      check('n500');
      check('n900');
      const second = document.createElement('div');
      second.innerHTML = '<p cid="n500">new root</p>';
      editor.writingArea = second;
      check('n500');
      check('n0');
    });
    lookup.dispose();
    return { exact, firstPassQueries, restored: editor.findElemById === original };
  }, moduleUrl);
  expect(result.exact.every(Boolean)).toBe(true);
  expect(result.firstPassQueries).toBe(0);
  expect(result.restored).toBe(true);
});

test('batch releases its index after throws and disposal without retaining stale nodes', async ({
  page,
}) => {
  await page.route('**/__batch_lookup__', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  );
  await page.goto('/__batch_lookup__');
  const result = await page.evaluate(async (url) => {
    const { RuntimeNodeLookup: Lookup } = (await import(url)) as {
      RuntimeNodeLookup: typeof RuntimeNodeLookup;
    };
    const area = document.createElement('div');
    area.innerHTML = '<p cid="a">old</p><p cid="b">B</p>';
    const editor = {
      writingArea: area,
      findElemById(id: unknown) {
        return [area.querySelector(`[cid="${String(id)}"]`)];
      },
    };
    const original = editor.findElemById;
    const lookup = Lookup.install(editor, (element: Element | null) => [element]);
    if (!lookup) throw Error('No lookup');
    let thrown = '';
    try {
      lookup.batch(['a', 'b'], () => {
        editor.findElemById('a');
        throw Error('expected');
      });
    } catch (error) {
      thrown = String(error);
    }
    area.innerHTML = '<p cid="a">new</p><p cid="b">B</p>';
    const afterThrow = editor.findElemById('a')[0]?.textContent;
    lookup.batch(['a', 'b'], () => lookup.dispose());
    return { thrown, afterThrow, restored: editor.findElemById === original };
  }, moduleUrl);
  expect(result.thrown).toContain('expected');
  expect(result.afterThrow).toBe('new');
  expect(result.restored).toBe(true);
});
