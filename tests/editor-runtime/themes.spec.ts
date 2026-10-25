import { readFileSync } from 'node:fs';
import type { MarkLyraEditor, ThemeAppearance, ThemeStyles } from '@marklyra/editor-runtime';
import { expect, type Frame, type Page, test } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type Host = Window & {
  marklyraEditor: MarkLyraEditor;
  themeTest: {
    errors: string[];
    appearances: ThemeAppearance[];
    state?: string;
    jobs?: { first: string; second: string };
  };
};
type Child = Window & {
  editor: LegacyEditor;
  themeIdentity?: { area: HTMLElement; paragraph: Element; text: Node | null };
};
const root = 'http://127.0.0.1:4174/__theme_test__/';
const source = '\uFEFF# Theme\r\n\r\nAlpha **bold**\n';
const css: Record<string, string> = {
  'custom.css':
    ':root{--side-bar-bg-color:rgb(21,22,23)}body{background:rgb(240,241,242)}#write p{color:rgb(40,41,42)}',
  'base.user.css': '#write p{color:rgb(50,51,52)}',
  'custom.user.css': '#write p{color:rgb(60,61,62)}#marklyra-sidebar{font-size:15px}',
  'blue.css': 'body{background:rgb(225,235,245)}#write p{color:rgb(10,20,180)}',
  'export.css': '@import "shared.css";body{color:rgb(14,27,39);background-image:url("pixel.png")}',
  'shared.css': 'h1{color:rgb(20,80,130)}',
  'nested.css': '@import "level.css";body{background:rgb(100,110,120)}',
  'level.css': '@import "missing.css";',
  'local-only.css':
    '@font-face{font-family:"Local Alias";src:local("Arial")}#write{font-family:"Local Alias",serif}',
  'namespaced.css':
    '@import "namespaced-level.css";#legacy-editor-source .CodeMirror{font-size:19px}body.legacy-editor-export #write p{color:rgb(130,51,65)}body:not(.legacy-editor-export) #write p{color:rgb(13,25,37)}#custom-sidebar{font-size:3px}#write[data-note="#legacy-editor-source"]{--literal:"url(#legacy-editor-sidebar)"}',
  'namespaced-level.css': '@import "namespaced-inner.css";#legacy-editor-sidebar{font-size:17px}',
  'namespaced-inner.css': '@media screen{.cm-s-legacy-editor-default{--namespace-default:enabled}}',
};
const styles: ThemeStyles = {
  theme: `${root}custom.css`,
  baseUser: `${root}base.user.css`,
  themeUser: `${root}custom.user.css`,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window === window.top) return;
    const schedule = window.setTimeout;
    const clear = window.clearTimeout;
    const probe = { pending: new Set<number>(), completed: 0 };
    Reflect.set(window, 'themeLoadTimers', probe);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay !== 80 || typeof handler !== 'function') return schedule(handler, delay, ...args);
      let id = 0;
      id = schedule(() => {
        try {
          Reflect.apply(handler, window, args);
        } finally {
          probe.pending.delete(id);
          probe.completed++;
        }
      }, delay);
      probe.pending.add(id);
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = (id) => {
      if (typeof id === 'number') probe.pending.delete(id);
      clear(id);
    };
  });
});

async function mount(page: Page): Promise<Frame> {
  await page.route(`${root}**`, async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1) ?? '';
    if (name === 'font-fallback.css') {
      await route.fulfill({
        contentType: 'text/css',
        body: '@font-face{font-family:"Fallback Alias";src:local("Missing (Fallback)"),url("font(1).woff2") format("woff2")}#write{font-family:"Fallback Alias",serif}p::after{content:"url(https://literal.invalid/path)"}',
      });
    } else if (name === 'font(1).woff2') {
      await route.fulfill({
        contentType: 'font/woff2',
        body: readFileSync(
          new URL(
            '../../packages/editor-runtime/dist/page/style/Raleway-latin.woff2',
            import.meta.url,
          ),
        ),
      });
    } else if (name === 'font-data.css') {
      const bytes = readFileSync(
        new URL(
          '../../packages/editor-runtime/dist/page/style/Raleway-latin.woff2',
          import.meta.url,
        ),
      );
      await route.fulfill({
        contentType: 'text/css',
        body: `@font-face{font-family:"Transfer Test";src:url("data:font/woff2;base64,${bytes.toString('base64')}")}#write{font-family:"Transfer Test",sans-serif}`,
      });
    } else if (name === 'pixel.png') {
      await route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
          'base64',
        ),
      });
    } else
      await route.fulfill({
        status: css[name] ? 200 : 404,
        contentType: 'text/css',
        body: css[name] ?? '',
      });
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as unknown as Host;
    await host.marklyraEditor.ready;
    const Constructor = host.marklyraEditor.constructor as typeof MarkLyraEditor;
    host.marklyraEditor.destroy();
    const container = document.querySelector<HTMLElement>('#editor');
    if (!container) throw new Error('Missing editor');
    host.themeTest = { errors: [], appearances: [] };
    host.marklyraEditor = new Constructor(container, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      onError: (error) => host.themeTest.errors.push(error.message),
      onThemeAppearanceChange: (appearance) => host.themeTest.appearances.push(appearance),
    });
    await host.marklyraEditor.ready;
  }, source);
  const frame = page.frames().find((entry) => entry.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw new Error('Missing runtime');
  // Original Editor.reset owns an 80ms refresh after ready. Its completion is
  // observed so that a test caret is not replaced by the initial load callback.
  await frame.waitForFunction(() => {
    const probe = Reflect.get(window, 'themeLoadTimers') as {
      pending: Set<number>;
      completed: number;
    };
    return probe.completed > 0 && probe.pending.size === 0;
  });
  return frame;
}

async function snapshot(frame: Frame) {
  return frame.evaluate(() => {
    const { editor } = window as unknown as Child;
    const range = getSelection();
    return {
      history: JSON.stringify(editor.undo.commandStack),
      index: editor.undo.index,
      selection: editor.selection.buildUndo(),
      focus: document.activeElement?.tagName,
      anchor: range?.anchorOffset,
      head: range?.focusOffset,
    };
  });
}

async function focusEnd(frame: Frame) {
  await frame.locator('#write p').click();
  await frame.page().keyboard.press('End');
  await frame.evaluate(() => {
    const child = window as unknown as Child;
    const area = child.editor.writingArea;
    const paragraph = area.querySelector('p');
    if (!paragraph) throw new Error('Missing paragraph');
    child.themeIdentity = { area, paragraph, text: paragraph.firstChild };
    area.focus();
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let end = walker.nextNode();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) end = node;
    if (!end) throw new Error('Missing paragraph Text endpoint');
    getSelection()?.setBaseAndExtent(
      end,
      end.textContent?.length ?? 0,
      end,
      end.textContent?.length ?? 0,
    );
  });
  // The original engine consumes selectionchange asynchronously. Establish a
  // coherent original bookmark before comparing the effect of a style update.
  await expect
    .poll(() => frame.evaluate(() => (window as unknown as Child).editor.selection.buildUndo()))
    .toMatchObject({ type: 'cursor', start: 14, end: 14 });
}

async function apply(
  page: Page,
  value: Partial<ThemeStyles>,
  theme?: 'marklyra-light' | 'marklyra-dark',
) {
  return page.evaluate(
    ({ value, theme }) => (window as unknown as Host).marklyraEditor.setThemeStyles(value, theme),
    { value, theme },
  );
}

test('namespaced editor roles keep user theme source, imported styles, source mode and offline export', async ({
  page,
  context,
}) => {
  const frame = await mount(page);
  await frame.evaluate(() => {
    const custom = document.createElement('aside');
    custom.id = 'custom-sidebar';
    custom.style.display = 'none';
    document.body.append(custom);
  });
  await focusEnd(frame);
  const before = await snapshot(frame);
  const appearance = await apply(page, { theme: `${root}namespaced.css` });
  expect(appearance['--marklyra-sidebar-font-size']).toBe('17px');
  expect(await snapshot(frame)).toEqual(before);
  await expect(frame.locator('#write p')).toHaveCSS('color', 'rgb(13, 25, 37)');
  await expect(frame.locator('#custom-sidebar')).toHaveCSS('font-size', '3px');
  const fetched = await frame.evaluate(async (root) => {
    return Promise.all(
      ['namespaced.css', 'namespaced-level.css', 'namespaced-inner.css'].map(async (name) =>
        (await fetch(`${root}${name}`)).text(),
      ),
    );
  }, root);
  expect(fetched).toEqual([
    css['namespaced.css'],
    css['namespaced-level.css'],
    css['namespaced-inner.css'],
  ]);
  const selectors = await frame.evaluate(() => {
    const sheet = document.querySelector<HTMLLinkElement>('#theme_css')?.sheet;
    if (!sheet) throw Error('Missing current user theme');
    return [...sheet.cssRules]
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      .map((rule) => rule.selectorText);
  });
  expect(selectors).toContain('#custom-sidebar');
  expect(selectors).toContain('#write[data-note="#legacy-editor-source"]');
  expect(selectors.some((selector) => selector.includes(':is(#legacy-editor-source,'))).toBe(true);

  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
  );
  await expect(frame.locator('#marklyra-source .CodeMirror')).toHaveCSS('font-size', '19px');
  expect(
    await frame
      .locator('#marklyra-source .CodeMirror')
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--namespace-default').trim(),
      ),
  ).toBe('enabled');
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
    source,
  );
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
  );
  const html = await page.evaluate(() => (window as unknown as Host).marklyraEditor.exportHTML());
  const offline = await context.newPage();
  try {
    await offline.route('**/*', (route) => route.abort());
    await offline.setContent(html);
    await expect(offline.locator('#write p')).toHaveCSS('color', 'rgb(130, 51, 65)');
    expect(html).toContain('legacy-editor-export');
    expect(html).toContain('marklyra-export');
    expect(html).toContain('url(#legacy-editor-sidebar)');
  } finally {
    await offline.close();
  }
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
    source,
  );
  expect((await snapshot(frame)).history).toBe(before.history);
  expect(await page.evaluate(() => (window as unknown as Host).themeTest.errors)).toEqual([]);
});

test('theme/base-user/theme-user retain original link order, source, range, DOM and history', async ({
  page,
}) => {
  const frame = await mount(page);
  await focusEnd(frame);
  const before = await snapshot(frame);
  const skin = await apply(page, styles);
  expect(skin['--marklyra-sidebar-font-size']).toBe('15px');
  expect(skin['--marklyra-body-bg']).toBe('rgb(240, 241, 242)');
  expect(
    await frame.locator('#write p').evaluate((element) => getComputedStyle(element).color),
  ).toBe('rgb(60, 61, 62)');
  expect(
    await frame
      .locator('link[id$="css"]')
      .evaluateAll((elements) =>
        elements
          .filter((element) =>
            ['theme_css', 'base_user_css', 'theme_user_css'].includes(element.id),
          )
          .map((element) => element.id),
      ),
  ).toEqual(['theme_css', 'base_user_css', 'theme_user_css']);
  expect(await snapshot(frame)).toEqual(before);
  expect(
    await frame.evaluate(() => {
      const child = window as unknown as Child;
      return (
        child.themeIdentity?.area === child.editor.writingArea &&
        child.themeIdentity.paragraph === child.editor.writingArea.querySelector('p') &&
        child.themeIdentity.text === child.themeIdentity.paragraph.firstChild
      );
    }),
  ).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
    source,
  );
  expect(await frame.locator('[data-marklyra-theme-probe]').count()).toBe(0);
});

test('failed replacement restores the prior complete cascade and keeps editing usable', async ({
  page,
}) => {
  const frame = await mount(page);
  await apply(page, styles);
  await focusEnd(frame);
  const before = await snapshot(frame);
  const hrefs = await frame
    .locator('#theme_css,#base_user_css,#theme_user_css')
    .evaluateAll((elements) => elements.map((element) => (element as HTMLLinkElement).href));
  await expect(apply(page, { theme: `${root}missing.css` }, 'marklyra-dark')).rejects.toThrow(
    'could not be loaded',
  );
  expect(
    await frame
      .locator('#theme_css,#base_user_css,#theme_user_css')
      .evaluateAll((elements) => elements.map((element) => (element as HTMLLinkElement).href)),
  ).toEqual(hrefs);
  expect(await snapshot(frame)).toEqual(before);
  expect(
    await frame.locator('#write p').evaluate((element) => getComputedStyle(element).color),
  ).toBe('rgb(60, 61, 62)');
  await frame.locator('#write p').click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toContain(
    'X',
  );
});

test('queued style updates converge and ordinary input does not trigger appearance/probe loops', async ({
  page,
}) => {
  const frame = await mount(page);
  await page.evaluate(
    async ({ first, root }) => {
      const editor = (window as unknown as Host).marklyraEditor;
      await Promise.all([
        editor.setThemeStyles(first),
        editor.setThemeStyles({ theme: `${root}blue.css` }),
      ]);
      await editor.getThemeAppearance();
    },
    { first: styles, root },
  );
  expect(
    await frame.locator('#write p').evaluate((element) => getComputedStyle(element).color),
  ).toBe('rgb(10, 20, 180)');
  await frame.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  const count = await page.evaluate(() => (window as unknown as Host).themeTest.appearances.length);
  await frame.locator('#write p').click();
  await page.keyboard.press('End');
  await page.keyboard.type('1234567890');
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
  await frame.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  expect(await page.evaluate(() => (window as unknown as Host).themeTest.appearances.length)).toBe(
    count,
  );
  expect(await frame.locator('[data-marklyra-theme-probe]').count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as Host).themeTest.errors)).toEqual([]);
});

test('style updates wait for composition and destroy rejects a waiting update', async ({
  page,
}) => {
  const frame = await mount(page);
  await focusEnd(frame);
  await frame.locator('#write').dispatchEvent('compositionstart', { data: '' });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).marklyraEditor.isComposing))
    .toBe(true);
  await page.evaluate((styles) => {
    const host = window as unknown as Host;
    host.themeTest.state = 'pending';
    void host.marklyraEditor.setThemeStyles(styles).then(() => {
      host.themeTest.state = 'done';
    });
  }, styles);
  expect(await frame.locator('#theme_css').getAttribute('href')).not.toContain('__theme_test__');
  expect(await page.evaluate(() => (window as unknown as Host).themeTest.state)).toBe('pending');
  await frame.locator('#write').dispatchEvent('compositionend', { data: '' });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).themeTest.state))
    .toBe('done');
  await frame.locator('#write').dispatchEvent('compositionstart', { data: '' });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).marklyraEditor.isComposing))
    .toBe(true);
  expect(
    await page.evaluate(async () => {
      const host = window as unknown as Host;
      const pending = host.marklyraEditor.setThemeStyles({});
      host.marklyraEditor.destroy();
      try {
        await pending;
        return 'resolved';
      } catch (error) {
        return String(error);
      }
    }),
  ).toContain('destroyed');
});

test('custom CSS imports and image resources export offline in cascade order', async ({
  page,
  context,
}) => {
  await mount(page);
  await apply(page, {
    theme: `${root}export.css`,
    baseUser: styles.baseUser,
    themeUser: styles.themeUser,
  });
  const html = await page.evaluate(() => (window as unknown as Host).marklyraEditor.exportHTML());
  expect(html).toContain('data:image/png;base64,');
  expect(html).not.toContain('@import');
  expect(html).not.toContain(`${root}pixel.png`);
  const offline = await context.newPage();
  const network: string[] = [];
  await offline.route('**/*', (route) => {
    network.push(route.request().url());
    return route.abort();
  });
  await offline.setContent(html);
  expect(await offline.locator('h1').evaluate((element) => getComputedStyle(element).color)).toBe(
    'rgb(20, 80, 130)',
  );
  expect(
    await offline
      .locator('p')
      .first()
      .evaluate((element) => getComputedStyle(element).color),
  ).toBe('rgb(60, 61, 62)');
  expect(network).toEqual([]);
  await offline.close();
});

test('a cancelled composition wait rejects promptly and does not block the next style update', async ({
  page,
}) => {
  const frame = await mount(page);
  await frame.locator('#write').dispatchEvent('compositionstart', { data: '' });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).marklyraEditor.isComposing))
    .toBe(true);
  expect(
    await page.evaluate(async (styles) => {
      const editor = (window as unknown as Host).marklyraEditor;
      const controller = new AbortController();
      const pending = editor.setThemeStyles(styles, undefined, controller.signal);
      // Let the queued operation enter its composition wait before cancelling it.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      controller.abort();
      try {
        await pending;
        return 'resolved';
      } catch (error) {
        return String(error);
      }
    }, styles),
  ).toContain('cancelled');
  expect(await frame.locator('#theme_css').getAttribute('href')).not.toContain('__theme_test__');
  await frame.locator('#write').dispatchEvent('compositionend', { data: '' });
  await apply(page, styles);
  expect(
    await frame.locator('#write p').evaluate((element) => getComputedStyle(element).color),
  ).toBe('rgb(60, 61, 62)');
  expect(await page.evaluate(() => (window as unknown as Host).themeTest.errors)).toEqual([]);
});

test('nested missing imports reject the candidate instead of acknowledging an incomplete cascade', async ({
  page,
}) => {
  const frame = await mount(page);
  await apply(page, styles);
  const old = await frame.locator('#theme_css').getAttribute('href');
  await expect(apply(page, { theme: `${root}nested.css` })).rejects.toThrow('could not be loaded');
  expect(await frame.locator('#theme_css').getAttribute('href')).toBe(old);
  expect(
    await frame.locator('#write p').evaluate((element) => getComputedStyle(element).color),
  ).toBe('rgb(60, 61, 62)');
});

test('data font CSS renders in the real runtime policy and crosses the SDK as bounded font bytes', async ({
  page,
}) => {
  const frame = await mount(page);
  await apply(page, { theme: `${root}font-data.css` });
  expect(
    await frame.evaluate(async () => {
      const faces = await document.fonts.load('16px "Transfer Test"');
      return faces.map((face) => ({ family: face.family, status: face.status }));
    }),
  ).toEqual([{ family: 'Transfer Test', status: 'loaded' }]);
  const bytes = readFileSync(
    new URL('../../packages/editor-runtime/dist/page/style/Raleway-latin.woff2', import.meta.url),
  );
  expect(
    await page.evaluate(async () => {
      const fonts = await (window as unknown as Host).marklyraEditor.getThemeFonts();
      return fonts.map((font) => ({
        family: font.family,
        sizes: font.sources.map((source) => (source.kind === 'data' ? source.bytes.byteLength : 0)),
      }));
    }),
  ).toEqual([{ family: 'Transfer Test', sizes: [bytes.byteLength] }]);
});

test('local-only font aliases cannot silently disappear from a styled self-contained export', async ({
  page,
}) => {
  await mount(page);
  await apply(page, { theme: `${root}local-only.css` });
  await expect(
    page.evaluate(() => (window as unknown as Host).marklyraEditor.exportHTML()),
  ).rejects.toThrow('本机字体');
  const unstyled = await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.exportHTML({ styled: false }),
  );
  expect(unstyled).toContain('Alpha');
});

for (const succeeds of [true, false]) {
  test(`legacy theme command queues behind ${succeeds ? 'successful' : 'failed'} user styles and keeps the latest sources`, async ({
    page,
  }) => {
    const frame = await mount(page);
    await apply(page, styles);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = () => {};
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    await page.route(`${root}controlled.css`, async (route) => {
      started();
      await gate;
      await route.fulfill({
        status: succeeds ? 200 : 404,
        contentType: 'text/css',
        body: '#write p{color:rgb(110,120,130)}',
      });
    });
    await page.evaluate((root) => {
      const host = window as unknown as Host;
      const jobs = { first: 'pending', second: 'pending' };
      host.themeTest.jobs = jobs;
      void host.marklyraEditor
        .setThemeStyles({ baseUser: `${root}controlled.css` }, 'marklyra-light')
        .then(
          () => {
            jobs.first = 'resolved';
          },
          () => {
            jobs.first = 'rejected';
          },
        );
    }, root);
    await entered;
    await page.evaluate(() => {
      const host = window as unknown as Host;
      void host.marklyraEditor.execute({ type: 'setTheme', theme: 'marklyra-dark' }).then(
        () => {
          if (host.themeTest.jobs) host.themeTest.jobs.second = 'resolved';
        },
        () => {
          if (host.themeTest.jobs) host.themeTest.jobs.second = 'rejected';
        },
      );
    });
    release();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Host).themeTest.jobs))
      .toEqual({ first: succeeds ? 'resolved' : 'rejected', second: 'resolved' });
    expect(await frame.evaluate(() => Reflect.get(window, '_options').theme)).toBe('marklyra-dark');
    expect(
      await page.evaluate(() =>
        Reflect.get((window as unknown as Host).marklyraEditor, 'activeTheme'),
      ),
    ).toBe('marklyra-dark');
    expect(
      await frame.locator('#write p').evaluate((element) => getComputedStyle(element).color),
    ).toBe(succeeds ? 'rgb(110, 120, 130)' : 'rgb(60, 61, 62)');
  });
}

test('the same style URL can be retried after a transient verification failure', async ({
  page,
}) => {
  const frame = await mount(page);
  let fail = true;
  let verifications = 0;
  await page.route(`${root}transient.css`, async (route) => {
    const verification = route.request().resourceType() === 'fetch';
    if (verification) verifications++;
    await route.fulfill({
      status: verification && fail ? 503 : 200,
      contentType: 'text/css',
      body: '#write p{color:rgb(11,22,33)}',
    });
  });
  await expect(apply(page, { theme: `${root}transient.css` })).rejects.toThrow();
  fail = false;
  await apply(page, { theme: `${root}transient.css` });
  expect(verifications).toBeGreaterThanOrEqual(2);
  expect(
    await frame.locator('#write p').evaluate((element) => getComputedStyle(element).color),
  ).toBe('rgb(11, 22, 33)');
});

test('font fallback names and URL parentheses export without changing literal CSS text', async ({
  page,
  context,
}) => {
  await mount(page);
  await apply(page, { theme: `${root}font-fallback.css` });
  const html = await page.evaluate(() => (window as unknown as Host).marklyraEditor.exportHTML());
  expect(html).toContain('data:font/woff2;base64,');
  expect(html).toContain('url(https://literal.invalid/path)');
  const offline = await context.newPage();
  const network: string[] = [];
  await offline.route('**/*', (route) => {
    network.push(route.request().url());
    return route.abort();
  });
  await offline.setContent(html);
  expect(
    await offline.evaluate(async () => {
      const faces = await document.fonts.load('16px "Fallback Alias"');
      return faces.length > 0 && faces.every((face) => face.status === 'loaded');
    }),
  ).toBe(true);
  expect(network).toEqual([]);
  await offline.close();
});
