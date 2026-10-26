import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import {
  installNativeCommandFenceMock,
  type NativeCommandFenceWindow,
} from './native-command-fence.helpers.js';
import { waitForNativeUndo } from './native-menu.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

type Mode = 'wysiwyg' | 'source';
async function source(page: Page, mode: Mode) {
  const frame = page.frameLocator('.marklyra-editor-frame');
  return mode === 'source'
    ? frame
        .locator('#marklyra-source .CodeMirror')
        .evaluate((element) =>
          (Reflect.get(element, 'CodeMirror') as { getValue(): string }).getValue(),
        )
    : frame.locator('#write').textContent();
}
async function start(page: Page, mode: Mode) {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(
    installNativeCommandFenceMock,
    process.env.NATIVE_FENCE_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html',
  );
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.some(
          (call) => call.command === 'editor_window_ready',
        ),
      ),
    )
    .toBe(true);
  const frame = page.frameLocator('.marklyra-editor-frame');
  await expect(frame.locator('#write')).toHaveText('Alpha');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  if (mode === 'source') {
    await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('view:source'));
    await frame.locator('#marklyra-source .CodeMirror textarea').focus();
    await frame.locator('#marklyra-source .CodeMirror').evaluate((element) => {
      const cm = Reflect.get(element, 'CodeMirror') as {
        getValue(): string;
        posFromIndex(offset: number): unknown;
        setCursor(position: unknown): void;
      };
      cm.setCursor(cm.posFromIndex(cm.getValue().length));
    });
  } else {
    await frame.locator('#write > p').evaluate((element) => {
      (element as HTMLElement).focus();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let end = walker.nextNode();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) end = node;
      if (!end) throw new Error('Missing actual Text endpoint');
      getSelection()?.setBaseAndExtent(
        end,
        end.textContent?.length ?? 0,
        end,
        end.textContent?.length ?? 0,
      );
    });
  }
  await page.keyboard.type('X');
  await expect.poll(() => source(page, mode)).toBe('AlphaX');
}

for (const mode of ['wysiwyg', 'source'] as const)
  test(`${mode}: a Save from the real iframe waits for an already-issued but undelivered native Undo`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await start(page, mode);
    const issued = await page.evaluate(() =>
      (window as NativeCommandFenceWindow).__nativeCommandFence.issue('undo'),
    );
    expect(issued).toBe(1);
    // This is the editor's host-action route, not another native-menu
    // event in the same callback queue. The menu Undo remains undelivered.
    await page.keyboard.press('Meta+s');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const mock = (window as NativeCommandFenceWindow).__nativeCommandFence;
          return mock.writes.length > 0 || mock.reads.some((read) => read.issued === 1);
        }),
      )
      .toBe(true);
    const beforeRelease = await page.evaluate(() => {
      const mock = (window as NativeCommandFenceWindow).__nativeCommandFence;
      return {
        context: mock.context,
        issued: mock.issued,
        reads: mock.reads,
        writes: [...mock.writes],
        earlyWrites: [...mock.earlyWrites],
      };
    });
    // Always release the exact held event, including in the old-code negative
    // control. A pre-release assertion would otherwise skip the actual Undo.
    await page.evaluate(
      (sequence) => (window as NativeCommandFenceWindow).__nativeCommandFence.deliver(sequence),
      issued,
    );
    await expect.poll(() => source(page, mode)).toBe('Alpha');
    await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
    const result = await page.evaluate(() => {
      const mock = (window as NativeCommandFenceWindow).__nativeCommandFence;
      return {
        commands: mock.commands,
        calls: mock.calls,
        writes: mock.writes,
        earlyWrites: mock.earlyWrites,
      };
    });
    await info.attach('native-command-order', {
      body: JSON.stringify({ beforeRelease, result }, null, 2),
      contentType: 'application/json',
    });
    expect(beforeRelease.earlyWrites).toEqual([]);
    expect(result.earlyWrites).toEqual([]);
    expect(result.writes).toEqual(['Alpha']);
    expect(errors).toEqual([]);
  });

test('a native Undo delivered before SDK readiness does not poison the same context or later Save', async ({
  page,
}, info) => {
  const runtime = new URL(
    process.env.NATIVE_FENCE_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html',
  );
  let releaseRuntime: () => void = () => {};
  let heldRequests = 0;
  const runtimeGate = new Promise<void>((resolve) => {
    releaseRuntime = resolve;
  });
  await page.route(
    (url) => url.origin === runtime.origin && url.pathname === runtime.pathname,
    async (route) => {
      heldRequests++;
      await runtimeGate;
      await route.continue();
    },
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installNativeCommandFenceMock, runtime.href);
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => heldRequests).toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(() => (window as NativeCommandFenceWindow).__nativeCommandFence.context),
      )
      .not.toBeNull();
    await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'true');
    const frame = page.frameLocator('.marklyra-editor-frame');
    // Native listener readiness intentionally precedes SDK readiness. The held
    // HTML response and absent child writing DOM establish the loading phase.
    // Query through the parent: entering this uncommitted frame would itself
    // await its pending navigation and deadlock the deliberately held response.
    const loadingFrame = await page.locator('.marklyra-editor-frame').evaluate((element) => {
      const iframe = element as HTMLIFrameElement;
      return {
        src: iframe.src,
        childURL: iframe.contentDocument?.URL ?? null,
        hasWrite: Boolean(iframe.contentDocument?.getElementById('write')),
      };
    });
    expect(new URL(loadingFrame.src).origin).toBe(runtime.origin);
    expect(new URL(loadingFrame.src).pathname).toBe(runtime.pathname);
    expect(loadingFrame.hasWrite).toBe(false);
    await info.attach('sdk-loading-precondition', {
      body: JSON.stringify({
        heldRequests,
        runtime: runtime.href,
        loadingFrame,
        native: await page.evaluate(() => {
          const mock = (window as NativeCommandFenceWindow).__nativeCommandFence;
          return { context: mock.context, issued: mock.issued, registrations: mock.registrations };
        }),
      }),
      contentType: 'application/json',
    });
    const initial = await page.evaluate(() => {
      const mock = (window as NativeCommandFenceWindow).__nativeCommandFence;
      const sequence = mock.issue('undo');
      mock.deliver(sequence);
      return { context: mock.context, sequence };
    });
    expect(initial.sequence).toBe(1);
    releaseRuntime();
    await expect(frame.locator('#write')).toHaveText('Alpha');
    await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as TestWindow).__desktopMock.calls.some(
            (call) => call.command === 'editor_window_ready',
          ),
        ),
      )
      .toBe(true);
    await expect(page.getByText(/无法完成上一条编辑操作/)).toHaveCount(0);
    await frame.locator('#write > p').evaluate((element) => {
      (element as HTMLElement).focus();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let end = walker.nextNode();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) end = node;
      if (!end) throw new Error('Missing actual Text endpoint');
      getSelection()?.setBaseAndExtent(
        end,
        end.textContent?.length ?? 0,
        end,
        end.textContent?.length ?? 0,
      );
    });
    await page.keyboard.type('X');
    await expect(frame.locator('#write')).toHaveText('AlphaX');
    await waitForNativeUndo(page);
    const later = await page.evaluate(() => {
      const mock = (window as NativeCommandFenceWindow).__nativeCommandFence;
      const sequence = mock.issue('undo');
      mock.deliver(sequence);
      return { context: mock.context, sequence };
    });
    expect(later).toEqual({ context: initial.context, sequence: 2 });
    await expect(frame.locator('#write')).toHaveText('Alpha');
    await page.keyboard.press('Meta+s');
    await expect
      .poll(() =>
        page.evaluate(() => (window as NativeCommandFenceWindow).__nativeCommandFence.writes),
      )
      .toEqual(['Alpha']);
    await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
    const result = await page.evaluate(() => {
      const mock = (window as NativeCommandFenceWindow).__nativeCommandFence;
      return {
        context: mock.context,
        issued: mock.issued,
        commands: mock.commands,
        reads: mock.reads,
        earlyWrites: mock.earlyWrites,
        writes: mock.writes,
      };
    });
    await info.attach('startup-native-command-order', {
      body: JSON.stringify({ initial, later, result }, null, 2),
      contentType: 'application/json',
    });
    expect(result.context).toBe(initial.context);
    expect(result.issued).toBe(2);
    expect(result.commands.map((command) => command.sequence)).toEqual([1, 2]);
    expect(result.commands.every((command) => command.delivered)).toBe(true);
    expect(result.reads).toContainEqual({ context: initial.context, issued: 1 });
    expect(result.reads).toContainEqual({ context: initial.context, issued: 2 });
    expect(result.earlyWrites).toEqual([]);
    await expect(page.getByText(/无法完成上一条编辑操作/)).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    releaseRuntime();
  }
});

test('a native editing action during composition does not poison later Undo or Save', async ({
  page,
}) => {
  await start(page, 'wysiwyg');
  await page.evaluate(() => {
    const signals: boolean[] = [];
    Reflect.set(window, '__nativeCompositionSignals', signals);
    window.addEventListener('message', (event: MessageEvent<unknown>) => {
      const frame = document.querySelector<HTMLIFrameElement>('.marklyra-editor-frame');
      const data = event.data as { kind?: unknown; payload?: unknown } | null;
      if (
        event.source === frame?.contentWindow &&
        data?.kind === 'composition' &&
        typeof data.payload === 'boolean'
      )
        signals.push(data.payload);
    });
  });
  const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
  await write.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ni' })),
  );
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__nativeCompositionSignals')))
    .toEqual([true]);
  await page.evaluate(async () => {
    const mock = (window as NativeCommandFenceWindow).__nativeCommandFence;
    mock.deliver(mock.issue('undo'));
    // Keep the actual SDK composition gate active through browser rendering,
    // rather than ending it in the same task as command dispatch.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  await expect(write).toHaveText('AlphaX');
  await expect(page.getByText(/无法完成上一条编辑操作/)).toHaveCount(0);
  await write.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
  );
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__nativeCompositionSignals')))
    .toEqual([true, false]);
  await page.evaluate(() => {
    const mock = (window as NativeCommandFenceWindow).__nativeCommandFence;
    mock.deliver(mock.issue('undo'));
  });
  await expect(write).toHaveText('Alpha');
  await page.keyboard.press('Meta+s');
  await expect
    .poll(() =>
      page.evaluate(() => (window as NativeCommandFenceWindow).__nativeCommandFence.writes),
    )
    .toEqual(['Alpha']);
});
