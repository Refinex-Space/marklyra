import type {
  ContextAction,
  ContextMenuRequest,
  MarkLyraEditor,
  MarkLyraEditorPreferences,
} from '@marklyra/editor-runtime';
import { expect, type Frame, type Page, test } from '@playwright/test';
import type {
  LegacyConfigurableCodeMirror,
  LegacyEditor,
} from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type Host = Window & {
  marklyraEditor: MarkLyraEditor;
  livePreferences: {
    errors: string[];
    pending: 'idle' | 'pending' | 'resolved' | string;
    request?: ContextMenuRequest;
    pick?: (action: ContextAction | null) => void;
  };
};
type Child = Window & {
  editor: LegacyEditor;
  livePreferenceNodes?: { area: HTMLElement; paragraph: Element; text: Node | null };
};
interface MirrorElement extends HTMLElement {
  CodeMirror?: LegacyConfigurableCodeMirror;
}

async function mount(page: Page, source = 'Alpha') {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as unknown as Host;
    await host.marklyraEditor.ready;
    const Constructor = host.marklyraEditor.constructor as typeof MarkLyraEditor;
    host.marklyraEditor.destroy();
    const root = document.querySelector<HTMLElement>('#editor');
    if (!root) throw Error('Missing editor mount');
    host.livePreferences = { errors: [], pending: 'idle' };
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      onError: (error) => host.livePreferences.errors.push(error.message),
      host: {
        contextMenu: {
          show(request, pick) {
            host.livePreferences.request = request;
            host.livePreferences.pick = pick;
          },
        },
      },
    });
    await host.marklyraEditor.ready;
  }, source);
  const frame = page.frames().find((entry) => entry.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing runtime runtime');
  return frame;
}

async function preferences(page: Page, change: Partial<MarkLyraEditorPreferences>) {
  await page.evaluate(
    (change) => (window as unknown as Host).marklyraEditor.setPreferences(change),
    change,
  );
}
async function flush(page: Page) {
  return page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
}
async function focusEnd(frame: Frame) {
  await frame.evaluate(() => {
    const area = (window as unknown as Child).editor.writingArea;
    const paragraph = area.querySelector('p:last-child');
    if (!paragraph) throw Error('Missing paragraph');
    area.focus();
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(false);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  });
}
async function font(frame: Frame) {
  return frame.evaluate(async () => {
    const paragraph = document.querySelector('#write > p') ?? document.body;
    const ancestors: Element[] = [];
    for (let node: Element | null = paragraph; node; node = node.parentElement)
      ancestors.push(node);
    // The runtime can animate font-size on <content> for 400ms.
    // Await its actual transition rather than sampling an inherited intermediate
    // size, changing the expected pixels, or delaying the document with a sleep.
    for (;;) {
      getComputedStyle(paragraph).fontSize;
      const transitions = ancestors
        .flatMap((node) => node.getAnimations())
        .filter(
          (animation) =>
            animation instanceof CSSTransition &&
            animation.transitionProperty === 'font-size' &&
            (animation.playState === 'running' || animation.pending),
        );
      if (!transitions.length) break;
      await Promise.all(transitions.map((animation) => animation.finished.catch(() => {})));
    }
    return {
      inline: document.documentElement.style.fontSize,
      root: getComputedStyle(document.documentElement).fontSize,
      paragraph: getComputedStyle(paragraph).fontSize,
    };
  });
}
async function sourceOptions(frame: Frame) {
  return frame.evaluate(() => {
    const cm = (window as unknown as Child).editor.sourceView.cm;
    if (!cm) throw Error('Missing source CodeMirror');
    return {
      brackets: cm.getOption('autoCloseBrackets'),
      tags: cm.getOption('autoCloseTags'),
    };
  });
}

test('live font preferences affect computed text size and restore theme without replacing document nodes', async ({
  page,
}) => {
  const source = '\uFEFF# Heading\r\n\r\nAlpha 中文\n';
  const frame = await mount(page, source);
  const before = await font(frame);
  await frame.evaluate(() => {
    const area = (window as unknown as Child).editor.writingArea;
    const paragraph = area.querySelector('p');
    if (!paragraph) throw Error('Missing paragraph');
    (window as unknown as Child).livePreferenceNodes = {
      area,
      paragraph,
      text: paragraph.firstChild,
    };
  });
  for (const size of [14, 18]) {
    await preferences(page, { useCustomFontSize: true, customFontSize: size });
    expect(await font(frame)).toEqual({
      inline: `${size}px`,
      root: `${size}px`,
      paragraph: `${size}px`,
    });
  }
  await preferences(page, { useCustomFontSize: false });
  expect(await font(frame)).toEqual(before);
  expect(
    await frame.evaluate(() => {
      const child = window as unknown as Child;
      const saved = child.livePreferenceNodes;
      return Boolean(
        saved &&
          saved.area === child.editor.writingArea &&
          saved.paragraph === saved.area.querySelector('p') &&
          saved.text === saved.paragraph.firstChild,
      );
    }),
  ).toBe(true);
  expect(await flush(page)).toBe(source);
});

test('noPairingMatch changes real WYS bracket input on the existing document', async ({ page }) => {
  const frame = await mount(page, 'Pair ');
  await preferences(page, { noPairingMatch: false });
  // Real clicks produce the native text caret used by ordinary bracket pairing.
  await frame.locator('#write > p').click();
  await page.keyboard.type('(');
  expect(await flush(page)).toMatch(/\(\)$/);
  await preferences(page, { noPairingMatch: true });
  await frame.locator('#write > p').click();
  await page.keyboard.type('(');
  expect(await flush(page)).toMatch(/\(\)\($/);
});

test('source CodeMirror brackets update live while tag closing stays enabled', async ({ page }) => {
  const source = '# Source\n\nAlpha';
  const frame = await mount(page, source);
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
  );
  expect(await sourceOptions(frame)).toEqual({ brackets: true, tags: true });
  await preferences(page, { noPairingMatch: true });
  expect(await sourceOptions(frame)).toEqual({ brackets: false, tags: true });
  await preferences(page, { noPairingMatch: false });
  expect(await sourceOptions(frame)).toEqual({ brackets: true, tags: true });
  expect(await flush(page)).toBe(source);
});

test('existing fence options update while an HTML source control retains both closing options', async ({
  page,
}) => {
  const source = '```html\n<section>\n```\n\n<div>\n<span>HTML</span>\n</div>\n\nAfter';
  const frame = await mount(page, source);
  await expect(frame.locator('#write [mdtype="fences"] .CodeMirror')).toHaveCount(1);
  await frame.locator('#write [mdtype="html_block"]').first().click({ button: 'right' });
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as Host).livePreferences.pick)))
    .toBe(true);
  await page.evaluate(() => (window as unknown as Host).livePreferences.pick?.('block.edit'));
  await expect(frame.locator('#write [mdtype="html_block"] .CodeMirror')).toBeVisible();
  const options = () =>
    frame.evaluate(() => {
      const child = window as unknown as Child;
      const fence = Object.values(child.editor.fences.queue ?? {})[0];
      const html = document.querySelector<MirrorElement>(
        '#write [mdtype="html_block"] .CodeMirror',
      )?.CodeMirror;
      if (!fence || !html) throw Error('Missing real fence or HTML CodeMirror');
      const read = (cm: LegacyConfigurableCodeMirror) => ({
        brackets: cm.getOption('autoCloseBrackets'),
        tags: cm.getOption('autoCloseTags'),
      });
      return { fence: read(fence), html: read(html) };
    });
  expect(await options()).toEqual({
    fence: { brackets: true, tags: true },
    html: { brackets: true, tags: true },
  });
  await preferences(page, { noPairingMatch: true });
  expect(await options()).toEqual({
    fence: { brackets: false, tags: false },
    html: { brackets: true, tags: true },
  });
  await preferences(page, { noPairingMatch: false });
  expect(await options()).toEqual({
    fence: { brackets: true, tags: true },
    html: { brackets: true, tags: true },
  });
  expect(await flush(page)).toBe(source);
});

async function beginComposition(page: Page, frame: Frame) {
  await focusEnd(frame);
  // Synthetic event boundary only; this does not exercise an OS input-method candidate panel.
  await frame.locator('#write').evaluate((area) => {
    area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'zhong' }));
  });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).marklyraEditor.isComposing))
    .toBe(true);
  await frame.evaluate(() => {
    const area = (window as unknown as Child).editor.writingArea;
    const paragraph = area.querySelector('p');
    if (!paragraph) throw Error('Missing composing paragraph');
    (window as unknown as Child).livePreferenceNodes = {
      area,
      paragraph,
      text: paragraph.firstChild,
    };
  });
  await page.evaluate(() => {
    const host = window as unknown as Host;
    host.livePreferences.pending = 'pending';
    void host.marklyraEditor.setPreferences({ useCustomFontSize: true, customFontSize: 18 }).then(
      () => {
        host.livePreferences.pending = 'resolved';
      },
      (error: unknown) => {
        host.livePreferences.pending = String(error);
      },
    );
  });
  await frame.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await page.evaluate(() => (window as unknown as Host).livePreferences.pending)).toBe(
    'pending',
  );
}

test('synthetic composition defers preference promise and preserves controlled DOM until end', async ({
  page,
}) => {
  const source = 'Alpha';
  const frame = await mount(page, source);
  const before = await font(frame);
  await beginComposition(page, frame);
  expect(await font(frame)).toEqual(before);
  expect(
    await frame.evaluate(() => {
      const child = window as unknown as Child;
      const saved = child.livePreferenceNodes;
      return Boolean(
        saved &&
          saved.area === child.editor.writingArea &&
          saved.paragraph === saved.area.querySelector('p') &&
          saved.text === saved.paragraph.firstChild,
      );
    }),
  ).toBe(true);
  await frame
    .locator('#write')
    .evaluate((area) =>
      area.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
    );
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).livePreferences.pending))
    .toBe('resolved');
  expect(await font(frame)).toEqual({ inline: '18px', root: '18px', paragraph: '18px' });
  expect(await flush(page)).toBe(source);
});

test('destroy rejects a preference update waiting for synthetic composition', async ({ page }) => {
  const frame = await mount(page);
  await beginComposition(page, frame);
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.destroy());
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).livePreferences.pending))
    .toMatch(/Editor has been destroyed/);
  await expect(page.locator('.marklyra-editor-frame')).toHaveCount(0);
});
