import type { MarkLyraEditor, RuntimeConfiguration } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';

type Host = Window & { marklyraEditor: MarkLyraEditor; bomErrors: string[] };
function frame(page: Page) {
  return page.frameLocator('iframe.marklyra-editor-frame');
}
async function setup(
  page: Page,
  source: string,
  policy: RuntimeConfiguration['sourceBOM'] = 'metadata',
) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(
    async ({ source, policy }) => {
      const host = window as unknown as Host;
      await host.marklyraEditor.ready;
      const previous = host.marklyraEditor,
        mount = previous.element.parentElement;
      if (!mount) throw Error('Missing mount');
      const Constructor = previous.constructor as typeof MarkLyraEditor;
      previous.destroy();
      host.bomErrors = [];
      host.marklyraEditor = new Constructor(mount, {
        runtimeUrl: 'http://127.0.0.1:4174/index.html',
        markdown: source,
        configuration: { sourceBOM: policy },
        onError: (error) => host.bomErrors.push(String(error)),
      });
      await host.marklyraEditor.ready;
    },
    { source, policy },
  );
}
async function source(page: Page) {
  return page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
}
async function command(page: Page, value: { type: 'undo' | 'redo' | 'toggleSource' }) {
  await page.evaluate((value) => (window as unknown as Host).marklyraEditor.execute(value), value);
}
async function load(page: Page, value: string) {
  await page.evaluate((value) => (window as unknown as Host).marklyraEditor.load(value), value);
}
async function reload(page: Page, value: string) {
  await page.evaluate(async (value) => {
    const e = (window as unknown as Host).marklyraEditor;
    const before = await e.flush();
    await e.reloadFromDisk(value, { expectedSource: before, expectedRevision: e.revision });
  }, value);
}
async function endBody(page: Page) {
  const body = frame(page).locator('#write > p').last();
  await body.click();
  await body.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let last: Text | undefined;
    while (node) {
      last = node as Text;
      node = walker.nextNode();
    }
    if (!last) throw Error('Missing body text');
    const r = document.createRange();
    r.setStart(last, last.length);
    r.collapse(true);
    const s = getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  });
}

test('file BOM is hidden from YAML parsing while raw prefix, EOL and history remain exact', async ({
  page,
}) => {
  const raw = '\uFEFF---\r\ntitle: BOM header\n---\r\n\r\nBody\n';
  await setup(page, raw);
  await expect(frame(page).locator('#write > .md-meta-block')).toHaveCount(1);
  expect(await source(page)).toBe(raw);
  await endBody(page);
  await page.keyboard.type('X');
  expect(await source(page)).toBe(raw.replace('Body', 'BodyX'));
  await command(page, { type: 'undo' });
  expect(await source(page)).toBe(raw);
  await command(page, { type: 'redo' });
  expect(await source(page)).toBe(raw.replace('Body', 'BodyX'));
  await command(page, { type: 'toggleSource' });
  expect(
    await frame(page)
      .locator('#marklyra-source .CodeMirror')
      .evaluate((element) => {
        const cm = Reflect.get(element, 'CodeMirror') as { getValue(): string };
        return cm.getValue().startsWith('\uFEFF');
      }),
  ).toBe(false);
  await command(page, { type: 'toggleSource' });
  expect(await source(page)).toBe(raw.replace('Body', 'BodyX'));
  await expect(frame(page).locator('#write > .md-meta-block')).toHaveCount(1);
});

for (const policy of ['metadata', 'text'] as const) {
  test(`${policy} keeps a literal leading FEFF and a body FEFF`, async ({ page }) => {
    const raw = (policy === 'metadata' ? '\uFEFF' : '') + '\uFEFFAlpha\n\nMid\uFEFFdle\n\nEnd';
    await setup(page, raw, policy);
    expect(await source(page)).toBe(raw);
    await command(page, { type: 'toggleSource' });
    const canonical = await frame(page)
      .locator('#marklyra-source .CodeMirror')
      .evaluate((element) => {
        const cm = Reflect.get(element, 'CodeMirror') as { getValue(): string };
        return cm.getValue();
      });
    expect(canonical.startsWith('\uFEFFAlpha')).toBe(true);
    expect(canonical).toContain('Mid\uFEFFdle');
    await command(page, { type: 'toggleSource' });
    await endBody(page);
    await page.keyboard.type('X');
    expect(await source(page)).toBe(raw + 'X');
    await command(page, { type: 'undo' });
    expect(await source(page)).toBe(raw);
  });
}

for (const sourceMode of [false, true])
  for (const before of ['', '😀 Alpha\r\n\r\nEnd\n', '---\r\ntitle: X\n---\r\n\r\nBody\n']) {
    test(`${sourceMode ? 'source' : 'WYS'} BOM-only add/remove has real independent Undo/Redo: ${JSON.stringify(before.slice(0, 10))}`, async ({
      page,
    }) => {
      await setup(page, before);
      if (sourceMode) await command(page, { type: 'toggleSource' });
      const added = '\uFEFF' + before;
      await reload(page, added);
      expect(await source(page)).toBe(added);
      await command(page, { type: 'undo' });
      expect(await source(page)).toBe(before);
      await command(page, { type: 'redo' });
      expect(await source(page)).toBe(added);
      await reload(page, before);
      expect(await source(page)).toBe(before);
      await command(page, { type: 'undo' });
      expect(await source(page)).toBe(added);
      await command(page, { type: 'redo' });
      expect(await source(page)).toBe(before);
    });
  }

test('failed replacement restores a BOM document and its original history', async ({ page }) => {
  const raw = '\uFEFF---\r\ntitle: Kept\n---\r\n\r\nBody';
  await setup(page, raw);
  await endBody(page);
  await page.keyboard.type('X');
  const edited = await source(page);
  expect(edited).toBe(raw + 'X');
  let rejected = false;
  try {
    await load(page, 'broken \ud800');
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
  expect(await source(page)).toBe(edited);
  await command(page, { type: 'undo' });
  expect(await source(page)).toBe(raw);
  await command(page, { type: 'redo' });
  expect(await source(page)).toBe(edited);
  await expect(frame(page).locator('#write > .md-meta-block')).toHaveCount(1);
});

for (const initial of ['Alpha\n\nEnd', '😀 Alpha\n\nEnd', '\nAlpha\n\nEnd', '']) {
  test(`BOM-only reload keeps real source input buffer and separates history groups: ${JSON.stringify(initial.slice(0, 8))}`, async ({
    page,
  }) => {
    await setup(page, initial);
    await command(page, { type: 'toggleSource' });
    await frame(page)
      .locator('#marklyra-source .CodeMirror')
      .evaluate((element) => {
        const cm = Reflect.get(element, 'CodeMirror') as {
          getValue(): string;
          posFromIndex(offset: number): { line: number; ch: number };
          setCursor(pos: { line: number; ch: number }): void;
          focus(): void;
        };
        cm.setCursor(cm.posFromIndex(cm.getValue().length));
        cm.focus();
      });
    await page.keyboard.type('Q');
    const typed = await source(page);
    expect(typed).toBe(initial + 'Q');
    await reload(page, '\uFEFF' + typed);
    await reload(page, typed);
    await page.keyboard.type('Z');
    expect(await source(page)).toBe(typed + 'Z');
    for (const expected of [typed, '\uFEFF' + typed, typed, initial]) {
      await command(page, { type: 'undo' });
      expect(await source(page)).toBe(expected);
    }
    for (const expected of [typed, '\uFEFF' + typed, typed, typed + 'Z']) {
      await command(page, { type: 'redo' });
      expect(await source(page)).toBe(expected);
    }
    expect(await page.evaluate(() => (window as unknown as Host).bomErrors)).toEqual([]);
  });
}

for (const policy of ['metadata', 'text'] as const) {
  test(`${policy} does not erase a literal FEFF to manufacture YAML front matter`, async ({
    page,
  }) => {
    const raw =
      (policy === 'metadata' ? '\uFEFF' : '') +
      '\uFEFF---\r\ntitle: Literal prefix\n---\r\n\r\nEnd';
    await setup(page, raw, policy);
    await expect(frame(page).locator('#write > .md-meta-block')).toHaveCount(0);
    expect(await source(page)).toBe(raw);
    await command(page, { type: 'toggleSource' });
    expect(
      await frame(page)
        .locator('#marklyra-source .CodeMirror')
        .evaluate((element) =>
          (Reflect.get(element, 'CodeMirror') as { getValue(): string }).getValue(),
        ),
    ).toMatch(/^\uFEFF---/);
    await command(page, { type: 'toggleSource' });
    await expect(frame(page).locator('#write > .md-meta-block')).toHaveCount(0);
    await endBody(page);
    await page.keyboard.type('X');
    expect(await source(page)).toBe(raw + 'X');
    await command(page, { type: 'undo' });
    expect(await source(page)).toBe(raw);
  });
}

for (const sourceMode of [false, true])
  for (const policy of ['metadata', 'text'] as const) {
    test(`${policy} literal FEFF survives ${sourceMode ? 'source' : 'WYS'} disk reload history`, async ({
      page,
    }) => {
      const initial = '---\r\ntitle: Initial\n---\r\n\r\nBody';
      const external =
        (policy === 'metadata' ? '\uFEFF' : '') +
        '\uFEFF---\r\ntitle: Literal prefix\n---\r\n\r\nEnd';
      await setup(page, initial, policy);
      if (sourceMode) await command(page, { type: 'toggleSource' });
      await reload(page, external);
      expect(await source(page)).toBe(external);
      await command(page, { type: 'undo' });
      expect(await source(page)).toBe(initial);
      await command(page, { type: 'redo' });
      expect(await source(page)).toBe(external);
      if (sourceMode) await command(page, { type: 'toggleSource' });
      await expect(frame(page).locator('#write > .md-meta-block')).toHaveCount(0);
      await endBody(page);
      await page.keyboard.type('X');
      expect(await source(page)).toBe(external + 'X');
      await command(page, { type: 'undo' });
      expect(await source(page)).toBe(external);
      expect(await page.evaluate(() => (window as unknown as Host).bomErrors)).toEqual([]);
    });
  }
