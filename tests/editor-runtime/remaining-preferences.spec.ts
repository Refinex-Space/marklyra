import type { MarkLyraEditor, MarkLyraStartupPreferences } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';

type Host = Window & { marklyraEditor: MarkLyraEditor; wheelActions?: string[] };
async function mount(
  page: Page,
  source: string,
  startup: Partial<MarkLyraStartupPreferences> = {},
) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(
    async ({ source, startup }) => {
      const h = window as unknown as Host;
      await h.marklyraEditor.ready;
      const Constructor = h.marklyraEditor.constructor as typeof MarkLyraEditor;
      h.marklyraEditor.destroy();
      h.wheelActions = [];
      const root = document.querySelector<HTMLElement>('#editor');
      if (!root) throw Error('Missing root');
      h.marklyraEditor = new Constructor(root, {
        runtimeUrl: 'http://127.0.0.1:4174/index.html',
        markdown: source,
        startupPreferences: startup,
        host: { onAction: (value) => h.wheelActions?.push(value) },
      });
      await h.marklyraEditor.ready;
    },
    { source, startup },
  );
  const frame = page.frames().find((f) => f.url().includes('4174/index.html'));
  if (!frame) throw Error('Missing frame');
  return frame;
}
const flush = (page: Page) =>
  page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());

test('inline math and math code blocks render by default without rewriting source', async ({
  page,
}) => {
  const source = '\uFEFFInline $x+1$.\r\n\r\n```math\ny=2\n```\r\n\r\nTail  \n';
  const frame = await mount(page, source);
  await expect(frame.locator('#write mjx-container > svg')).toHaveCount(2);
  expect(await flush(page)).toBe(source);
});

test('AMS and all-equation numbering differ for plain block formulas and preserve source', async ({
  page,
}) => {
  const source = '$$\nx=1\n$$\n\n$$\n\\begin{equation}y=2\\end{equation}\n$$\n';
  for (const mode of [false, 'ams', 'all'] as const) {
    const frame = await mount(page, source, { autoNumberingForMath: mode });
    await expect(frame.locator('#write mjx-container > svg')).toHaveCount(2);
    await expect(frame.locator('#write [data-mml-node="mlabeledtr"]')).toHaveCount(
      mode === false ? 0 : mode === 'ams' ? 1 : 2,
    );
    expect(await flush(page)).toBe(source);
  }
});

test('legacy delimiters and math fences reverse only in fresh runtimes and preserve exact source', async ({
  page,
}) => {
  const source = '\uFEFFAlpha \\(x+1\\)\r\n\r\n```math\nx+1\n```\r\n\r\nTail  \n';
  for (const enabled of [true, false, true]) {
    const frame = await mount(page, source, { noLegacyMath: !enabled, gitlabMath: enabled });
    await expect(frame.locator('#write mjx-container')).toHaveCount(enabled ? 2 : 0);
    expect(await flush(page)).toBe(source);
  }
});
test('MathJax numbering and physics configuration reach actual SVG consumers', async ({ page }) => {
  for (const enabled of [true, false, true]) {
    const frame = await mount(page, '$$\n\\dv{x}{t}=1\n$$\n', {
      allowPhysicsConflict: enabled,
      autoNumberingForMath: enabled ? 'all' : false,
    });
    await expect(frame.locator('#write mjx-container > svg')).toHaveCount(1);
    const result = await frame.locator('#write').evaluate(() => {
      const math = Reflect.get(window, 'MathJax') as {
        config: { tex: { tags: string; packages: string[] } };
      };
      return {
        tags: math.config.tex.tags,
        physics: math.config.tex.packages.includes('physics'),
        svg: document.querySelector('#write mjx-container')?.innerHTML,
      };
    });
    expect(result.physics).toBe(enabled);
    expect(result.tags).toBe(enabled ? 'all' : 'none');
    expect(result.svg).toContain(
      enabled ? 'data-mml-node="mlabeledtr"' : '<mtext mathcolor="red">\\dv',
    );
    expect(await flush(page)).toBe('$$\n\\dv{x}{t}=1\n$$\n');
  }
});
test('displayLines changes actual multiline SVG without rewriting source', async ({ page }) => {
  const counts: number[] = [];
  const source = '$$\na\\\\b\\newline c\n$$\n';
  for (const disabled of [false, true, false]) {
    const frame = await mount(page, source, { noDisplayLinesInMath: disabled });
    await expect(frame.locator('#write mjx-container > svg')).toHaveCount(1);
    counts.push(await frame.locator('#write svg [data-mml-node="mtr"]').count());
    expect(await flush(page)).toBe(source);
  }
  expect(counts[0]).toBeGreaterThan(0);
  expect(counts[1]).toBeLessThan(counts[0] ?? 0);
  expect(counts[2]).toBe(counts[0]);
});
test('existing HTML exporter uses LaTeX only in unstyled inline and block output and preserves source/history', async ({
  page,
}) => {
  const source = '\uFEFFInline $x+1$.\r\n\r\n$$\ny=2\n$$\r\n\r\nTail  \n';
  await mount(page, source);
  for (const format of ['latex', 'svg', 'latex'] as const) {
    const result = await page.evaluate(async (format) => {
      const e = (window as unknown as Host).marklyraEditor;
      await e.setPreferences({ mathFormatOnCopy: format });
      const styled = await e.exportHTML({ styled: true }),
        plain = await e.exportHTML({ styled: false });
      return { styled, plain, source: await e.flush() };
    }, format);
    expect(result.styled).toContain('<svg');
    expect(result.plain.includes('<svg')).toBe(format === 'svg');
    expect(result.source).toBe(source);
  }
});
test('export white-space preference changes generated CSS and never source', async ({ page }) => {
  const source = 'Alpha  Beta\nGamma\n';
  await mount(page, source);
  const outputs: string[] = [];
  for (const preserve of [false, true, false]) {
    outputs.push(
      await page.evaluate(async (preserve) => {
        const e = (window as unknown as Host).marklyraEditor;
        await e.setPreferences({ preLinebreakOnExport: preserve });
        return e.exportHTML({ styled: true });
      }, preserve),
    );
    expect(await flush(page)).toBe(source);
  }
  const normal = (html: string) => /white-space\s*:\s*normal/.test(html);
  expect(normal(outputs[0] ?? '')).toBe(true);
  expect(outputs[1]).not.toBe(outputs[0]);
  expect(outputs[2]).toBe(outputs[0]);
  const computed: string[] = [];
  for (const html of outputs)
    computed.push(
      await page.evaluate(
        (html) =>
          new Promise<string>((resolve, reject) => {
            const frame = document.createElement('iframe');
            frame.sandbox.add('allow-same-origin');
            frame.onload = () => {
              try {
                const p = frame.contentDocument?.querySelector('p');
                if (!p || !frame.contentWindow) throw Error('Missing exported paragraph');
                const value = frame.contentWindow.getComputedStyle(p).whiteSpace;
                frame.remove();
                resolve(value);
              } catch (e) {
                frame.remove();
                reject(e);
              }
            };
            frame.srcdoc = html;
            document.body.append(frame);
          }),
        html,
      ),
    );
  expect(computed).toEqual(['normal', 'pre-wrap', 'normal']);
});
test('original wheel consumer enforces live flag, Command threshold and throttling before bounded host action', async ({
  page,
}) => {
  const frame = await mount(page, 'Alpha');
  const wheel = async (deltaY: number, metaKey = true) =>
    frame
      .locator('#write')
      .evaluate(
        (el, { deltaY, metaKey }) =>
          el.dispatchEvent(new WheelEvent('wheel', { deltaY, metaKey, bubbles: true })),
        { deltaY, metaKey },
      );
  await wheel(-20);
  expect(await page.evaluate(() => (window as unknown as Host).wheelActions)).toEqual([]);
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.setPreferences({ zoomByMouse: true }),
  );
  await wheel(-3);
  await wheel(-20, false);
  expect(await page.evaluate(() => (window as unknown as Host).wheelActions)).toEqual([]);
  await wheel(-20);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).wheelActions))
    .toEqual(['zoom-in']);
  await wheel(20);
  expect(await page.evaluate(() => (window as unknown as Host).wheelActions)).toEqual(['zoom-in']);
  await page.waitForTimeout(510);
  await wheel(20);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).wheelActions))
    .toEqual(['zoom-in', 'zoom-out']);
  expect(await flush(page)).toBe('Alpha');
});

test('rendering smart punctuation keeps raw ASCII and Unicode byte boundaries through cold reversals and local history', async ({
  page,
}) => {
  const source = '\uFEFFAlpha "quote" -- wait...\r\n\r\nUnicode “原文” —\n\nTail  \n';
  for (const enabled of [true, false, true]) {
    const frame = await mount(page, source, {
      convertSmartOnRender: true,
      smartQuote: enabled,
      smartDash: enabled,
      remapUnicodePunctuation: enabled,
    });
    const first = frame.locator('#write > p').first();
    if (enabled) await expect(first).toContainText('“quote” – wait…', { useInnerText: true });
    else await expect(first).toContainText('"quote" -- wait...', { useInnerText: true });
    expect(await flush(page)).toBe(source);
    await frame
      .locator('#write > p')
      .last()
      .evaluate((el) => {
        (document.querySelector('#write') as HTMLElement).focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
      });
    await page.keyboard.type('X');
    expect(await flush(page)).toBe(source.replace('Tail  ', 'Tail  X'));
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }));
    expect(await flush(page)).toBe(source);
  }
});
