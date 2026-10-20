import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import {
  createImageEditor,
  expectDecodedImage,
  focusEnd,
  type ImageTestWindow,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

type ExportWindow = ImageTestWindow & {
  exportJob?: { state: 'pending' | 'resolved' | 'rejected'; error?: string };
};
const advanced =
  '# Export fixture\n\n[TOC]\n\n## Content\n\n```js\nconst answer = 42;\n```\n\n| A | B |\n| --- | --- |\n| one | two |\n\nNote[^n].\n\n[^n]: Footnote body.\n\n$$\nx^2+y^2=z^2\n$$\n\n```mermaid\ngraph LR\nA[Start] --> B[End]\n```\n\n![pixel](images/pixel.png)\n\nAfter';

async function snapshot(page: Page) {
  return imageFrame(page)
    .locator('#write')
    .evaluate(() => {
      const engine = Reflect.get(window, 'editor') as {
        getMarkdown(): string;
        sourceView: { inSourceMode: boolean };
        selection: { buildUndo(): unknown };
        undo: { commandStack: unknown; index: number };
      };
      const selection = document.getSelection();
      return {
        source: engine.getMarkdown(),
        mode: engine.sourceView.inSourceMode,
        selection: engine.selection.buildUndo(),
        history: JSON.stringify(engine.undo.commandStack),
        index: engine.undo.index,
        focus: document.activeElement?.tagName,
        anchor: selection?.anchorOffset,
        head: selection?.focusOffset,
      };
    });
}
async function beginExport(page: Page) {
  await page.evaluate(() => {
    const target = window as ExportWindow;
    const editor = target.imageHostFixture.editors[0];
    if (!editor) throw new Error('Missing editor');
    target.exportJob = { state: 'pending' };
    void editor.exportHTML().then(
      () => {
        target.exportJob = { state: 'resolved' };
      },
      (error) => {
        target.exportJob = { state: 'rejected', error: String(error) };
      },
    );
  });
}

test.beforeEach(async ({ page }) => {
  await setupImageHost(page);
});

test('HTML export preserves active selection/history and renders advanced syntax and opaque images offline', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await createImageEditor(page, { source: advanced, context: 'doc-a' });
  await expectDecodedImage(page);
  await focusEnd(page);
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await imageSource(page);
  const before = await snapshot(page);
  const html = await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.exportHTML({
      title: 'Literal <title>',
      theme: 'marklyra-light',
    }),
  );
  expect(typeof html).toBe('string');
  expect(await snapshot(page)).toEqual(before);
  const offline = await context.newPage(),
    requests: string[] = [];
  await offline.route('**/*', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await offline.setContent(html ?? '');
  await expect(offline.locator('table')).toHaveCount(1);
  await expect(offline.locator('.md-toc a')).toHaveCount(2);
  await expect(offline.locator('svg')).toHaveCount(2);
  await expect(offline.locator('.footnotes-area')).toHaveCount(1);
  await expect(offline.locator('.cm-keyword').first()).toHaveText('const');
  await expect(offline).toHaveTitle('Literal <title>');
  await expect(offline.locator('script,link')).toHaveCount(0);
  await expect
    .poll(() =>
      offline.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(1);
  const resources = await offline.evaluate(() => ({
    images: [...document.images].map((i) => i.src),
    css: [...document.querySelectorAll('style')].map((s) => s.textContent).join(''),
  }));
  expect(resources.images.every((url) => url.startsWith('data:image/'))).toBe(true);
  expect(resources.css).toContain('data:font/');
  expect(resources.css).not.toMatch(/url\(["']?(?:https?:|marklyra:|file:|blob:)/i);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'undo' }),
  );
  expect(await imageSource(page)).toBe(advanced);
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'redo' }),
  );
  expect(await imageSource(page)).toContain('AfterX');
});

test('unstyled HTML export keeps the active source-mode cursor and original history', async ({
  page,
}) => {
  await createImageEditor(page, { source: 'Alpha\n\nBeta', context: 'doc-a' });
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'toggleSource' }),
  );
  const before = await snapshot(page);
  const html = await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.exportHTML({ styled: false }),
  );
  expect(await snapshot(page)).toEqual(before);
  expect(html).not.toContain('<style');
  expect(html).toContain('Alpha');
});

test('print serialization carries original boundaries, portable base/theme styles and static CSS without touching the source view', async ({
  page,
  context,
}) => {
  await createImageEditor(page, {
    source: `${advanced}\n\n# Second chapter\n\nLast paragraph`,
    context: 'doc-a',
  });
  await expectDecodedImage(page);
  await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type: 'toggleSource' }),
  );
  const before = await snapshot(page);
  const html = await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.exportHTML({
      title: 'Print snapshot',
      print: { splitPages: true },
      extraCss: '#write h1 { color: rgb(18, 52, 86); }',
    }),
  );
  expect(await snapshot(page)).toEqual(before);
  const offline = await context.newPage();
  const requests: string[] = [];
  await offline.route('**/*', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await offline.setContent(html ?? '');
  await offline.emulateMedia({ media: 'print' });
  await expect(offline.locator('script,link')).toHaveCount(0);
  await expect(offline.locator('body')).toHaveClass(/typora-print/);
  await expect(offline.locator('h1[data-breakpage]')).toHaveText('Second chapter');
  await expect(offline.locator('.footnotes-area[data-breakpage]')).toHaveCount(1);
  await expect(offline.locator('h1').last()).toHaveCSS('break-before', 'page');
  await expect(offline.locator('h1').last()).toHaveCSS('color', 'rgb(18, 52, 86)');
  await expect(offline.locator('thead')).toHaveCSS('display', 'table-header-group');
  await expect(offline.locator('.md-fences').first()).toHaveCSS('break-inside', 'auto');
  expect(await offline.locator('#marklyra-export-theme').textContent()).toContain('data:font/');
  const links = await offline.locator('.md-toc a').evaluateAll((anchors) =>
    anchors.map((a) => {
      const href = a.getAttribute('href') ?? '';
      return href.startsWith('#') && !!document.getElementById(href.slice(1));
    }),
  );
  expect(links.every(Boolean)).toBe(true);
  await expect(offline.locator('a[href^="af:"],a[href^="at:"]')).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('custom export CSS rejects external resources without changing active source/history', async ({
  page,
}) => {
  await createImageEditor(page, { source: 'Alpha\n\nBeta', context: 'doc-a' });
  await focusEnd(page);
  const before = await snapshot(page);
  for (const extraCss of [
    '@import "https://example.test/a.css";',
    'body { background: url(file:///secret.png); }',
    'body { background: image-set("https://example.test/a.png" 1x); }',
  ]) {
    const error = await page.evaluate(async (extraCss) => {
      try {
        await (window as ImageTestWindow).imageHostFixture.editors[0]?.exportHTML({ extraCss });
        return '';
      } catch (error) {
        return String(error);
      }
    }, extraCss);
    expect(error).toMatch(/未内嵌/);
    expect(await snapshot(page)).toEqual(before);
  }
});

test('Chromium print artifact produces a real multipage PDF with long code/table and vector math/diagram', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'PDF browser API is Chromium-only; native WK verification is separate.',
  );
  const code = Array.from(
    { length: 110 },
    (_, index) => `const line${index} = "PRINT_CODE_${index}";`,
  ).join('\n');
  const rows = Array.from(
    { length: 65 },
    (_, index) => `| TABLE_ROW_${index} | 中文内容 ${index} |`,
  ).join('\n');
  const source = `${advanced}\n\n# Code chapter\n\n\`\`\`js\n${code}\n\`\`\`\n\n# Table chapter\n\n| Key | Value |\n| --- | --- |\n${rows}\n\nPDF_FINAL_MARKER`;
  await createImageEditor(page, { source, context: 'doc-a' });
  await expectDecodedImage(page);
  const before = await snapshot(page);
  const html = await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.exportHTML({
      title: 'MarkLyra browser print fixture',
      print: { splitPages: true },
      extraCss: '@page { size: 148mm 210mm; margin: 12mm; }',
    }),
  );
  expect(await snapshot(page)).toEqual(before);
  const offline = await context.newPage();
  await offline.route('**/*', (route) => route.abort());
  await offline.setContent(html ?? '');
  await offline.evaluate(() => document.fonts.ready);
  const directory = resolve('artifacts/exports/browser');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'print-source.md'), source);
  await writeFile(resolve(directory, 'print.html'), html ?? '');
  const pdf = await offline.pdf({
    path: resolve(directory, 'print.pdf'),
    printBackground: true,
    preferCSSPageSize: true,
  });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
});

test('synthetic composition state rejects HTML export without changing the active document', async ({
  page,
}) => {
  await createImageEditor(page, { source: 'Alpha', context: 'doc-a' });
  await focusEnd(page);
  await imageFrame(page)
    .locator('#write')
    .evaluate((element) =>
      element.dispatchEvent(
        new CompositionEvent('compositionstart', { bubbles: true, data: 'ni' }),
      ),
    );
  const result = await page.evaluate(async () => {
    try {
      await (window as ImageTestWindow).imageHostFixture.editors[0]?.exportHTML();
      return 'unexpected';
    } catch (error) {
      return String(error);
    }
  });
  expect(result).toMatch(/候选|编辑操作/);
  await imageFrame(page)
    .locator('#write')
    .evaluate((element) =>
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
    );
  await expect(page.locator('.marklyra-editor-frame')).toHaveCount(1);
});

test('missing image fails explicitly instead of exporting a placeholder or a temporary URL', async ({
  page,
}) => {
  await createImageEditor(page, {
    source: '![missing](missing.png)',
    context: 'doc-a',
    resolve: 'missing',
  });
  const result = await page.evaluate(async () => {
    try {
      await (window as ImageTestWindow).imageHostFixture.editors[0]?.exportHTML();
      return 'unexpected';
    } catch (error) {
      return String(error);
    }
  });
  expect(result).toContain('图片不可用');
  expect(await imageSource(page)).toBe('![missing](missing.png)');
  await expect(page.locator('.marklyra-editor-frame')).toHaveCount(1);
});

for (const action of ['edit', 'load', 'destroy'] as const) {
  test(`in-flight export cancels after active ${action} and never leaves its renderer behind`, async ({
    page,
  }) => {
    await createImageEditor(page, {
      source: '![pixel](images/pixel.png)\n\nAfter',
      context: 'doc-a',
      resolve: 'defer',
    });
    await expect
      .poll(() => page.evaluate(() => (window as ImageTestWindow).imageHostFixture.resolves.length))
      .toBe(1);
    await page.evaluate(() =>
      (window as ImageTestWindow).imageHostFixture.releaseResolves('doc-a'),
    );
    await expectDecodedImage(page);
    await beginExport(page);
    await expect
      .poll(() => page.evaluate(() => (window as ImageTestWindow).imageHostFixture.resolves.length))
      .toBe(2);
    if (action === 'edit') {
      await focusEnd(page);
      await page.keyboard.press('End');
      await page.keyboard.type('X');
    } else
      await page.evaluate(async (action) => {
        const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
        if (action === 'load') await editor?.load('Other', { documentContext: 'doc-b' });
        else editor?.destroy();
      }, action);
    await page.evaluate(() =>
      (window as ImageTestWindow).imageHostFixture.releaseResolves('doc-a'),
    );
    await expect
      .poll(() => page.evaluate(() => (window as ExportWindow).exportJob?.state))
      .toBe('rejected');
    await expect(page.locator('.marklyra-editor-frame')).toHaveCount(action === 'destroy' ? 0 : 1);
    if (action === 'edit') expect(await imageSource(page)).toContain('AfterX');
    if (action === 'load') expect(await imageSource(page)).toBe('Other');
  });
}

for (const theme of ['marklyra-light', 'marklyra-dark'] as const) {
  test(`bundled ${theme} theme retains CSS and loads every exported font offline`, async ({
    page,
    context,
  }) => {
    await createImageEditor(page, { source: '# Theme\n\nRendered paragraph.', context: 'doc-a' });
    await page.evaluate(
      (theme) =>
        (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({
          type: 'setTheme',
          theme,
        }),
      theme,
    );
    const write = imageFrame(page).locator('#write');
    await expect
      .poll(() =>
        write.evaluate((_element, theme) => {
          const sheet = document.querySelector<HTMLLinkElement>('#theme_css');
          return Boolean(sheet?.href.endsWith(`/${theme}.css`) && sheet.sheet?.cssRules.length);
        }, theme),
      )
      .toBe(true);
    await write.evaluate(async () => {
      // Theme readiness is not the end of the runtime CSS color transition.
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    const live = await write.evaluate((element) => ({
      family: getComputedStyle(element).fontFamily,
      color: getComputedStyle(element).color,
      background: getComputedStyle(document.body).backgroundColor,
      fonts: Array.from(
        document.querySelector<HTMLLinkElement>('#theme_css')?.sheet?.cssRules ?? [],
      ).filter((rule) => rule.type === CSSRule.FONT_FACE_RULE).length,
    }));
    const html = await page.evaluate(() =>
      (window as ImageTestWindow).imageHostFixture.editors[0]?.exportHTML(),
    );
    const offline = await context.newPage(),
      requests: string[] = [];
    await offline.route('**/*', (route) => {
      requests.push(route.request().url());
      return route.abort();
    });
    await offline.setContent(html ?? '');
    const rendered = await offline.evaluate(async () => {
      const fonts = Array.from(document.fonts);
      await Promise.all(fonts.map((font) => font.load()));
      const write = document.querySelector('#write');
      if (!write) throw new Error('Missing export structure');
      return {
        family: getComputedStyle(write).fontFamily,
        color: getComputedStyle(write).color,
        background: getComputedStyle(document.body).backgroundColor,
        fonts: fonts.length,
        loaded: fonts.every((font) => font.status === 'loaded'),
        styles: document.querySelectorAll('style').length,
        hasThemeCss: [...document.querySelectorAll('style')].some((style) =>
          style.textContent?.includes('#write'),
        ),
      };
    });
    expect(rendered.family).toBe(live.family);
    expect(rendered.color).toBe(live.color);
    expect(rendered.background).toBe(live.background);
    expect(rendered.fonts).toBe(live.fonts);
    expect(rendered.loaded).toBe(true);
    expect(rendered.styles).toBeGreaterThan(2);
    expect(rendered.hasThemeCss).toBe(true);
    expect(requests).toEqual([]);
  });
}

test('ungranted remote images fail self-contained export explicitly', async ({ page }) => {
  const source = '![remote](https://example.invalid/private.png)';
  await createImageEditor(page, { source, context: 'doc-a', resolve: 'missing' });
  const result = await page.evaluate(async () => {
    try {
      await (window as ImageTestWindow).imageHostFixture.editors[0]?.exportHTML();
      return 'unexpected';
    } catch (error) {
      return String(error);
    }
  });
  expect(result).toContain('图片不可用');
  expect(await imageSource(page)).toBe(source);
});

for (const [name, source] of Object.entries({
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="url(https://example.invalid/paint.svg#p)"/></svg>',
  image: `<div style="background:image('https://example.invalid/a.png')">image</div>`,
  expression: '<div style="width:expression(alert(1))">expression</div>',
})) {
  test(`static export rejects surviving original ${name} resource syntax instead of emitting an incomplete document`, async ({
    page,
  }) => {
    await page.route('https://example.invalid/**', (route) => route.abort());
    await createImageEditor(page, { source, context: 'doc-a' });
    const before = await snapshot(page);
    const result = await page.evaluate(async () => {
      try {
        await (window as ImageTestWindow).imageHostFixture.editors[0]?.exportHTML();
        return 'unexpected';
      } catch (error) {
        return String(error);
      }
    });
    expect(result).toMatch(/样式含未内嵌/);
    expect(await snapshot(page)).toEqual(before);
    expect(await imageSource(page)).toBe(source);
    await expect(page.locator('.marklyra-editor-frame')).toHaveCount(1);
  });
}

test('Markdown export embeds the document images and leaves code samples alone', async ({
  page,
}) => {
  const source =
    '---\ntitle: T\n---\n\n# Heading\n\n![pixel](images/pixel.png)\n\n```\n![code](images/pixel.png)\n```\n';
  await createImageEditor(page, { source, context: 'doc-a' });
  await expectDecodedImage(page);
  const before = await snapshot(page);
  const result = await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.exportMarkdown(),
  );
  expect(result?.markdown).toMatch(/!\[pixel\]\(data:image\/png;base64,[A-Za-z0-9+/=]+\)/);
  expect(result?.markdown).toContain('```\n![code](images/pixel.png)\n```');
  expect(result?.markdown).toContain('title: T');
  expect(result?.missing).toEqual([]);
  expect(await snapshot(page)).toEqual(before);
});

test('Markdown export keeps unresolvable images as written and reports them', async ({ page }) => {
  const source = '# Heading\n\n![gone](images/missing.png)\n';
  await createImageEditor(page, { source, context: 'doc-a', resolve: 'missing' });
  const result = await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.exportMarkdown(),
  );
  expect(result?.markdown).toBe(source);
  expect(result?.missing).toEqual(['images/missing.png']);
});

test('HTML export unlinks relative document links instead of failing the export', async ({
  page,
}) => {
  const source =
    '# Title\n\nSee [next](02-next.md), [up](../up/doc.md#part), [web](https://example.test/a) and [here](#title).\n';
  await createImageEditor(page, { source, context: 'doc-a' });
  const html = await page.evaluate(() =>
    (window as ImageTestWindow).imageHostFixture.editors[0]?.exportHTML(),
  );
  const links = await page.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html ?? '', 'text/html');
    return [...doc.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
  }, html);
  expect(links).toEqual([
    ['next', null],
    ['up', null],
    ['web', 'https://example.test/a'],
    ['here', '#title'],
  ]);
});
