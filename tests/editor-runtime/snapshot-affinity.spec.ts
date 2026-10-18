import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Frame, type Page, test } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type Host = Window &
  typeof globalThis & {
    marklyraEditor: MarkLyraEditor;
    affinityErrors: string[];
    affinityCheckpoint?: number;
  };
type Child = Window &
  typeof globalThis & {
    editor: LegacyEditor & { brush: { willExpandSoon?: number | null } };
    affinityTasks: {
      click: number;
      expand: number;
      reset: number;
      snapshot: number;
      scheduledClick: number;
      scheduledReset: number;
      scheduledSnapshot: number;
      watchClick: boolean;
      watchLoad: boolean;
      events: { kind: string; phase: string; at: number }[];
    };
  };
const raw = '**same**\r\n**same**\n**same**';
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page }, testInfo) => {
  const frame = page.frames().find((frame) => frame.url().startsWith('http://127.0.0.1:4174/'));
  if (frame)
    await testInfo.attach('affinity-native-tasks', {
      body: JSON.stringify(await frame.evaluate(() => (window as Child).affinityTasks)),
      contentType: 'application/json',
    });
  expect(pageErrors.get(page)).toEqual([]);
});
const flush = (page: Page) => page.evaluate(() => (window as Host).marklyraEditor.flush());
const command = (page: Page, type: 'undo' | 'redo') =>
  page.evaluate((type) => (window as Host).marklyraEditor.execute({ type }), type);

async function mount(page: Page, source = raw) {
  // Install before the runtime's scripts: ready can precede native 80/200ms
  // refresh callbacks, so an observer installed after ready misses initial work.
  await page.addInitScript(() => {
    const runtime = window as Child;
    runtime.affinityTasks = {
      click: 0,
      expand: 0,
      reset: 0,
      snapshot: 0,
      scheduledClick: 0,
      scheduledReset: 0,
      scheduledSnapshot: 0,
      watchClick: false,
      watchLoad: true,
      events: [],
    };
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...parameters: unknown[]) => {
      const tasks = runtime.affinityTasks;
      const kind =
        typeof handler === 'function'
          ? tasks.watchClick && delay === 180
            ? 'click'
            : tasks.watchClick && delay === 10 && handler.toString().includes('.expand(')
              ? 'expand'
              : tasks.watchLoad &&
                  (delay === 80 || delay === 200) &&
                  handler.toString().includes('.refresh(')
                ? delay === 80
                  ? 'reset'
                  : 'snapshot'
                : undefined
          : undefined;
      if (!kind || typeof handler !== 'function') return schedule(handler, delay, ...parameters);
      if (kind === 'click') tasks.scheduledClick++;
      if (kind === 'reset') tasks.scheduledReset++;
      if (kind === 'snapshot') tasks.scheduledSnapshot++;
      tasks.events.push({ kind, phase: 'scheduled', at: performance.now() });
      // Observe the actual shipped callbacks completing, not an arbitrary sleep.
      return schedule(() => {
        try {
          Reflect.apply(handler, window, parameters);
        } finally {
          tasks[kind]++;
          tasks.events.push({ kind, phase: 'completed', at: performance.now() });
        }
      }, delay);
    }) as typeof window.setTimeout;
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as Host,
      old = host.marklyraEditor;
    await old.ready;
    const Constructor = old.constructor as typeof MarkLyraEditor;
    old.destroy();
    host.affinityErrors = [];
    const root = document.querySelector<HTMLElement>('#editor');
    if (!root) throw Error('Missing editor host');
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      onError: (error) => host.affinityErrors.push(error.message),
    });
    window.addEventListener('message', (event) => {
      if (event.source !== host.marklyraEditor.element.contentWindow) return;
      const value = event.data as {
        kind?: string;
        payload?: { tracking?: { checkpoint?: number } };
      };
      if (value.kind === 'response' && typeof value.payload?.tracking?.checkpoint === 'number')
        host.affinityCheckpoint = value.payload.tracking.checkpoint;
    });
    await host.marklyraEditor.ready;
  }, source);
  const frame = page.frames().find((frame) => frame.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing runtime');
  await frame.evaluate(() => {
    (window as Child).affinityTasks.events.push({
      kind: 'initial',
      phase: 'ready',
      at: performance.now(),
    });
  });
  await frame.waitForFunction(() => {
    const tasks = (window as Child).affinityTasks;
    return (
      tasks.scheduledReset > 0 &&
      tasks.reset === tasks.scheduledReset &&
      tasks.snapshot === tasks.scheduledSnapshot
    );
  });
  await frame.evaluate(() => {
    const tasks = (window as Child).affinityTasks;
    tasks.events.push({ kind: 'initial', phase: 'settled', at: performance.now() });
    tasks.watchLoad = false;
    tasks.reset = tasks.snapshot = tasks.scheduledReset = tasks.scheduledSnapshot = 0;
  });
  return frame;
}
async function settledClick(page: Page, frame: Frame, selector: string) {
  await page.locator('.marklyra-editor-frame').focus();
  const before = await frame.evaluate(() => {
    const tasks = (window as Child).affinityTasks;
    tasks.watchClick = true;
    return tasks.click;
  });
  const paragraph = frame.locator(selector).first();
  const strong = paragraph.locator('strong').first();
  // A paragraph's centre can hit another soft line. Click the actual format
  // under test before choosing its marker/body boundary.
  await ((await strong.count()) ? strong : paragraph).click();
  await frame.waitForFunction((before) => {
    const tasks = (window as Child).affinityTasks;
    // The 180ms click callback calls refocus, which queues a further 10ms
    // brush.expand. Its native pending flag clears when that work executes.
    return (
      tasks.click > before &&
      tasks.click === tasks.scheduledClick &&
      !(window as Child).editor.brush.willExpandSoon
    );
  }, before);
  await frame.evaluate(() => {
    (window as Child).affinityTasks.watchClick = false;
  });
}
async function setPoint(frame: Frame, body: boolean, reverse = false) {
  await frame
    .locator('#write > p')
    .first()
    .evaluate(
      (paragraph, { body, reverse }) => {
        const point = (offset: number): [Node, number] => {
          const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
          const candidates: [Node, number][] = [];
          let cursor = 0;
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const size = node.textContent?.length ?? 0;
            if (cursor <= offset && offset <= cursor + size)
              candidates.push([node, offset - cursor]);
            cursor += size;
          }
          const chosen = body
            ? candidates.find(([node]) => node.parentElement?.closest('strong'))
            : candidates[0];
          if (!chosen) throw Error('Missing requested boundary');
          return chosen;
        };
        document.getSelection()?.setBaseAndExtent(...point(reverse ? 6 : 2), ...point(2));
      },
      { body, reverse },
    );
}
async function selection(frame: Frame) {
  return frame
    .locator('#write > p')
    .first()
    .evaluate((paragraph) => {
      const selection = document.getSelection();
      if (!selection?.anchorNode || !selection.focusNode) throw Error('Missing selection');
      const point = (node: Node, offset: number) => {
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        range.setEnd(node, offset);
        const roles: string[] = [];
        for (
          let element = node.nodeType === 1 ? (node as Element) : node.parentElement;
          element && element !== paragraph;
          element = element.parentElement
        )
          roles.unshift(
            `${element.tagName}:${element.getAttribute('md-inline') ?? ''}:${[...element.classList]
              .filter((value) => value !== 'md-expand')
              .sort()
              .join('.')}`,
          );
        return {
          sourceOffset: range.cloneContents().textContent?.length ?? 0,
          role: roles.join('/'),
        };
      };
      return {
        anchor: point(selection.anchorNode, selection.anchorOffset),
        head: point(selection.focusNode, selection.focusOffset),
      };
    });
}
async function rejectedAndRefreshed(page: Page, frame: Frame) {
  await frame.evaluate(() => {
    (window as Child).affinityTasks.watchLoad = true;
  });
  await expect(
    page.evaluate(() => (window as Host).marklyraEditor.load('Unsupported \uE027 marker\n')),
  ).rejects.toThrow();
  const errors = await page.evaluate(() => (window as Host).affinityErrors.splice(0));
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.every((message) => message.includes('normaliz'))).toBe(true);
  await frame.waitForFunction(() => {
    const tasks = (window as Child).affinityTasks;
    return (
      tasks.scheduledReset > 0 &&
      tasks.scheduledSnapshot > 0 &&
      tasks.reset === tasks.scheduledReset &&
      tasks.snapshot === tasks.scheduledSnapshot
    );
  });
}
const state = (page: Page, frame: Frame) =>
  Promise.all([
    page.evaluate(() => ({
      revision: (window as Host).marklyraEditor.revision,
      checkpoint: (window as Host).affinityCheckpoint,
    })),
    frame.evaluate(() => ({
      index: (window as Child).editor.undo.index,
      history: JSON.stringify((window as Child).editor.undo.commandStack),
    })),
  ]);

for (const variant of ['body', 'marker', 'reverse-body'] as const)
  test(`snapshot ${variant} retains input affinity after native reset and snapshot refresh tasks`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const frame = await mount(page);
    await settledClick(page, frame, '#write > p');
    await setPoint(frame, variant !== 'marker', variant === 'reverse-body');
    const before = await selection(frame);
    expect(before.anchor.role).toContain(variant === 'marker' ? 'md-before' : 'STRONG');
    expect(await flush(page)).toBe(raw);
    const originalState = await state(page, frame);
    await rejectedAndRefreshed(page, frame);
    expect(await flush(page)).toBe(raw);
    expect(await selection(frame)).toEqual(before);
    expect(await state(page, frame)).toEqual(originalState);
    await page.keyboard.insertText('X');
    const edited =
      variant === 'reverse-body'
        ? '**X**\r\n**same**\n**same**'
        : '**Xsame**\r\n**same**\n**same**';
    expect(await flush(page)).toBe(edited);
    await command(page, 'undo');
    expect(await flush(page)).toBe(raw);
    expect(await selection(frame)).toEqual(before);
    await command(page, 'redo');
    expect(await flush(page)).toBe(edited);
    await page.keyboard.insertText('Y');
    expect(await flush(page)).toBe(edited.replace('**X', '**XY'));
    expect(await page.evaluate(() => (window as Host).affinityErrors)).toEqual([]);
    expect(errors).toEqual([]);
  });

test('snapshot finalization preserves prior dirty source and original Undo checkpoint', async ({
  page,
}) => {
  const source = raw + '\n\nTail',
    frame = await mount(page, source);
  await settledClick(page, frame, '#write > p:last-child');
  await frame.locator('#write > p:last-child').evaluate((paragraph) => {
    const node = paragraph.firstChild?.firstChild ?? paragraph.firstChild;
    if (!node) throw Error('Missing tail');
    document
      .getSelection()
      ?.setBaseAndExtent(node, node.textContent?.length ?? 0, node, node.textContent?.length ?? 0);
  });
  await page.keyboard.insertText('!');
  const dirty = await flush(page);
  expect(dirty).toBe(source + '!');
  await settledClick(page, frame, '#write > p:first-child');
  await setPoint(frame, true);
  const before = await state(page, frame);
  await rejectedAndRefreshed(page, frame);
  expect(await flush(page)).toBe(dirty);
  expect(dirty).not.toBe(source);
  expect(await state(page, frame)).toEqual(before);
  await command(page, 'undo');
  expect(await flush(page)).toBe(source);
  await command(page, 'redo');
  expect(await flush(page)).toBe(dirty);
  expect(await page.evaluate(() => (window as Host).affinityErrors)).toEqual([]);
});

test('passive snapshot restoration never takes the host input focus during native refresh', async ({
  page,
}) => {
  const frame = await mount(page);
  await settledClick(page, frame, '#write > p');
  await setPoint(frame, true);
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'affinity-sentinel';
    document.body.prepend(input);
    input.focus();
  });
  await rejectedAndRefreshed(page, frame);
  await expect(page.locator('#affinity-sentinel')).toBeFocused();
  expect(await flush(page)).toBe(raw);
  await page.keyboard.insertText('still here');
  await expect(page.locator('#affinity-sentinel')).toHaveValue('still here');
  expect(await flush(page)).toBe(raw);
  expect(await page.evaluate(() => (window as Host).affinityErrors)).toEqual([]);
});
