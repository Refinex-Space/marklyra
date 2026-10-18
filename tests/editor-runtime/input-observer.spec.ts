import { readFile } from 'node:fs/promises';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';
import type { LegacyGlobals } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import {
  advancedErrors,
  advancedFrame,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';

interface Row {
  phase: string;
  type: string;
  trusted: boolean;
  composing: boolean | null;
  data: string | null;
  inputType: string | null;
  target: { cid: string | null; tag: string | null; id: string | null };
}
interface Trace {
  total: number;
  dropped: number;
  records: Row[];
}
type Observed = Window & {
  __MARKLYRA_INPUT_OBSERVER__: { read(): Trace; clear(): void; destroy(): void };
};
async function install(page: import('@playwright/test').Page) {
  const raw = await readFile(
    new URL('../../scripts/lib/input-event-observer.mjs', import.meta.url),
    'utf8',
  );
  expect(raw.match(/export function installInputEventObserver/gu)).toHaveLength(1);
  const source =
    raw.replace('export function installInputEventObserver', 'function installInputEventObserver') +
    '\ninstallInputEventObserver();';
  await advancedFrame(page)
    .locator('body')
    .evaluate((_, source) => {
      const script = document.createElement('script');
      script.textContent = source;
      document.head.append(script);
    }, source);
}
const trace = (page: import('@playwright/test').Page) =>
  advancedFrame(page)
    .locator('body')
    .evaluate(() => (window as unknown as Observed).__MARKLYRA_INPUT_OBSERVER__.read());

test('input observer leaves the editor DOM, focus, source and history untouched, and ignores unrelated controls', async ({
  page,
}) => {
  const source = '\ufeffTrace🙂\r\n';
  await mountAdvanced(page, source);
  const frame = advancedFrame(page);
  await frame.locator('#write > p').click();
  await expect(frame.locator('#write > p')).toHaveClass(/\bmd-focus\b/);
  const before = await frame.locator('#write').evaluate((area) => ({
    html: area.innerHTML,
    active: document.activeElement?.tagName,
    index: (window as unknown as LegacyGlobals).editor?.undo.index,
    commands: (window as unknown as LegacyGlobals).editor?.undo.commandStack.length,
  }));
  await install(page);
  const after = await frame.locator('#write').evaluate((area) => ({
    html: area.innerHTML,
    active: document.activeElement?.tagName,
    index: (window as unknown as LegacyGlobals).editor?.undo.index,
    commands: (window as unknown as LegacyGlobals).editor?.undo.commandStack.length,
  }));
  expect(after).toEqual(before);
  expect(await advancedSource(page)).toBe(source);
  await frame.locator('body').evaluate(() => {
    const outside = document.createElement('input');
    outside.id = 'outside-input';
    document.body.append(outside);
    outside.focus();
    outside.value = 'outside';
    outside.dispatchEvent(
      new InputEvent('input', { bubbles: true, data: 'outside', inputType: 'insertText' }),
    );
  });
  const observed = await trace(page);
  expect(observed.records.some((row) => row.target.id === 'outside-input')).toBe(false);
  expect(observed.records.some((row) => row.data === 'outside')).toBe(false);
  expect(await advancedSource(page)).toBe(source);
  expect(await advancedErrors(page)).toEqual([]);
});

test('trusted direct Unicode insertion is explicitly distinguishable from a system composition', async ({
  page,
}, info) => {
  const source = '\ufeffTrace🙂\r\n';
  await mountAdvanced(page, source);
  await install(page);
  const frame = advancedFrame(page);
  await frame.locator('#write > p').evaluate((element) => {
    (document.getElementById('write') as HTMLElement).focus();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let last: Node | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) last = node;
    if (!last) throw Error('Missing text');
    const end = last.textContent?.length ?? 0;
    getSelection()?.setBaseAndExtent(last, end, last, end);
  });
  await page.keyboard.insertText('中文🙂');
  expect(await advancedSource(page)).toBe(source.replace('Trace🙂', 'Trace🙂中文🙂'));
  const observed = await trace(page);
  expect(
    observed.records.some((row) => row.type === 'input' && row.trusted && row.data === '中文🙂'),
  ).toBe(true);
  expect(observed.records.some((row) => row.type.startsWith('composition'))).toBe(false);
  await info.attach('direct-text-not-ime', {
    body: JSON.stringify(observed),
    contentType: 'application/json',
  });
  expect(await advancedErrors(page)).toEqual([]);
});

test('synthetic composition is recorded as untrusted and never promoted to real IME evidence', async ({
  page,
}, info) => {
  const source = 'Trace🙂\n';
  await mountAdvanced(page, source);
  await install(page);
  const frame = advancedFrame(page);
  await frame.locator('#write > p').evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'p' }));
    element.dispatchEvent(
      new CompositionEvent('compositionupdate', { bubbles: true, data: 'pin' }),
    );
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '拼' }));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor.isComposing,
      ),
    )
    .toBe(false);
  const observed = await trace(page),
    composition = observed.records.filter((row) => row.type.startsWith('composition'));
  expect(composition.length).toBeGreaterThan(0);
  expect(composition.every((row) => !row.trusted)).toBe(true);
  expect(await advancedSource(page)).toBe(source);
  await info.attach('synthetic-not-system-preedit', {
    body: JSON.stringify(observed),
    contentType: 'application/json',
  });
  expect(await advancedErrors(page)).toEqual([]);
});

test('input trace is bounded and its destroy operation stops queued observations', async ({
  page,
}) => {
  const source = 'Trace\n';
  await mountAdvanced(page, source);
  await install(page);
  const frame = advancedFrame(page);
  await frame.locator('#write > p').evaluate((element) => {
    for (let index = 0; index < 160; index++)
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowLeft' }));
  });
  const observed = await trace(page);
  expect(observed.total).toBeGreaterThan(256);
  expect(observed.records).toHaveLength(256);
  expect(observed.dropped).toBe(observed.total - 256);
  await frame.locator('body').evaluate(() => {
    (window as unknown as Observed).__MARKLYRA_INPUT_OBSERVER__.destroy();
  });
  await expect(frame.getByRole('textbox', { name: 'Input event trace (read only)' })).toHaveCount(
    0,
  );
  expect(
    await frame.locator('body').evaluate(() => Reflect.has(window, '__MARKLYRA_INPUT_OBSERVER__')),
  ).toBe(false);
  expect(await advancedSource(page)).toBe(source);
  expect(await advancedErrors(page)).toEqual([]);
});

test('frozen AX chunks transfer the exact Unicode event JSON below the per-node text limit', async ({
  page,
}, info) => {
  await mountAdvanced(page, 'Trace\n');
  await install(page);
  const frame = advancedFrame(page);
  await frame.locator('#write > p').evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'p' }));
    element.dispatchEvent(
      new CompositionEvent('compositionupdate', { bubbles: true, data: '拼🙂é한글' }),
    );
    element.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true, data: '拼🙂é한글' }),
    );
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor.isComposing,
      ),
    )
    .toBe(false);
  await frame.getByRole('button', { name: 'Input freeze trace', exact: true }).click();
  const expected = await trace(page),
    parts: string[] = [];
  for (let index = 0; index < 400; index++) {
    const text = await frame
        .getByRole('textbox', { name: 'Input event trace (read only)', exact: true })
        .inputValue(),
      match = /^MARKLYRA_CHUNK (\d+)\/(\d+)\n([\s\S]*)\nMARKLYRA_CHUNK_END$/u.exec(text);
    if (!match) throw Error('Missing AX chunk markers');
    expect(Number(match[1])).toBe(index + 1);
    expect(text.length).toBeLessThan(400);
    expect(/[^\x20-\x7e\n]/u.test(text)).toBe(false);
    parts.push(match[3] ?? '');
    if (index + 1 === Number(match[2])) break;
    await frame.getByRole('button', { name: 'Input next trace chunk', exact: true }).click();
  }
  expect(JSON.parse(parts.join(''))).toEqual(expected);
  expect((await trace(page)).total).toBe(expected.total);
  expect(await advancedSource(page)).toBe('Trace\n');
  await info.attach('AX-transport', {
    body: JSON.stringify({
      chunks: parts.length,
      events: expected.total,
      exactUnicode: true,
      sourceUntouched: true,
    }),
    contentType: 'application/json',
  });
  expect(await advancedErrors(page)).toEqual([]);
});
