import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';

type Host = Window & { marklyraEditor: MarkLyraEditor };

async function setup(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async () => {
    await (window as unknown as Host).marklyraEditor.ready;
  });
}
async function panelRect(page: Page) {
  return page
    .frameLocator('iframe.marklyra-editor-frame')
    .locator('#md-searchpanel')
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        innerWidth: document.documentElement.clientWidth,
        display: getComputedStyle(element).display,
      };
    });
}

test('查找面板保留原始全宽布局，顶部让出宿主标题栏', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.setContentInset(240, 28, 28);
    await editor.execute({ type: 'find' });
  });
  const inset = await panelRect(page);
  expect(inset.display).not.toBe('none');
  // 原始查找栏横跨窗口，宿主只为它开放侧栏上方的命中区域。
  expect(Math.abs(inset.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(inset.top - 28)).toBeLessThanOrEqual(1);
  expect(Math.abs(inset.right - inset.innerWidth)).toBeLessThanOrEqual(1);

  await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.setContentInset(0, 0, 0);
  });
  const full = await panelRect(page);
  // 无缩进时保持原版全宽贴顶行为。
  expect(Math.abs(full.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(full.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(full.right - full.innerWidth)).toBeLessThanOrEqual(1);
});

test('trailing content inset reserves a right panel and rejects invalid widths atomically', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () =>
    (window as unknown as Host).marklyraEditor.setContentInset(120, 28, 28, 220),
  );
  const frame = page.frameLocator('iframe.marklyra-editor-frame');
  const geometry = () =>
    frame.locator('content').evaluate((element) => ({
      left: getComputedStyle(element).left,
      right: document.documentElement.style.getPropertyValue('--marklyra-content-trailing'),
    }));
  await expect.poll(geometry).toEqual({ left: '120px', right: '220px' });
  const errors = await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    const rejected: boolean[] = [];
    for (const width of [-1, 16385, Number.NaN, Number.POSITIVE_INFINITY]) {
      try {
        await editor.setContentInset(10, 0, 0, width);
        rejected.push(false);
      } catch (error) {
        rejected.push(error instanceof RangeError);
      }
    }
    return rejected;
  });
  expect(errors).toEqual([true, true, true, true]);
  expect(await geometry()).toEqual({ left: '120px', right: '220px' });
});

for (const sourceMode of [false, true]) {
  test(`${sourceMode ? 'source' : 'document'}: layout follows composition without replacing input nodes or changing bytes`, async ({
    page,
  }) => {
    await setup(page);
    const raw = '\uFEFF# Composition\r\n\r\nKeep these bytes.\r\n';
    await page.evaluate(
      async ({ raw, sourceMode }) => {
        const editor = (window as unknown as Host).marklyraEditor;
        await editor.load(raw);
        if (sourceMode) await editor.execute({ type: 'toggleSource' });
      },
      { raw, sourceMode },
    );
    const frame = page.frameLocator('iframe.marklyra-editor-frame');
    const input = frame.locator(sourceMode ? '#marklyra-source textarea' : '#write');
    await input.evaluate((element) => {
      const editor = Reflect.get(window, 'editor');
      Reflect.set(window, '__insetInput', element);
      Reflect.set(window, '__insetChildren', [...element.childNodes]);
      Reflect.set(
        window,
        '__insetHistory',
        JSON.stringify([editor.undo.commandStack, editor.undo.index]),
      );
      const cm = editor.sourceView?.cm;
      if (cm) {
        const refresh = cm.refresh.bind(cm);
        Reflect.set(window, '__insetRefreshes', 0);
        cm.refresh = () => {
          Reflect.set(window, '__insetRefreshes', Reflect.get(window, '__insetRefreshes') + 1);
          refresh();
        };
      }
      element.dispatchEvent(
        new CompositionEvent('compositionstart', { bubbles: true, data: 'ni' }),
      );
    });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Host).marklyraEditor.isComposing))
      .toBe(true);
    await page.evaluate(async () => {
      const editor = (window as unknown as Host).marklyraEditor;
      await Promise.all([240, 0, 200].map((right) => editor.setContentInset(160, 28, 28, right)));
    });
    await expect
      .poll(() =>
        frame
          .locator('html')
          .evaluate((element) => element.style.getPropertyValue('--marklyra-content-trailing')),
      )
      .toBe('200px');
    expect(
      await input.evaluate((element) => {
        const editor = Reflect.get(window, 'editor');
        return (
          Reflect.get(window, '__insetInput') === element &&
          Reflect.get(window, '__insetChildren').every(
            (node: Node, index: number) => element.childNodes[index] === node,
          ) &&
          Reflect.get(window, '__insetHistory') ===
            JSON.stringify([editor.undo.commandStack, editor.undo.index])
        );
      }),
    ).toBe(true);
    if (sourceMode)
      expect(await input.evaluate(() => Reflect.get(window, '__insetRefreshes'))).toBe(0);
    await input.evaluate((element) =>
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
    );
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Host).marklyraEditor.isComposing))
      .toBe(false);
    expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(raw);
  });
}

test('a deferred resize keeps source scroll position when typewriter mode is disabled', async ({
  page,
}) => {
  await setup(page);
  const raw = `# Scroll\n\n${'A long document paragraph.\n\n'.repeat(120)}`;
  await page.evaluate(async (raw) => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.load(raw);
    await editor.execute({ type: 'toggleSource' });
  }, raw);
  const frame = page.frameLocator('iframe.marklyra-editor-frame');
  const port = frame.locator('#marklyra-source .CodeMirror-scroll');
  const scroll = await port.evaluate((element) => {
    const editor = Reflect.get(window, 'editor');
    const history = JSON.stringify([editor.undo.commandStack, editor.undo.index]);
    editor.sourceView.cm.scrollTo(0, 600);
    const before = element.scrollTop;
    editor.setTypeWriterMode(false, true);
    return {
      before,
      after: element.scrollTop,
      unchanged: history === JSON.stringify([editor.undo.commandStack, editor.undo.index]),
    };
  });
  expect(scroll.before).toBeGreaterThan(0);
  expect(scroll.after).toBe(scroll.before);
  expect(scroll.unchanged).toBe(true);
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'toggleTypewriter' }),
  );
  expect(
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.menuState?.typewriterMode),
  ).toBe(true);
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'toggleTypewriter' }),
  );
  expect(
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.menuState?.typewriterMode),
  ).toBe(false);
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(raw);
});
