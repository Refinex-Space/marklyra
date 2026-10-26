import type { MarkLyraEditor, OutlineEntry } from '@marklyra/editor-runtime';
import { expect, type Frame, type Page, test } from '@playwright/test';
import {
  outlineTree,
  visibleCurrentHeading,
} from '../../apps/desktop/src/features/outline/outline-tree.js';
import type {
  LegacyEditor,
  LegacyFile,
} from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type Host = Window & {
  marklyraEditor: MarkLyraEditor;
  outlineProbeEvents: {
    popovers: boolean[];
    pins: number;
    current: (string | null)[];
    errors: string[];
  };
};
interface ModelHeader {
  cid: string;
  get(name: string): unknown;
  isDeleted(): boolean;
}
interface TocProbe {
  headers: ModelHeader[];
  delay: number;
  refreshTimeout: number | null;
  refresh(immediate?: boolean, skipHTML?: boolean): void;
  updateHTML(...args: unknown[]): void;
}
interface InvariantProbe {
  root: HTMLElement;
  nodes: Element[];
  text: Node;
  anchor: Node | null;
  head: Node | null;
  anchorOffset: number | undefined;
  headOffset: number | undefined;
  history: string;
  index: number;
}
type Runtime = Window & {
  editor: LegacyEditor;
  File: LegacyFile;
  outlineOldHeaders?: ModelHeader[];
  outlineInvariant?: InvariantProbe;
  outlineTimerProbe?: {
    id: number;
    delay: number;
    cancelled: boolean;
    fired: boolean;
    html: number;
    modelReads: number;
    cleanup(): void;
  };
};

function observeOriginalLoadTimers() {
  if (window === window.top) return;
  const schedule = window.setTimeout,
    clear = window.clearTimeout;
  const pending = new Set<number>();
  const probe = { pending, scheduled: 0, completed: 0 };
  Reflect.set(window, 'outlineOriginalLoadTimers', probe);
  window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay !== 80 || typeof handler !== 'function') return schedule(handler, delay, ...args);
    // Editor.reset schedules refresh(..., true) at 80ms. Observe its
    // actual completion; do not fast-forward, cancel, or guess a settling delay.
    let id = 0;
    id = schedule(() => {
      try {
        Reflect.apply(handler, window, args);
      } finally {
        pending.delete(id);
        probe.completed += 1;
      }
    }, delay);
    pending.add(id);
    probe.scheduled += 1;
    return id;
  }) as typeof window.setTimeout;
  window.clearTimeout = (id) => {
    if (typeof id === 'number') pending.delete(id);
    clear(id);
  };
}
const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(observeOriginalLoadTimers);
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? [], 'Unexpected parent/child browser exceptions').toEqual([]);
});

async function mount(page: Page, source: string, settleOriginalLoad = false): Promise<Frame> {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as unknown as Host;
    await host.marklyraEditor.ready;
    const old = host.marklyraEditor,
      container = old.element.parentElement;
    if (!container) throw Error('Missing editor container');
    const Constructor = old.constructor as typeof MarkLyraEditor;
    old.destroy();
    host.outlineProbeEvents = { popovers: [], pins: 0, current: [], errors: [] };
    host.marklyraEditor = new Constructor(container, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      onOutlinePopoverChange: (open) => host.outlineProbeEvents.popovers.push(open),
      onOutlinePin: () => {
        host.outlineProbeEvents.pins += 1;
      },
      onCurrentHeadingChange: (id) => host.outlineProbeEvents.current.push(id),
      onError: (error) => host.outlineProbeEvents.errors.push(String(error)),
    });
    await host.marklyraEditor.ready;
  }, source);
  const frame = page.frames().find((frame) => frame.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing runtime runtime frame');
  if (settleOriginalLoad) {
    await frame.waitForFunction(() => {
      const probe = Reflect.get(window, 'outlineOriginalLoadTimers') as
        | { pending: Set<number>; scheduled: number; completed: number }
        | undefined;
      return Boolean(
        probe && probe.scheduled > 0 && probe.completed > 0 && probe.pending.size === 0,
      );
    });
    await frame.evaluate(async () => {
      const query = Reflect.get(window, '$') as (selector: string) => {
        queue(name: string): unknown[];
        promise(name: string): { done(callback: () => void): unknown };
      };
      const content = query('content');
      const queued = content.queue('fx').length;
      // Load/selection can leave content.animate scroll work after its
      // 80ms refresh. Wait for that actual queue; never stop or replace it.
      await new Promise<void>((resolve) => {
        content.promise('fx').done(resolve);
      });
      Reflect.set(window, 'outlineOriginalLoadFX', {
        queued,
        remaining: content.queue('fx').length,
      });
    });
  }
  return frame;
}
async function flush(page: Page) {
  return page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
}
async function assertNoErrors(page: Page) {
  expect(await page.evaluate(() => (window as unknown as Host).outlineProbeEvents.errors)).toEqual(
    [],
  );
}
async function rememberSelection(page: Page, frame: Frame) {
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.focus());
  await frame.evaluate(() => {
    const runtime = window as unknown as Runtime,
      area = runtime.editor.writingArea;
    const paragraph = Array.from(area.querySelectorAll('p')).find(
      (node) => node.textContent === 'Alpha beta',
    );
    const walker = paragraph ? document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT) : null;
    let text: Node | null = walker?.nextNode() ?? null;
    while (text && text.textContent !== 'Alpha beta') text = walker?.nextNode() ?? null;
    // The runtime bundle exposes its model as window.Node; DOM nodeType 3
    // remains the standard text-node discriminator in this actual runtime.
    if (!text || text.nodeType !== 3)
      throw Error(
        `Missing exact plain body text: ${JSON.stringify([...area.querySelectorAll('p')].map((node) => ({ text: node.textContent, html: node.innerHTML })))}`,
      );
    area.focus();
    const selection = getSelection();
    selection?.setBaseAndExtent(text, 5, text, 0);
    runtime.outlineInvariant = {
      root: area,
      nodes: [...area.children],
      text,
      anchor: selection?.anchorNode ?? null,
      head: selection?.focusNode ?? null,
      anchorOffset: selection?.anchorOffset,
      headOffset: selection?.focusOffset,
      history: JSON.stringify(runtime.editor.undo.commandStack),
      index: runtime.editor.undo.index,
    };
  });
}
async function invariant(frame: Frame) {
  return frame.evaluate(() => {
    const runtime = window as unknown as Runtime,
      before = runtime.outlineInvariant;
    if (!before) throw Error('Missing preserved editor state');
    const selection = getSelection(),
      area = runtime.editor.writingArea;
    return {
      root: area === before.root,
      blocks:
        before.nodes.length === area.children.length &&
        before.nodes.every((node, i) => node === area.children[i]),
      textNode: before.text.isConnected && area.contains(before.text),
      range:
        selection?.anchorNode === before.anchor &&
        selection?.focusNode === before.head &&
        selection?.anchorOffset === before.anchorOffset &&
        selection?.focusOffset === before.headOffset,
      history:
        JSON.stringify(runtime.editor.undo.commandStack) === before.history &&
        runtime.editor.undo.index === before.index,
    };
  });
}
const preserved = { root: true, blocks: true, textNode: true, range: true, history: true };

test('outline-only navigation preserves the editing range and rejects a stale heading without mutating history', async ({
  page,
}) => {
  const source = '\uFEFF# First\r\n\r\nAlpha beta\n\n## Later\r\n\r\nTail';
  const frame = await mount(page, source);
  await rememberSelection(page, frame);
  await page.keyboard.type('X');
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }));
  expect(await flush(page)).toBe(source);
  await rememberSelection(page, frame);
  const id = await page.evaluate(
    () => (window as unknown as Host).marklyraEditor.getOutline()[1]?.id,
  );
  if (!id) throw Error('Missing target heading');
  await page.evaluate(
    (id) =>
      (window as unknown as Host).marklyraEditor.execute({
        type: 'jumpToBlock',
        id,
        preserveSelection: true,
      }),
    id,
  );
  expect(await invariant(frame)).toEqual(preserved);
  expect(await flush(page)).toBe(source);
  await expect(
    page.evaluate(() =>
      (window as unknown as Host).marklyraEditor.execute({
        type: 'jumpToBlock',
        id: 'missing-old-heading',
        preserveSelection: true,
      }),
    ),
  ).rejects.toThrow('大纲标题已变化，请重试');
  expect(await invariant(frame)).toEqual(preserved);
  expect(await flush(page)).toBe(source);
  await assertNoErrors(page);
});

test('consecutive TOC loads expose fresh original headers immediately and strip inline markers from labels', async ({
  page,
}) => {
  const first = '\uFEFF[TOC]\r\n\r\n# Old\n\nBody\r\n\r\n## Gone\n';
  const next =
    '\uFEFF[TOC]\r\n\r\n# **New** *em* `code` [link](https://example.invalid)\n\nAlpha beta\r\n\r\n### 第二节 😀\n';
  const frame = await mount(page, first);
  await frame.evaluate(() => {
    const runtime = window as unknown as Runtime;
    runtime.outlineOldHeaders = [...(runtime.editor.nodeMap.toc as unknown as TocProbe).headers];
  });
  const outline = await page.evaluate(async (source) => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.load(source);
    return editor.getOutline();
  }, next);
  expect(outline.map(({ level, text }) => ({ level, text }))).toEqual([
    { level: 1, text: 'New em code link' },
    { level: 3, text: '第二节 😀' },
  ]);
  const original = await frame.evaluate(() => {
    const runtime = window as unknown as Runtime,
      toc = runtime.editor.nodeMap.toc as unknown as TocProbe;
    return {
      matrix: runtime.editor.library.outline.getHeaderMatrix(true),
      live: toc.headers.every(
        (node) => !node.isDeleted() && Object.is(runtime.editor.getNode(node.cid), node),
      ),
      newIdentity: toc.headers.every((node) => !runtime.outlineOldHeaders?.includes(node)),
      oldDeleted: runtime.outlineOldHeaders?.every((node) => node.isDeleted()),
    };
  });
  expect(original.live).toBe(true);
  expect(original.newIdentity).toBe(true);
  expect(original.oldDeleted).toBe(true);
  expect(original.matrix).toEqual(outline.map(({ level, text, id }) => [level, text, id]));
  expect(await flush(page)).toBe(next);
  await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.load('Plain');
  });
  expect(
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.getOutline()),
  ).toEqual([]);
  expect(
    await frame.evaluate(() =>
      (window as unknown as Runtime).editor.library.outline.getHeaderMatrix(true),
    ),
  ).toEqual([]);
  await assertNoErrors(page);
});

test('synchronous outline reads retain the original pending 300ms TOC HTML callback', async ({
  page,
}) => {
  const source = '[TOC]\n\n# Timer heading\n\nAlpha beta';
  const frame = await mount(page, source);
  // Wait for actual TOC output, not a fixed delay after document load.
  await expect(frame.locator('#write .md-toc-inner')).toHaveText(['Timer heading']);
  await frame.evaluate(() => {
    const runtime = window as unknown as Runtime,
      toc = runtime.editor.nodeMap.toc as unknown as TocProbe;
    const schedule = window.setTimeout,
      clear = window.clearTimeout,
      update = toc.updateHTML,
      refresh = toc.refresh;
    const probe = {
      id: 0,
      delay: 0,
      cancelled: false,
      fired: false,
      html: 0,
      modelReads: 0,
      cleanup() {
        window.clearTimeout = clear;
        toc.updateHTML = update;
        toc.refresh = refresh;
      },
    };
    toc.updateHTML = function (...args) {
      probe.html += 1;
      return Reflect.apply(update, this, args);
    };
    toc.refresh = function (immediate, skipHTML) {
      if (immediate === true && skipHTML === true) probe.modelReads += 1;
      return Reflect.apply(refresh, this, [immediate, skipHTML]);
    };
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (typeof handler !== 'function') throw Error('Unexpected string timer');
      probe.delay = delay ?? 0;
      probe.id = schedule(() => {
        probe.fired = true;
        Reflect.apply(handler, window, args);
      }, delay);
      return probe.id;
    }) as typeof window.setTimeout;
    try {
      toc.refresh(false);
    } finally {
      window.setTimeout = schedule;
    }
    window.clearTimeout = (id) => {
      if (id === probe.id) probe.cancelled = true;
      clear(id);
    };
    runtime.outlineTimerProbe = probe;
    const heading = runtime.editor.writingArea.querySelector('h1');
    const text = heading
      ? document.createTreeWalker(heading, NodeFilter.SHOW_TEXT).nextNode()
      : null;
    if (!text) throw Error('Missing heading text');
    // The same text creates a real characterData record without editing source.
    const currentText = text.nodeValue;
    text.nodeValue = currentText;
  });
  try {
    expect(await flush(page)).toBe(source);
    expect(await flush(page)).toBe(source);
    expect(
      await frame.evaluate(() => (window as unknown as Runtime).outlineTimerProbe?.modelReads),
    ).toBeGreaterThan(0);
    expect(
      await frame.evaluate(() => {
        const runtime = window as unknown as Runtime,
          probe = runtime.outlineTimerProbe;
        return {
          delay: probe?.delay,
          cancelled: probe?.cancelled,
          pending: (runtime.editor.nodeMap.toc as unknown as TocProbe).refreshTimeout === probe?.id,
        };
      }),
    ).toEqual({ delay: 300, cancelled: false, pending: true });
    await expect
      .poll(() => frame.evaluate(() => (window as unknown as Runtime).outlineTimerProbe?.fired))
      .toBe(true);
    expect(
      await frame.evaluate(() => (window as unknown as Runtime).outlineTimerProbe?.cancelled),
    ).toBe(false);
    expect(
      await frame.evaluate(() => (window as unknown as Runtime).outlineTimerProbe?.html),
    ).toBeGreaterThan(0);
    await expect(frame.locator('#write .md-toc-inner')).toHaveText(['Timer heading']);
    expect(await flush(page)).toBe(source);
  } finally {
    await frame.evaluate(() => (window as unknown as Runtime).outlineTimerProbe?.cleanup());
  }
  await assertNoErrors(page);
});

test('original outline popover toggle, close, Escape and pin preserve editing state', async ({
  page,
}) => {
  const source = '\uFEFF# **Bold** *Italic*\r\n\r\nAlpha beta\n\n## Later\r\n\r\nTail';
  const frame = await mount(page, source);
  await rememberSelection(page, frame);
  await page.keyboard.type('X');
  const edited = source.replace('Alpha', 'X');
  await expect.poll(() => flush(page)).toBe(edited);
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }));
  expect(await flush(page)).toBe(source);
  await rememberSelection(page, frame);
  expect(
    await frame.evaluate(() => (window as unknown as Runtime).editor.undo.commandStack.length),
  ).toBeGreaterThan(0);
  const popup = frame.locator('#toc-dropmenu');
  const toggle = () =>
    page.evaluate(() => (window as unknown as Host).marklyraEditor.toggleOutlinePopover());
  expect(await toggle()).toBe(true);
  await expect(popup).toHaveAttribute('aria-hidden', 'false');
  await expect(popup.locator('.outline-label')).toHaveText(['Bold Italic', 'Later']);
  expect(await invariant(frame)).toEqual(preserved);
  expect(await toggle()).toBe(false);
  await expect(popup).toHaveAttribute('aria-hidden', 'true');
  expect(await invariant(frame)).toEqual(preserved);
  await toggle();
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.closeOutlinePopover());
  expect(await invariant(frame)).toEqual(preserved);
  await toggle();
  await page.keyboard.press('Escape');
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as Host).marklyraEditor.isOutlinePopoverOpen),
    )
    .toBe(false);
  expect(await invariant(frame)).toEqual(preserved);
  await toggle();
  // Synthetic click runs the body handler without manufacturing a new
  // browser caret. Trusted content clicks may legitimately move the selection.
  await frame.locator('#write').dispatchEvent('click');
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as Host).marklyraEditor.isOutlinePopoverOpen),
    )
    .toBe(false);
  expect(await invariant(frame)).toEqual(preserved);
  await toggle();
  await popup.locator('.outline-title-wrapper').hover();
  await popup.locator('#pin-outline-btn').click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).outlineProbeEvents.pins))
    .toBe(1);
  expect(
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.isOutlinePopoverOpen),
  ).toBe(false);
  expect(await invariant(frame)).toEqual(preserved);
  expect(await flush(page)).toBe(source);
  const changes = await page.evaluate(
    () => (window as unknown as Host).outlineProbeEvents.popovers,
  );
  expect(changes).toEqual([true, false, true, false, true, false, true, false, true, false]);
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'redo' }));
  expect(await flush(page)).toBe(edited);
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }));
  expect(await flush(page)).toBe(source);
  await assertNoErrors(page);
});

test('current heading follows the original visible-heading oracle through controlled scroll', async ({
  page,
}, testInfo) => {
  const source =
    Array.from(
      { length: 6 },
      (_, index) =>
        `# Section ${index + 1}\n\n${'Paragraph body with wrapping words. '.repeat(90)}`,
    ).join('\n\n') + '\n\nAlpha beta';
  const frame = await mount(page, source, true);
  await rememberSelection(page, frame);
  await frame.evaluate(() => {
    const runtime = window as unknown as Runtime;
    const content = document.querySelector('content');
    if (!content) throw Error('Missing scrolling content');
    const log: unknown[] = [];
    Reflect.set(window, 'outlineScrollLog', log);
    const record = (kind: string, details: Record<string, unknown> = {}) =>
      log.push({
        kind,
        at: performance.now(),
        scrollTop: content.scrollTop,
        fonts: document.fonts.status,
        actives: Array.from(document.querySelectorAll('#outline-content .outline-active'), (node) =>
          node.getAttribute('data-ref'),
        ),
        ...details,
      });
    let prototype: object | null = content;
    let scroll: PropertyDescriptor | undefined;
    while (prototype && !scroll) {
      scroll = Object.getOwnPropertyDescriptor(prototype, 'scrollTop');
      prototype = Object.getPrototypeOf(prototype);
    }
    if (!scroll?.get || !scroll.set) throw Error('Missing native scrollTop descriptor');
    const getScroll = scroll.get,
      setScroll = scroll.set;
    Object.defineProperty(content, 'scrollTop', {
      configurable: true,
      get() {
        return Reflect.apply(getScroll, this, []);
      },
      set(value: number) {
        record('script scrollTop', { value, stack: new Error().stack });
        Reflect.apply(setScroll, this, [value]);
      },
    });
    const original = runtime.editor.library.outline.highlightVisibleHeader;
    runtime.editor.library.outline.highlightVisibleHeader = function (...args: unknown[]) {
      Reflect.apply(original, this, args);
      record('original highlight');
    };
    content.addEventListener('scroll', () => record('scroll'), { passive: true });
    record('installed');
  });
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.setOutlineTracking(true));
  const seen: string[] = [];
  for (const index of [0, 2, 4, 1]) {
    const expected = await frame.evaluate((index) => {
      const runtime = window as unknown as Runtime;
      const content = document.querySelector('content'),
        headings = runtime.editor.writingArea.querySelectorAll<HTMLElement>('h1');
      if (!content || !headings[index]) throw Error('Missing controlled scroll fixture');
      content.scrollTop = Math.max(0, headings[index].offsetTop - 10);
      content.dispatchEvent(new Event('scroll'));
      runtime.editor.library.outline.highlightVisibleHeader();
      return (
        document
          .querySelector('#outline-content .outline-active[data-ref]')
          ?.getAttribute('data-ref') ?? null
      );
    }, index);
    expect(expected).not.toBeNull();
    try {
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as Host).marklyraEditor.getCurrentHeading()),
        )
        .toBe(expected);
    } catch (error) {
      await testInfo.attach('outline-scroll-diagnostics', {
        contentType: 'application/json',
        body: JSON.stringify(
          await frame.evaluate(() => ({
            log: Reflect.get(window, 'outlineScrollLog'),
            headings: Array.from(document.querySelectorAll<HTMLElement>('#write h1'), (node) => ({
              cid: node.getAttribute('cid'),
              top: node.offsetTop,
            })),
            currentScroll: document.querySelector('content')?.scrollTop,
            fonts: document.fonts.status,
          })),
          null,
          2,
        ),
      });
      throw error;
    }
    seen.push(expected ?? '');
    expect(await invariant(frame)).toEqual(preserved);
  }
  expect(new Set(seen).size).toBeGreaterThan(2);
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.setOutlineTracking(false));
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).marklyraEditor.getCurrentHeading()))
    .toBeNull();
  expect(await flush(page)).toBe(source);
  await assertNoErrors(page);
});

test('collapsed original outline reports the actual heading before the Shell maps its own collapsed ancestor', async ({
  page,
}, testInfo) => {
  const source = [
    '# Parent',
    'parent paragraph '.repeat(160),
    '### Child',
    'child paragraph '.repeat(160),
    '##### Target',
    'target paragraph '.repeat(600),
    '# Next root',
    'last paragraph '.repeat(160),
  ].join('\n\n');
  const frame = await mount(page, source, true);
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.setOutlineTracking(true));
  const oracle = await frame.evaluate(() => {
    const runtime = window as unknown as Runtime,
      original = runtime.editor.library.outline;
    const content = document.querySelector('content');
    const headings = Array.from(
      runtime.editor.writingArea.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'),
    );
    if (!content || !headings[2]) throw Error('Missing nested heading fixture');
    document.body.classList.remove('no-collapse-outline');
    original.renderOutline();
    document.querySelectorAll('#outline-content .outline-item-open').forEach((node) => {
      node.classList.remove('outline-item-open');
    });
    content.scrollTop = Math.max(0, headings[2].offsetTop - 10);
    // Explicit index proves the two active labels independently of the
    // adapter's selector and of the binary search scroll algorithm.
    Reflect.apply(original.highlightVisibleHeader, original, [headings, 2, false]);
    const actives = Array.from(
      document.querySelectorAll('#outline-content .outline-active[data-ref]'),
      (node) => node.getAttribute('data-ref'),
    );
    original.highlightVisibleHeader();
    const automatic = Array.from(
      document.querySelectorAll('#outline-content .outline-active[data-ref]'),
      (node) => node.getAttribute('data-ref'),
    );
    content.dispatchEvent(new Event('scroll'));
    return {
      actual: headings[2].getAttribute('cid'),
      ancestor: headings[0]?.getAttribute('cid'),
      actives,
      automatic,
      actualTop: headings[2].offsetTop - content.scrollTop,
      lastTop: (headings.at(-1)?.offsetTop ?? 0) - content.scrollTop,
      viewport: window.innerHeight,
    };
  });
  expect(oracle.actual).not.toBeNull();
  expect(oracle.actives).toEqual([oracle.ancestor, oracle.actual]);
  expect(oracle.actualTop).toBeGreaterThanOrEqual(0);
  expect(oracle.actualTop).toBeLessThan(oracle.viewport);
  expect(oracle.lastTop).toBeGreaterThan(oracle.viewport);
  expect(oracle.automatic).toEqual([oracle.ancestor, oracle.actual]);
  try {
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as Host).marklyraEditor.getCurrentHeading()),
      )
      .toBe(oracle.actual);
  } catch (error) {
    await testInfo.attach('collapsed-scroll-diagnostics', {
      contentType: 'application/json',
      body: JSON.stringify(
        await frame.evaluate(() => ({
          scrollTop: document.querySelector('content')?.scrollTop,
          actives: Array.from(
            document.querySelectorAll('#outline-content .outline-active'),
            (node) => node.getAttribute('data-ref'),
          ),
          fonts: document.fonts.status,
          loadTimers: Reflect.get(window, 'outlineOriginalLoadTimers'),
        })),
        null,
        2,
      ),
    });
    throw error;
  }
  const entries: OutlineEntry[] = await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.getOutline(),
  );
  const tree = outlineTree(entries);
  expect(visibleCurrentHeading(tree, new Set(), oracle.actual)).toBe(oracle.actual);
  expect(visibleCurrentHeading(tree, new Set([oracle.ancestor ?? '']), oracle.actual)).toBe(
    oracle.ancestor,
  );
  expect(await flush(page)).toBe(source);
  await assertNoErrors(page);
});
