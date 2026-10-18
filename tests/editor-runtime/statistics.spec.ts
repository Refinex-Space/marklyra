import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';

type Host = Window & { marklyraEditor: MarkLyraEditor };

async function load(page: import('@playwright/test').Page, source: string) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const sdk = (window as unknown as Host).marklyraEditor;
    await sdk.ready;
    await sdk.load(source);
  }, source);
}
async function query(page: import('@playwright/test').Page, speed = 382) {
  // A changing render is explicitly rejected, never returned as the current document.
  return page.evaluate(async (wordsPerMinute) => {
    const sdk = (window as unknown as Host).marklyraEditor;
    for (let i = 0; i < 8; i++) {
      try {
        return await sdk.getStatistics({ wordsPerMinute });
      } catch (error) {
        if (i === 7) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw Error('Statistics did not settle');
  }, speed);
}
for (const source of [
  '',
  'Hello world',
  '中文测试',
  '😀😀',
  "don't John's",
  '\uFEFFAlpha\r\n\r\nBeta\n',
  '# Heading\n\n- one\n- two\n',
]) {
  test(`statistics matches original read-only counter ${JSON.stringify(source)}`, async ({
    page,
  }) => {
    await load(page, source);
    const actual = await query(page);
    const frame = page.frames().find((f) => f.url().startsWith('http://127.0.0.1:4174/'));
    if (!frame) throw Error('Missing runtime');
    const oracle = await frame.evaluate(() => {
      const editor = (
        window as unknown as {
          editor: {
            getMarkdown(): string;
            wordCount: { delimiter: number; getWordCount(): number };
          };
        }
      ).editor;
      const query = Object.create(editor.wordCount) as typeof editor.wordCount;
      query.delimiter = 0;
      return { words: query.getWordCount(), canonical: editor.getMarkdown() };
    });
    expect(actual.words).toBe(oracle.words);
    expect(actual.characters).toBe(oracle.canonical.length);
    expect(actual.lines).toBe(oracle.canonical.split('\n').length);
    expect(actual.readingMinutes).toBe(Math.round(actual.words / 382));
    expect(actual.wordBasis).toBe('legacy-rendered');
    expect(actual.mode).toBe('wysiwyg');
    expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
      source,
    );
  });
}
test('source statistics use current CM source without mode or history changes', async ({
  page,
}) => {
  await load(page, 'Alpha beta\n\nTail\n');
  await page.evaluate(async () => {
    const sdk = (window as unknown as Host).marklyraEditor;
    await sdk.execute({ type: 'toggleSource' });
  });
  const frame = page.frames().find((f) => f.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing runtime');
  await frame.evaluate(() => {
    const cm = (
      window as unknown as {
        editor: { sourceView: { cm: { focus(): void; execCommand(name: string): void } } };
      }
    ).editor.sourceView.cm;
    cm.focus();
    cm.execCommand('goDocEnd');
  });
  await page.keyboard.type(' new words');
  const before = await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
  expect(before).toBe('Alpha beta\n\nTail\n new words');
  const stats = await query(page, 1);
  expect(stats.mode).toBe('source');
  expect(stats.words).toBe(5);
  expect(stats.readingMinutes).toBe(5);
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
    before,
  );
  const stillSource = await frame.evaluate(
    () =>
      (window as unknown as { editor: { sourceView: { inSourceMode: boolean } } }).editor.sourceView
        .inSourceMode,
  );
  expect(stillSource).toBe(true);
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }));
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
    'Alpha beta\n\nTail\n',
  );
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'redo' }));
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
    before,
  );
});
test('source render counts structured current text and preserves current CM selection', async ({
  page,
}) => {
  const source = '# Heading\n\n- Alpha\n- Beta\n\n```js\nconst n = 1;\n```\n';
  await load(page, source);
  const baseline = await query(page);
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
  );
  const frame = page.frames().find((f) => f.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing runtime');
  const before = await frame.evaluate(() => {
    const editor = (
      window as unknown as {
        editor: {
          sourceView: {
            cm: {
              focus(): void;
              setSelection(a: { line: number; ch: number }, b: { line: number; ch: number }): void;
              listSelections(): unknown;
              getHistory(): unknown;
            };
          };
        };
      }
    ).editor;
    const cm = editor.sourceView.cm;
    cm.focus();
    cm.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 9 });
    return { selection: cm.listSelections(), history: cm.getHistory() };
  });
  let rendererCount = 0;
  page.on('frameattached', () => {
    rendererCount++;
  });
  const result = await query(page);
  expect(result.words).toBe(baseline.words);
  const completedRenderers = rendererCount;
  expect(completedRenderers).toBeGreaterThan(0);
  expect((await query(page, 120)).words).toBe(result.words);
  expect(rendererCount).toBe(completedRenderers);
  expect(result.selection).toEqual({ words: 1, characters: 7 });
  const after = await frame.evaluate(() => {
    const cm = (
      window as unknown as {
        editor: { sourceView: { cm: { listSelections(): unknown; getHistory(): unknown } } };
      }
    ).editor.sourceView.cm;
    return { selection: cm.listSelections(), history: cm.getHistory() };
  });
  expect(after).toEqual(before);
});
test('source math renderer waits for current formula text without changing the active mode', async ({
  page,
}) => {
  await load(page, 'Inline $x + y$ text.\n\n$$\na^2 + b^2 = c^2\n$$\n');
  const frame = page.frames().find((f) => f.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing runtime');
  await expect(frame.locator('.md-inline-math svg')).toHaveCount(1);
  await expect(frame.locator('.md-math-block svg')).toHaveCount(1);
  const baseline = await query(page);
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
  );
  expect((await query(page)).words).toBe(baseline.words);
  expect(
    await frame.evaluate(
      () =>
        (window as unknown as { editor: { sourceView: { inSourceMode: boolean } } }).editor
          .sourceView.inSourceMode,
    ),
  ).toBe(true);
});
test('in-flight source statistics reject document replacement', async ({ page }) => {
  await load(page, 'Alpha beta');
  const result = await page.evaluate(async () => {
    const sdk = (window as unknown as Host).marklyraEditor;
    await sdk.execute({ type: 'toggleSource' });
    const pending = sdk.getStatistics().then(
      () => 'resolved',
      () => 'rejected',
    );
    await sdk.load('New document');
    return pending;
  });
  expect(result).toBe('rejected');
  expect((await query(page)).words).toBe(2);
});

test('source word cache is discarded when current source changes', async ({ page }) => {
  await load(page, 'Alpha beta');
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
  );
  expect((await query(page)).words).toBe(2);
  const frame = page.frames().find((f) => f.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing runtime');
  await frame.evaluate(() => {
    const cm = (
      window as unknown as {
        editor: { sourceView: { cm: { focus(): void; execCommand(name: string): void } } };
      }
    ).editor.sourceView.cm;
    cm.focus();
    cm.execCommand('goDocEnd');
  });
  await page.keyboard.type(' more');
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
    'Alpha beta more',
  );
  expect((await query(page)).words).toBe(3);
});

test('destroy cancels pending source rendering and removes isolated frames', async ({ page }) => {
  await load(page, 'Alpha beta');
  const result = await page.evaluate(async () => {
    const sdk = (window as unknown as Host).marklyraEditor;
    await sdk.execute({ type: 'toggleSource' });
    const pending = sdk.getStatistics().then(
      () => 'resolved',
      () => 'rejected',
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    sdk.destroy();
    return pending;
  });
  expect(result).toBe('rejected');
  await expect(page.locator('iframe')).toHaveCount(0);
});
