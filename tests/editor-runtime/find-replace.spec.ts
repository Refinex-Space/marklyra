import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Frame, type Page, test } from '@playwright/test';
import type { LegacyGlobals } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type Host = Window & { marklyraEditor: MarkLyraEditor };
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const caught: string[] = [];
  errors.set(page, caught);
  page.on('pageerror', (error) => caught.push(error.message));
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function mount(page: Page, source: string, sourceMode = false): Promise<Frame> {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(
    async ({ source, sourceMode }) => {
      const editor = (window as unknown as Host).marklyraEditor;
      await editor.ready;
      await editor.load(source);
      if (sourceMode) {
        await editor.execute({ type: 'toggleSource' });
        await editor.execute({ type: 'sourcePosition', line: 1, column: 1 });
      }
      await editor.execute({ type: 'find', replace: true });
    },
    { source, sourceMode },
  );
  const frame = page.frames().find((frame) => frame.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing runtime runtime');
  await expect(frame.locator('#md-searchpanel')).toBeVisible();
  return frame;
}

async function raw(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
}

async function search(frame: Frame, query: string, regex: boolean, count: number) {
  const toggle = frame.locator('#searchpanel-regexp-option-btn');
  if ((await toggle.getAttribute('class'))?.split(/\s/).includes('active') !== regex)
    await toggle.click();
  await frame.locator('#search-panel-input').fill(query);
  await expect(frame.locator('#search-panel-status')).toHaveText(new RegExp(`^\\d+ / ${count}$`));
}

async function history(page: Page, original: string, edited: string) {
  // These are actual original model/CodeMirror history operations, not a reload.
  for (const [type, expected] of [
    ['undo', original],
    ['redo', edited],
    ['undo', original],
  ] as const) {
    await page.evaluate(
      (type) => (window as unknown as Host).marklyraEditor.execute({ type }),
      type,
    );
    expect(await raw(page)).toBe(expected);
  }
}

test('original Unicode literal replacement preserves untouched BOM, mixed EOL, escapes and code through history', async ({
  page,
}) => {
  const original =
    '\uFEFF# Search\r\n\r\n前🙂 e\u0301 你好🙂 / 你好🙂\n\nKeep \\*literal\\* &amp;  \r\n\r\n```text\nuntouched\r\n```\n';
  const frame = await mount(page, original);
  const root = await frame.locator('#write').elementHandle();
  const untouched = await frame.locator('#write > p').last().elementHandle();
  await search(frame, '你好🙂', false, 2);
  await expect(frame.locator('.md-search-select')).toHaveText('你好🙂');
  await frame.locator('#search-panel-replace-input').fill('再见🧑‍💻');
  await frame.locator('#search-panel-replace-btn').click();
  const edited = original.replace('你好🙂', '再见🧑‍💻');
  expect(await raw(page)).toBe(edited);
  expect(await root?.evaluate((node) => node === document.getElementById('write'))).toBe(true);
  expect(await untouched?.evaluate((node) => node.isConnected)).toBe(true);
  await history(page, original, edited);
});

test('original JS regex captures replace every Unicode match as one undoable operation', async ({
  page,
}) => {
  const original =
    '\uFEFF# 你好🙂\r\n\r\n前🙂 你好🙂 中间 你好🙂\n\nKeep \\*literal\\* &amp;  \r\n';
  const frame = await mount(page, original);
  const untouched = await frame.locator('#write > p').last().elementHandle();
  await search(frame, '(你好)(🙂)', true, 3);
  await frame.locator('#search-panel-replace-input').fill('$2-$1');
  await frame.locator('#search-panel-replaceall-btn').click();
  const edited = original.replaceAll('你好🙂', '🙂-你好');
  expect(await raw(page)).toBe(edited);
  await expect(frame.locator('#searchpanel-msg-content')).toContainText('3');
  expect(await untouched?.evaluate((node) => node.isConnected)).toBe(true);
  await history(page, original, edited);
});

test('original regex single replacement retains lookaround context and capture expansion', async ({
  page,
}) => {
  const original = '\uFEFF# Regex\r\n\r\nbefore你好🙂after / before你好🙂after\n\nKeep &amp;  \r\n';
  const frame = await mount(page, original);
  await search(frame, '(?<=before)(你好)(🙂)(?=after)', true, 2);
  await frame.locator('#search-panel-replace-input').fill('$2-$1');
  await frame.locator('#search-panel-replace-btn').click();
  const edited = original.replace('你好🙂', '🙂-你好');
  expect(await raw(page)).toBe(edited);
  await history(page, original, edited);
});

test('original Source regex lookaround uses UTF-16 positions and preserves raw source history', async ({
  page,
}) => {
  const original = '\uFEFF# Source\r\n\r\n前😀后 e\u0301 / 前😀后\n\n```text\r\n前😀后\n```\r\n';
  const frame = await mount(page, original, true);
  await search(frame, '(?<=前)😀(?=后)', true, 3);
  const selection = await frame.evaluate(() => {
    const cm = (window as unknown as LegacyGlobals).editor?.sourceView.cm;
    if (!cm) throw Error('Missing original Source CodeMirror');
    return {
      text: cm.getSelection(),
      width: Math.abs(
        cm.indexFromPos(cm.getCursor('head')) - cm.indexFromPos(cm.getCursor('anchor')),
      ),
    };
  });
  expect(selection).toEqual({ text: '😀', width: 2 });
  await frame.locator('#search-panel-replace-input').fill('$&!');
  const beforeRejected = await frame.evaluate(() => {
    const editor = (window as unknown as LegacyGlobals).editor;
    const cm = editor?.sourceView.cm;
    const status: unknown = editor?.searchPanel && Reflect.get(editor.searchPanel, 'searchStatus');
    const hits: unknown = status && typeof status === 'object' ? Reflect.get(status, 'hits') : null;
    if (!cm || !Array.isArray(hits) || !hits[0]) throw Error('Missing source hit');
    Reflect.set(hits[0], 'start', Reflect.get(hits[0], 'start') + 1);
    return {
      source: cm.getValue(),
      generation: cm.doc.history.generation,
      edits: cm.doc.history.done.filter((entry) => entry.changes).length,
    };
  });
  await frame.locator('#search-panel-replaceall-btn').click();
  await expect(frame.locator('#search-panel-status .error-message')).toHaveText(
    '无法确认源码替换范围，请重新查找',
  );
  expect(await raw(page)).toBe(original);
  expect(
    await frame.evaluate(() => {
      const cm = (window as unknown as LegacyGlobals).editor?.sourceView.cm;
      return {
        source: cm?.getValue(),
        generation: cm?.doc.history.generation,
        edits: cm?.doc.history.done.filter((entry) => entry.changes).length,
      };
    }),
  ).toEqual(beforeRejected);
  await frame.locator('#search-panel-input').fill('');
  await search(frame, '(?<=前)😀(?=后)', true, 3);
  await frame.locator('#search-panel-replaceall-btn').click();
  const edited = original.replaceAll('😀', '😀!');
  expect(await raw(page)).toBe(edited);
  await history(page, original, edited);
});

test('Source sequential single replacements locate future captures by their expanded UTF-16 length', async ({
  page,
}) => {
  const original = '\uFEFF# Source\r\n\r\n前你好🙂后 / 前你好🙂后\n\nKeep e\u0301  \r\n';
  const frame = await mount(page, original, true);
  await search(frame, '(你好🙂)', true, 2);
  await frame.locator('#search-panel-replace-input').fill('$1!');
  await frame.locator('#search-panel-replace-btn').click();
  const once = original.replace('你好🙂', '你好🙂!');
  expect(await raw(page)).toBe(once);
  expect(
    await frame.evaluate(() =>
      (window as unknown as LegacyGlobals).editor?.sourceView.cm?.getSelection(),
    ),
  ).toBe('你好🙂');
  await frame.locator('#search-panel-replace-btn').click();
  const twice = original.replaceAll('你好🙂', '你好🙂!');
  expect(await raw(page)).toBe(twice);
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }));
  const firstUndo = await raw(page);
  expect([once, original]).toContain(firstUndo);
  const steps = firstUndo === once ? 2 : 1;
  if (steps === 2)
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }));
  expect(await raw(page)).toBe(original);
  for (let index = 0; index < steps; index++)
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'redo' }));
  expect(await raw(page)).toBe(twice);
});

test('Source lookaround single replacements retain full input context through the last hit and original history', async ({
  page,
}) => {
  const original = '\uFEFF# Source\r\n\r\n前😀后 / 前😀后\n\nKeep e\u0301  \r\n';
  const frame = await mount(page, original, true);
  await search(frame, '(?<=前)😀(?=后)', true, 2);
  await frame.locator('#search-panel-replace-input').fill('$&!');
  await frame.locator('#search-panel-replace-btn').click();
  const once = original.replace('😀', '😀!');
  expect(await raw(page)).toBe(once);
  await frame.locator('#search-panel-replace-btn').click();
  const twice = original.replaceAll('😀', '😀!');
  expect(await raw(page)).toBe(twice);
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }));
  const firstUndo = await raw(page);
  expect([once, original]).toContain(firstUndo);
  const steps = firstUndo === once ? 2 : 1;
  if (steps === 2)
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }));
  expect(await raw(page)).toBe(original);
  for (let index = 0; index < steps; index++)
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'redo' }));
  expect(await raw(page)).toBe(twice);
});

test('original no-result, invalid, zero-width and 5000-hit limit leave source and history intact', async ({
  page,
}) => {
  const original = '\uFEFF# Limits\r\n\r\n' + '🙂word '.repeat(5_001) + '\n';
  const frame = await mount(page, original, true);
  const history = () =>
    frame.evaluate(() => {
      const undo = (window as unknown as LegacyGlobals).editor?.undo;
      const cm = (window as unknown as LegacyGlobals).editor?.sourceView.cm;
      return {
        index: undo?.index,
        stack: JSON.stringify(undo?.commandStack),
        sourceGeneration: cm?.doc.history.generation,
        sourceEdits: cm?.doc.history.done.filter((entry) => entry.changes).length,
      };
    });
  const before = await history();
  await frame.locator('#searchpanel-regexp-option-btn').click();
  for (const query of ['missing', '(?=word)']) {
    await frame.locator('#search-panel-input').fill(query);
    await frame.waitForFunction((query) => {
      const panel = (window as unknown as LegacyGlobals).editor?.searchPanel;
      const status: unknown = panel && Reflect.get(panel, 'searchStatus');
      return status && typeof status === 'object' && Reflect.get(status, 'searchText') === query;
    }, query);
    if (query === '(?=word)')
      await expect(frame.locator('#search-panel-status .error-message')).toHaveText(
        '不支持零宽正则匹配',
      );
    else await expect(frame.locator('#search-panel-status .error-message')).toBeVisible();
    await frame.locator('#search-panel-replace-input').fill('SHOULD_NOT_APPEAR');
    await frame.locator('#search-panel-replaceall-btn').click();
    expect(await raw(page)).toBe(original);
  }
  await frame.locator('#search-panel-input').fill('word');
  await expect(frame.locator('#search-panel-status .error-message')).toHaveText('5000+');
  await frame.locator('#search-panel-replaceall-btn').click();
  await expect(frame.locator('#search-panel-status .error-message')).toHaveAttribute(
    'title',
    '匹配超过 5000 项，无法替换；请缩小查找范围',
  );
  expect(await raw(page)).toBe(original);
  expect(await history()).toEqual(before);
});

test('invalid or pending regex cannot replace a prior valid query result', async ({ page }) => {
  const original = '\uFEFF# Guard\r\n\r\nold🙂 word / old🙂 word\n';
  const frame = await mount(page, original);
  await search(frame, 'old🙂', true, 2);
  await frame.locator('#search-panel-replace-input').fill('SHOULD_NOT_APPEAR');
  await frame.locator('#search-panel-input').fill('[');
  await expect(frame.locator('#search-panel-status .error-message')).toHaveText('无效的正则表达式');
  await frame.locator('#search-panel-replaceall-btn').click();
  expect(await raw(page)).toBe(original);
  const pending = await frame.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#search-panel-input');
    if (!input) throw Error('Missing original query input');
    input.value = 'word';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('search-panel-replaceall-btn')?.click();
    return document.getElementById('search-panel-status')?.textContent;
  });
  expect(pending).toBe('查找尚未完成，请稍后重试');
  expect(await raw(page)).toBe(original);
  await expect(frame.locator('#search-panel-status')).toHaveText(/^[12] \/ 2$/);
  await frame.locator('#search-panel-replace-input').fill('new🙂');
  await frame.locator('#search-panel-replaceall-btn').click();
  const edited = original.replaceAll('word', 'new🙂');
  expect(await raw(page)).toBe(edited);
  await history(page, original, edited);
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'find', replace: true }),
  );
  await frame.locator('#search-panel-input').fill('old🙂|(?= word)');
  await expect(frame.locator('#search-panel-status .error-message')).toHaveText(
    '不支持零宽正则匹配',
  );
  await frame.locator('#search-panel-replaceall-btn').click();
  expect(await raw(page)).toBe(original);
  expect(
    await frame.evaluate(() => {
      const panel = (window as unknown as LegacyGlobals).editor?.searchPanel;
      const status: unknown = panel && Reflect.get(panel, 'searchStatus');
      const pattern: unknown =
        status && typeof status === 'object' ? Reflect.get(status, 'regexp') : null;
      return (
        pattern instanceof RegExp &&
        !Object.hasOwn(pattern, 'exec') &&
        pattern.exec === RegExp.prototype.exec
      );
    }),
  ).toBe(true);
});

test('Source search discards a retained WYS DOM origin and preserves the current Source search position', async ({
  page,
}) => {
  const original = '\ufeffAlpha TOKEN\r\n\r\nBeta TOKEN\n\nGamma TOKEN\r\n';
  const frame = await mount(page, original);
  await search(frame, 'TOKEN', false, 3);
  const retained = await frame.evaluate(() => {
    const panel = (window as unknown as LegacyGlobals).editor?.searchPanel;
    const status = panel && Reflect.get(panel, 'searchStatus');
    if (!status || typeof status !== 'object') throw Error('Missing actual WYS search');
    const origin: unknown = Reflect.get(status, 'initPosContainer');
    if (!(origin instanceof Element)) throw Error('Missing WYS source owner');
    // Preserve an actual WYS DOM origin across the mode change, reproducing
    // the retired search receipt that can outlive the rendering mode.
    const pending = {
      ...status,
      hits: [],
      curPos: 0,
      curSelection: null,
      initPosContainer: origin,
    };
    Reflect.set(window, 'retainedFindReceipt', pending);
    return Boolean(pending.initPosContainer);
  });
  expect(retained).toBe(true);
  await frame.locator('#md-searchpanel .close-btn').click();
  await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.execute({ type: 'toggleSource' });
    await editor.execute({ type: 'sourcePosition', line: 3, column: 6 });
    await editor.execute({ type: 'find', replace: true });
  });
  const resumed = await frame.evaluate(() => {
    const editor = (window as unknown as LegacyGlobals).editor;
    const panel = editor?.searchPanel,
      cm = editor?.sourceView.cm;
    const status = Reflect.get(window, 'retainedFindReceipt');
    if (!panel || !cm || !status) throw Error('Missing source search owner');
    const before = cm.listSelections();
    Reflect.apply(Reflect.get(panel, 'findAtNode'), panel, [cm, 'TOKEN', status, true]);
    return {
      before,
      after: cm.listSelections(),
      count: status.hits.length,
      retainedDOM: Boolean(status.initPosContainer),
    };
  });
  expect(resumed.retainedDOM).toBe(false);
  expect(resumed.count).toBe(3);
  expect(resumed.after).toEqual(resumed.before);
  await search(frame, '(TOKEN)', true, 3);
  await expect(frame.locator('#search-panel-status')).toHaveText('2 / 3');
  await frame.locator('#search-panel-replace-input').fill('$1!');
  await frame.locator('#search-panel-replace-btn').click();
  const edited = original.replace('Beta TOKEN', 'Beta TOKEN!');
  expect(await raw(page)).toBe(edited);
  await history(page, original, edited);
});
