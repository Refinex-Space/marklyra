import type { MarkLyraCommand, MarkLyraEditor } from '@marklyra/editor-runtime';
import { test as base, expect, type FrameLocator, type Page } from '@playwright/test';

type TestWindow = Window &
  typeof globalThis & {
    marklyraEditor: MarkLyraEditor;
    extraEditors?: MarkLyraEditor[];
  };
interface RuntimeRequestGate {
  hold: string;
  queue: MessageEvent[];
  seen: string[];
  release(operation?: string): void;
}
function installRuntimeRequestGate() {
  if (window === window.top) return;
  const gate: RuntimeRequestGate = {
    hold: '',
    queue: [],
    seen: [],
    release(operation) {
      if (operation === undefined || this.hold === operation) this.hold = '';
      const held = this.queue.splice(0);
      for (const event of held) {
        const request = event.data as { operation?: string };
        if (operation !== undefined && request.operation !== operation) {
          this.queue.push(event);
          continue;
        }
        window.dispatchEvent(
          new MessageEvent('message', {
            data: event.data,
            source: event.source,
            origin: event.origin,
          }),
        );
      }
    },
  };
  Object.assign(window, { __runtimeRequestGate: gate });
  // Delay selected requests before the real adapter handles them. Runtime code,
  // serializer states and typed input remain real; this is not a native timing test.
  window.addEventListener('message', (event) => {
    const request = event.data as {
      protocol?: unknown;
      kind?: unknown;
      operation?: unknown;
    } | null;
    if (
      request?.protocol !== 'marklyra/editor/v1' ||
      request.kind !== 'request' ||
      typeof request.operation !== 'string'
    )
      return;
    gate.seen.push(request.operation);
    if (request.operation === gate.hold) {
      gate.queue.push(event);
      event.stopImmediatePropagation();
    }
  });
}
const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(installRuntimeRequestGate);
      await use(errors);
      expect(errors, 'Unexpected parent/child browser errors').toEqual([]);
    },
    { auto: true },
  ],
});

test('load preserves real keyboard input during a delayed snapshot by rejecting replacement', async ({
  page,
}) => {
  await load(page, 'Alpha');
  await child(page).locator('#write > p').first().click();
  await selectBlock(page, '#write > p');
  await child(page)
    .locator('body')
    .evaluate(() => {
      (Reflect.get(window, '__runtimeRequestGate') as RuntimeRequestGate).hold = 'snapshot';
    });
  await page.evaluate(() => {
    Object.assign(window, { __loadResult: 'pending' });
    void (window as TestWindow).marklyraEditor.load('Beta', { expectedSource: 'Alpha' }).then(
      () => Reflect.set(window, '__loadResult', 'resolved'),
      (error: unknown) => Reflect.set(window, '__loadResult', String(error)),
    );
  });
  await expect
    .poll(() =>
      child(page)
        .locator('body')
        .evaluate(
          () => (Reflect.get(window, '__runtimeRequestGate') as RuntimeRequestGate).queue.length,
        ),
    )
    .toBe(1);
  expect(
    await child(page)
      .locator('body')
      .evaluate(() => document.hasFocus()),
  ).toBe(true);
  // Waiting for a snapshot preserves the active editor's focus. Real input is
  // protected by the child CAS, including when it arrives during this wait.
  await page.keyboard.type('X');
  await expect(child(page).locator('#write')).toHaveText('AlphaX');
  await child(page)
    .locator('body')
    .evaluate(() => (Reflect.get(window, '__runtimeRequestGate') as RuntimeRequestGate).release());
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__loadResult')))
    .toContain('内容已有更改');
  await expectSource(page, 'AlphaX');
  await execute(page, { type: 'undo' });
  await expectSource(page, 'Alpha');
  await execute(page, { type: 'redo' });
  await expectSource(page, 'AlphaX');
});

for (const conditional of [false, true]) {
  test(`load rejects a command arriving after its authoritative flush without restoring stale content (${conditional ? 'expected source' : 'explicit load'})`, async ({
    page,
  }) => {
    await load(page, 'Alpha');
    await execute(page, { type: 'sourcePosition', line: 1, column: 6 });
    await child(page)
      .locator('body')
      .evaluate(() => {
        const gate = Reflect.get(window, '__runtimeRequestGate') as RuntimeRequestGate;
        gate.hold = 'execute';
        gate.seen = [];
      });
    await page.evaluate(() => {
      Object.assign(window, { __executeResult: 'pending' });
      void (window as TestWindow).marklyraEditor.execute({ type: 'insertText', text: 'X' }).then(
        () => Reflect.set(window, '__executeResult', 'resolved'),
        (error: unknown) => Reflect.set(window, '__executeResult', String(error)),
      );
    });
    await expect
      .poll(() =>
        child(page)
          .locator('body')
          .evaluate(
            () => (Reflect.get(window, '__runtimeRequestGate') as RuntimeRequestGate).queue.length,
          ),
      )
      .toBe(1);
    await child(page)
      .locator('body')
      .evaluate(() => {
        (Reflect.get(window, '__runtimeRequestGate') as RuntimeRequestGate).hold = 'snapshot';
      });
    await page.evaluate((conditional) => {
      Object.assign(window, { __loadResult: 'pending' });
      void (window as TestWindow).marklyraEditor
        .load('Beta', conditional ? { expectedSource: 'Alpha' } : {})
        .then(
          () => Reflect.set(window, '__loadResult', 'resolved'),
          (error: unknown) => Reflect.set(window, '__loadResult', String(error)),
        );
    }, conditional);
    await expect
      .poll(() =>
        child(page)
          .locator('body')
          .evaluate(
            () => (Reflect.get(window, '__runtimeRequestGate') as RuntimeRequestGate).queue.length,
          ),
      )
      .toBe(2);
    await child(page)
      .locator('body')
      .evaluate(() =>
        (Reflect.get(window, '__runtimeRequestGate') as RuntimeRequestGate).release('execute'),
      );
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, '__executeResult')))
      .toBe('resolved');
    await expect(child(page).locator('#write')).toHaveText('AlphaX');
    await child(page)
      .locator('body')
      .evaluate(() =>
        (Reflect.get(window, '__runtimeRequestGate') as RuntimeRequestGate).release('snapshot'),
      );
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, '__loadResult')))
      .toContain('内容已有更改');
    await expectSource(page, 'AlphaX');
    const operations = await child(page)
      .locator('body')
      .evaluate(() => (Reflect.get(window, '__runtimeRequestGate') as RuntimeRequestGate).seen);
    expect(operations).not.toContain('restore');
  });
}

test('conditional markSaved cannot clear input arriving after the saved snapshot', async ({
  page,
}) => {
  await load(page, 'Alpha');
  await child(page).locator('#write > p').first().click();
  await selectBlock(page, '#write > p');
  await page.keyboard.type('X');
  await expectSource(page, 'AlphaX');
  await child(page)
    .locator('body')
    .evaluate(() => {
      (Reflect.get(window, '__runtimeRequestGate') as RuntimeRequestGate).hold = 'mark-saved';
    });
  await page.evaluate(() => {
    Object.assign(window, { __savedResult: 'pending' });
    void (window as TestWindow).marklyraEditor.markSaved('AlphaX').then(
      (result) => Reflect.set(window, '__savedResult', result),
      (error: unknown) => Reflect.set(window, '__savedResult', String(error)),
    );
  });
  await expect
    .poll(() =>
      child(page)
        .locator('body')
        .evaluate(
          () => (Reflect.get(window, '__runtimeRequestGate') as RuntimeRequestGate).queue.length,
        ),
    )
    .toBe(1);
  await page.keyboard.type('Y');
  await expect(child(page).locator('#write')).toHaveText('AlphaXY');
  await child(page)
    .locator('body')
    .evaluate(() => (Reflect.get(window, '__runtimeRequestGate') as RuntimeRequestGate).release());
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__savedResult'))).toBe(false);
  await expectSource(page, 'AlphaXY');
  const modified = () =>
    child(page)
      .locator('body')
      .evaluate(() =>
        window.prompt(
          '__bridge__',
          JSON.stringify({ name: 'document', method: 'isDocumentEdited', data: null }),
        ),
      );
  expect(await modified()).toBe('true');
  expect(await page.evaluate(() => (window as TestWindow).marklyraEditor.markSaved('AlphaX'))).toBe(
    false,
  );
  expect(
    await page.evaluate(() => (window as TestWindow).marklyraEditor.markSaved('AlphaXY')),
  ).toBe(true);
  expect(await modified()).toBe('false');
});
function child(page: Page): FrameLocator {
  return page.frameLocator('.marklyra-editor-frame').first();
}
async function load(page: Page, source: string): Promise<void> {
  await page.evaluate((source) => (window as TestWindow).marklyraEditor.load(source), source);
}
async function flush(page: Page): Promise<string> {
  return page.evaluate(() => (window as TestWindow).marklyraEditor.flush());
}
async function execute(page: Page, command: MarkLyraCommand): Promise<void> {
  await page.evaluate(
    (encoded) =>
      (window as TestWindow).marklyraEditor.execute(JSON.parse(encoded) as MarkLyraCommand),
    JSON.stringify(command),
  );
}
async function selectBlock(page: Page, selector: string, all = false): Promise<void> {
  await child(page)
    .locator(selector)
    .first()
    .evaluate((element, all) => {
      const doc = element.ownerDocument;
      (element as HTMLElement).focus();
      const range = doc.createRange();
      range.selectNodeContents(element);
      if (!all) range.collapse(false);
      const selection = doc.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }, all);
}
async function expectSource(page: Page, source: string): Promise<void> {
  await expect.poll(() => flush(page)).toBe(source);
  expect(await page.evaluate(() => (window as TestWindow).marklyraEditor.getMarkdown())).toBe(
    source,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/runtime.html');
  await page.waitForFunction(() => Boolean((window as Partial<TestWindow>).marklyraEditor));
  await page.evaluate(() => (window as TestWindow).marklyraEditor.ready);
  await expect(child(page).locator('#write')).toBeVisible();
});
test.afterEach(async ({ page }, testInfo) => {
  await testInfo.attach('runtime-sdk-state', {
    body: JSON.stringify(
      await page.evaluate(() => {
        const editor = (window as TestWindow).marklyraEditor;
        return {
          source: editor.getMarkdown(),
          selection: editor.getSelection(),
          outline: editor.getOutline(),
          revision: editor.revision,
          pending: editor.hasPendingChanges,
          frameCount: document.querySelectorAll('.marklyra-editor-frame').length,
        };
      }),
      null,
      2,
    ),
    contentType: 'application/json',
  });
});

test('SDK load/flush preserves BOM, mixed EOL and untouched table bytes through a keyboard edit', async ({
  page,
}) => {
  const source =
    '\uFEFF# Heading\r\n\r\nAlpha  \n\n| left  | right |\r\n|:------|------:|\r\n| a     | b     |\n';
  await load(page, source);
  await expectSource(page, source);
  await selectBlock(page, '#write > p');
  await page.keyboard.type('X');
  await expectSource(page, source.replace('Alpha  ', 'Alpha  X'));
  await execute(page, { type: 'undo' });
  await expectSource(page, source);
  await execute(page, { type: 'redo' });
  await expectSource(page, source.replace('Alpha  ', 'Alpha  X'));
});

test('two independent SDK instances isolate source, selection and destroy lifecycle', async ({
  page,
}) => {
  await load(page, 'Primary\n');
  const initial = await page.evaluate(async () => {
    const first = (window as TestWindow).marklyraEditor;
    const Constructor = first.constructor as typeof MarkLyraEditor;
    const instances: MarkLyraEditor[] = [];
    for (const text of ['Second\n', 'Third\n']) {
      const mount = document.createElement('div');
      mount.style.cssText = 'height:220px;width:100%';
      document.body.append(mount);
      const editor = new Constructor(mount, {
        runtimeUrl: 'http://127.0.0.1:4174/index.html',
        markdown: text,
      });
      instances.push(editor);
    }
    (window as TestWindow).extraEditors = instances;
    await Promise.all(instances.map((editor) => editor.ready));
    return Promise.all(instances.map((editor) => editor.flush()));
  });
  expect(initial).toEqual(['Second\n', 'Third\n']);
  const result = await page.evaluate(async () => {
    const instances = (window as TestWindow).extraEditors;
    const second = instances?.[0],
      third = instances?.[1];
    if (!second || !third) throw new Error('Missing extra SDK instances');
    await second.load('Changed second\n');
    second.destroy();
    second.destroy();
    let rejected = '';
    try {
      await second.execute({ type: 'undo' });
    } catch (error) {
      rejected = String(error);
    }
    const thirdSource = await third.flush();
    third.destroy();
    const Constructor = (window as TestWindow).marklyraEditor.constructor as typeof MarkLyraEditor;
    const temporaryMount = document.createElement('div');
    document.body.append(temporaryMount);
    const aborted = new Constructor(temporaryMount, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: 'Never ready',
    });
    const abortedReady = aborted.ready.then(
      () => 'unexpected readiness',
      (error: unknown) => String(error),
    );
    aborted.destroy();
    const earlyDestroy = await abortedReady;
    return {
      earlyDestroy,
      rejected,
      thirdSource,
      remaining: document.querySelectorAll('.marklyra-editor-frame').length,
    };
  });
  expect(result.rejected).toBe('Error: Editor has been destroyed');
  expect(result.thirdSource).toBe('Third\n');
  expect(result.earlyDestroy).toBe('Error: Editor has been destroyed');
  expect(result.remaining).toBe(1);
  await expectSource(page, 'Primary\n');
});

test('runtime uses a separate origin and neither side can read the other document', async ({
  page,
}) => {
  const parentAccess = await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>('.marklyra-editor-frame');
    if (!frame?.contentWindow) throw new Error('Missing runtime frame');
    let error = '';
    try {
      void frame.contentWindow.document.body;
    } catch (value) {
      error = value instanceof DOMException ? value.name : String(value);
    }
    return {
      error,
      parentOrigin: location.origin,
      childOrigin: new URL(frame.src).origin,
      sandbox: frame.getAttribute('sandbox'),
    };
  });
  expect(parentAccess.childOrigin).not.toBe(parentAccess.parentOrigin);
  expect(parentAccess.error).toBe('SecurityError');
  expect(parentAccess.sandbox).toBe('allow-scripts allow-same-origin');
  const childAccess = await child(page)
    .locator('body')
    .evaluate(() => {
      try {
        void parent.document.body;
        return 'readable';
      } catch (error) {
        return error instanceof DOMException ? error.name : String(error);
      }
    });
  expect(childAccess).toBe('SecurityError');
});

test('real postMessage with wrong sender or channel cannot mutate runtime source', async ({
  page,
}) => {
  await load(page, 'Protected\n');
  await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>('.marklyra-editor-frame');
    if (!frame?.contentWindow) throw new Error('Missing runtime frame');
    const channel = new URL(frame.src).searchParams.get('channel');
    // Self/sibling senders are not the authorized runtime WindowProxy.
    window.postMessage(
      {
        protocol: 'marklyra/editor/v1',
        channel,
        kind: 'changed',
        payload: { canonical: 'FORGED', sequence: 9999 },
      },
      '*',
    );
    // Correct target, incorrect per-instance channel: child must not load this payload.
    frame.contentWindow.postMessage(
      {
        protocol: 'marklyra/editor/v1',
        channel: 'wrong-channel',
        kind: 'request',
        id: 123456,
        operation: 'load',
        payload: 'FORGED',
      },
      '*',
    );
  });
  await child(page)
    .locator('body')
    .evaluate(() =>
      parent.postMessage(
        {
          protocol: 'marklyra/editor/v1',
          channel: 'wrong-channel',
          kind: 'changed',
          payload: { canonical: 'FORGED', sequence: 9999 },
        },
        '*',
      ),
    );
  await expectSource(page, 'Protected\n');
  await expect(child(page).locator('#write')).toHaveText('Protected');
});

test('table cell keyboard editing and original SDK undo/redo retain exact source', async ({
  page,
}) => {
  const source = '| Name | Count |\n|:-----|------:|\n| Alpha | 1 |\n| Beta | 2 |\n';
  await load(page, source);
  await expect(child(page).locator('#write td')).toHaveCount(4);
  await child(page).locator('#write td').first().click();
  await page.keyboard.type('X');
  await expect.poll(async () => (await flush(page)) !== source).toBe(true);
  const changed = await flush(page);
  expect(changed).toContain('X');
  await execute(page, { type: 'undo' });
  await expectSource(page, source);
  await execute(page, { type: 'redo' });
  await expectSource(page, changed);
});

test('task checkbox and CodeMirror keyboard edits use runtime transactions', async ({ page }) => {
  const task = '- [ ] Open\n- [x] Done\n';
  await load(page, task);
  await child(page).locator('#write input[type=checkbox]').first().click();
  await expectSource(page, '- [x] Open\n- [x] Done\n');
  await execute(page, { type: 'undo' });
  await expectSource(page, task);
  const code = '```javascript\nconst value = 1;\n```\n';
  await load(page, code);
  await expect(child(page).locator('#write .CodeMirror')).toHaveCount(1);
  await child(page).locator('#write .CodeMirror-line').first().click();
  await page.keyboard.type('X');
  await expect.poll(async () => (await flush(page)) !== code).toBe(true);
  const changed = await flush(page);
  await execute(page, { type: 'undo' });
  await expectSource(page, code);
  await execute(page, { type: 'redo' });
  await expectSource(page, changed);
});

test('MathJax and Mermaid produce actual SVG and SDK outline reflects headings', async ({
  page,
}) => {
  const source =
    '# One\n\n## Two\n\nInline $x^2$ equation.\n\n$$\n\\frac{1}{2}\n$$\n\n```mermaid\ngraph TD; A[Start] --> B[Finish];\n```\n';
  await load(page, source);
  await expect(child(page).locator('#write mjx-container')).toHaveCount(2);
  await expect(child(page).locator('#write .md-diagram-panel svg')).toHaveCount(1);
  await expect(child(page).locator('#write .md-diagram-panel')).toContainText('Start');
  await expectSource(page, source);
  const outline = await page.evaluate(() => (window as TestWindow).marklyraEditor.getOutline());
  expect(outline.map(({ level, text }) => ({ level, text }))).toEqual([
    { level: 1, text: 'One' },
    { level: 2, text: 'Two' },
  ]);
  const second = outline[1];
  if (!second) throw new Error('Missing second heading');
  await execute(page, { type: 'jumpToBlock', id: second.id });
  await flush(page);
  expect(
    await page.evaluate(() => (window as TestWindow).marklyraEditor.getSelection().bookmark),
  ).toMatchObject({ id: second.id });
});

test('inline marker entry/exit and public cursor bookmark restore preserve source', async ({
  page,
}) => {
  const source = 'A **bold** word.\n\nTail\n';
  await load(page, source);
  await child(page).locator('#write > p').last().click();
  const markers = child(page).locator('#write [md-inline=strong] .md-meta');
  await expect(markers.first()).toBeHidden();
  await child(page).locator('#write strong').click();
  await expect(markers.first()).toBeVisible();
  await flush(page);
  const selection = await page.evaluate(() => (window as TestWindow).marklyraEditor.getSelection());
  expect(selection.bookmark).not.toBeNull();
  await child(page).locator('#write > p').last().click();
  await expect(markers.first()).toBeHidden();
  if (!selection.bookmark) throw new Error('Missing captured bookmark');
  await execute(page, { type: 'restoreSelection', bookmark: selection.bookmark });
  await flush(page);
  expect(
    await page.evaluate(() => (window as TestWindow).marklyraEditor.getSelection().bookmark),
  ).toEqual(selection.bookmark);
  await expectSource(page, source);
});

test('rejected serializer normalization rolls back raw source, original view and undo history', async ({
  page,
}) => {
  const source = '# Stable\n\nAlpha\n';
  await load(page, source);
  await selectBlock(page, '#write > p');
  await page.keyboard.type('X');
  await expectSource(page, '# Stable\n\nAlphaX\n');
  const failure = await page.evaluate(async () => {
    try {
      await (window as TestWindow).marklyraEditor.load('Unsupported \uE027 marker\n');
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(failure).toMatch(/^Unverified serializer normalization .* exact source retained$/);
  await expectSource(page, '# Stable\n\nAlphaX\n');
  await expect(child(page).locator('#write')).toContainText('AlphaX');
  await expect(child(page).locator('#write')).not.toContainText('Unsupported');
  await execute(page, { type: 'undo' });
  await expectSource(page, source);
  await execute(page, { type: 'redo' });
  await expectSource(page, '# Stable\n\nAlphaX\n');
});

test('synthetic copy supplies event data synchronously; not a system clipboard test', async ({
  page,
}) => {
  await load(page, 'Alpha\n');
  await selectBlock(page, '#write > p', true);
  const copied = await child(page)
    .locator('#write')
    .evaluate((element) => {
      const data = new DataTransfer();
      const event = new ClipboardEvent('copy', {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      });
      element.dispatchEvent(event);
      return { text: data.getData('text/plain'), prevented: event.defaultPrevented };
    });
  expect(copied).toEqual({ text: 'Alpha', prevented: true });
  await expectSource(page, 'Alpha\n');
});

test('synthetic paste passes plain text through the runtime clipboard adapter', async ({
  page,
}) => {
  await load(page, 'Alpha\n');
  await selectBlock(page, '#write > p', true);
  await child(page)
    .locator('#write')
    .evaluate((element) => {
      const data = new DataTransfer();
      data.setData('text/plain', 'Pasted 中文');
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    });
  await expectSource(page, 'Pasted 中文\n');
  await execute(page, { type: 'undo' });
  await expectSource(page, 'Alpha\n');
});

test('browser regression: non-configurable native-style webkit container retains unrelated handlers', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (window === window.top) return;
    const calls: unknown[] = [];
    const nativeKeep = {
      postMessage(value: unknown) {
        calls.push(value);
      },
    };
    const container = { messageHandlers: { nativeKeep } };
    Object.defineProperty(window, 'webkit', {
      value: container,
      configurable: false,
      writable: false,
    });
    Object.assign(window, { __nativeWebkitFixture: { container, nativeKeep, calls } });
  });
  // Reopen the same public example; no SDK or private runtime test API is introduced.
  await page.reload();
  await page.waitForFunction(() => Boolean((window as Partial<TestWindow>).marklyraEditor));
  await page.evaluate(() => (window as TestWindow).marklyraEditor.ready);
  const descriptor = await child(page)
    .locator('body')
    .evaluate(() => {
      const fixture = Reflect.get(window, '__nativeWebkitFixture') as {
        container: { messageHandlers: Record<string, { postMessage(value: unknown): void }> };
        nativeKeep: { postMessage(value: unknown): void };
        calls: unknown[];
      };
      const current = Reflect.get(window, 'webkit') as typeof fixture.container;
      current.messageHandlers.nativeKeep?.postMessage('retained');
      return {
        sameContainer: current === fixture.container,
        sameOtherHandler: current.messageHandlers.nativeKeep === fixture.nativeKeep,
        configurable: Object.getOwnPropertyDescriptor(window, 'webkit')?.configurable,
        bridgeCallable:
          typeof (
            Reflect.get(window, '__MARKLYRA_BRIDGE__') as { postMessage?: unknown } | undefined
          )?.postMessage === 'function',
        handlerNames: Object.keys(current.messageHandlers).sort(),
        calls: fixture.calls,
      };
    });
  expect(descriptor).toEqual({
    sameContainer: true,
    sameOtherHandler: true,
    configurable: false,
    bridgeCallable: true,
    handlerNames: ['nativeKeep'],
    calls: ['retained'],
  });
  await load(page, 'Native container fixture\n');
  await page.locator('.marklyra-editor-frame').focus();
  await selectBlock(page, '#write > p');
  await page.keyboard.type('X');
  await expectSource(page, 'Native container fixtureX\n');
  await execute(page, { type: 'undo' });
  await expectSource(page, 'Native container fixture\n');
});
