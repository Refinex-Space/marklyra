import type {
  MarkLyraEditor,
  MarkLyraExtensionCommandContext,
  MarkLyraExtensionContext,
  MarkLyraExtensionError,
  MarkLyraExtensionRegistration,
} from '@marklyra/editor-runtime';
import { test as base, expect, type Page } from '@playwright/test';
import type { LegacyGlobals } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

interface ExtensionFixture {
  editor: MarkLyraEditor;
  errors: string[];
  extensionErrors: { id: string; phase: MarkLyraExtensionError['phase']; message: string }[];
  changes: string[];
  cleanupCount: number;
  imports: { signal: AbortSignal; context: string | null; name: string; bytes: number }[];
  registrations: MarkLyraExtensionRegistration[];
  context?: MarkLyraExtensionContext;
  commandContext?: MarkLyraExtensionCommandContext;
  release?: () => void;
  releaseImport?: () => void;
  entered?: boolean;
  deferImport: boolean;
  job?: string;
  png: string;
}
interface ExtensionRequestGate {
  enabled: boolean;
  queue: MessageEvent[];
  release(): void;
}
type FixtureWindow = Window &
  typeof globalThis & {
    marklyraEditor: MarkLyraEditor;
    extensionFixture: ExtensionFixture;
  };

const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        if (window === window.top) return;
        const gate: ExtensionRequestGate = {
          enabled: false,
          queue: [],
          release() {
            this.enabled = false;
            for (const event of this.queue.splice(0)) {
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
        Object.assign(window, { __extensionRequestGate: gate });
        // Installed before frame-host, matching the existing SDK delay harness.
        window.addEventListener('message', (event) => {
          if (
            gate.enabled &&
            event.data?.protocol === 'marklyra/editor/v1' &&
            event.data.kind === 'request' &&
            event.data.operation === 'execute'
          ) {
            gate.queue.push(event);
            event.stopImmediatePropagation();
          }
        });
      });
      await use(errors);
      expect(errors, 'Unhandled browser errors (not native host testing)').toEqual([]);
    },
    { auto: true },
  ],
});

const child = (page: Page) => page.frameLocator('.marklyra-editor-frame').first();
async function load(page: Page, source: string) {
  await page.evaluate(
    (source) => (window as FixtureWindow).extensionFixture.editor.load(source),
    source,
  );
}
async function flush(page: Page) {
  return page.evaluate(() => (window as FixtureWindow).extensionFixture.editor.flush());
}
async function select(page: Page, all = false) {
  await page.evaluate(() => (window as FixtureWindow).marklyraEditor.focus());
  await child(page)
    .locator('#write > p')
    .first()
    .evaluate((node, all) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode();
      if (!text) throw new Error('Missing fixture Text endpoint');
      const range = document.createRange();
      range.selectNodeContents(node);
      if (!all) {
        range.setStart(text, Math.min(5, text.textContent?.length ?? 0));
        range.collapse(true);
      }
      (node as HTMLElement).focus();
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }, all);
}
async function snapshot(page: Page) {
  const source = await flush(page);
  const state = await child(page)
    .locator('#write')
    .evaluate((area) => {
      const editor = (window as unknown as LegacyGlobals).editor;
      if (!editor) throw new Error('Missing actual runtime editor');
      const selection = getSelection();
      return {
        html: area.innerHTML,
        cursor: editor.selection.buildUndo(),
        selection: selection
          ? {
              anchor: selection.anchorOffset,
              focus: selection.focusOffset,
              text: selection.toString(),
            }
          : null,
        history: {
          index: editor.undo.index,
          stack: JSON.stringify(editor.undo.commandStack),
          undo: editor.undo.hasUndo(),
          redo: editor.undo.hasRedo(),
        },
      };
    });
  return { source, ...state };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/runtime.html');
  await page.waitForFunction(() => Boolean((window as Partial<FixtureWindow>).marklyraEditor));
  await page.evaluate(() => (window as FixtureWindow).marklyraEditor.ready);
  await page.evaluate(async () => {
    const current = (window as FixtureWindow).marklyraEditor;
    const Constructor = current.constructor as typeof MarkLyraEditor;
    current.destroy();
    const container = document.querySelector<HTMLElement>('#editor');
    if (!container) throw new Error('Missing fixture mount');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    canvas.getContext('2d')?.fillRect(0, 0, 1, 1);
    const png = canvas.toDataURL('image/png');
    const f: ExtensionFixture = {
      editor: current,
      errors: [],
      extensionErrors: [],
      changes: [],
      cleanupCount: 0,
      imports: [],
      registrations: [],
      png,
      deferImport: false,
    };
    f.editor = new Constructor(container, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: 'Alpha\n',
      documentContext: 'document',
      onError: (error) => f.errors.push(error.message),
      onExtensionError: ({ extensionId, phase, error }) =>
        f.extensionErrors.push({ id: extensionId, phase, message: error.message }),
      host: {
        images: {
          resolve: async ({ reference }) =>
            reference === 'assets/image.png' ? { url: png } : null,
          import: async (request) => {
            f.imports.push({
              signal: request.signal,
              context: request.documentContext,
              name: request.name,
              bytes: request.bytes.byteLength,
            });
            if (f.deferImport)
              await new Promise<void>((resolve) => {
                f.releaseImport = resolve;
              });
            return { source: 'assets/image.png', url: png };
          },
        },
      },
    });
    Object.assign(window, { extensionFixture: f, marklyraEditor: f.editor });
    await f.editor.ready;
  });
  await expect(child(page).locator('#write')).toBeVisible();
  await page.evaluate(() => (window as FixtureWindow).extensionFixture.editor.focus());
  await expect(child(page).locator('#write > p').first()).toHaveClass(/\bmd-focus\b/);
});

test.afterEach(async ({ page }, info) => {
  const f = await page.evaluate(() => {
    const f = (window as FixtureWindow).extensionFixture;
    if (!f)
      return {
        source: (window as FixtureWindow).marklyraEditor.getMarkdown(),
        errors: null,
        errorObservation:
          'Existing React host reports SDK errors in #status; flush/Undo assertions are explicit.',
        extensionErrors: [],
        imports: [],
        cleanupCount: 0,
      };
    return {
      source: f.editor.getMarkdown(),
      errors: f.errors,
      extensionErrors: f.extensionErrors,
      imports: f.imports.map((x) => ({ ...x, signal: { aborted: x.signal.aborted } })),
      cleanupCount: f.cleanupCount,
    };
  });
  if (f.errors) expect(f.errors, 'SDK synchronization errors').toEqual([]);
  await info.attach('extension-result', {
    body: JSON.stringify(f, null, 2),
    contentType: 'application/json',
  });
});

test('registration/disposal preserve actual DOM, directed cursor, raw bytes and seeded Undo/Redo', async ({
  page,
}, info) => {
  const original = '\uFEFF# Golden\r\n\nAlpha **bold** word.  \r\n\nTail\n';
  await load(page, original);
  await select(page);
  await page.keyboard.type('X');
  await flush(page);
  await child(page)
    .locator('#write')
    .evaluate(() => (window as unknown as LegacyGlobals).editor?.undo.endSnap(true));
  await page.keyboard.type('Y');
  await flush(page);
  await page.evaluate(() =>
    (window as FixtureWindow).extensionFixture.editor.execute({ type: 'undo' }),
  );
  const before = await snapshot(page);
  expect(before.history.undo).toBe(true);
  expect(before.history.redo).toBe(true);
  await page.evaluate(async () => {
    const f = (window as FixtureWindow).extensionFixture;
    const registration = f.editor.registerExtension({
      id: 'observe',
      commands: {},
      setup: (context) => {
        f.context = context;
        context.onChange((source) => {
          f.changes.push(source);
        });
        return () => {
          f.cleanupCount++;
        };
      },
    });
    f.registrations.push(registration);
    await registration.ready;
    const selection = f.context?.getSelection();
    if (selection?.bookmark) selection.bookmark.id = 'not-a-real-node';
  });
  expect(await snapshot(page)).toEqual(before);
  await page.evaluate(() => (window as FixtureWindow).extensionFixture.registrations[0]?.dispose());
  expect(await snapshot(page)).toEqual(before);
  expect(await page.evaluate(() => (window as FixtureWindow).extensionFixture.cleanupCount)).toBe(
    1,
  );
  await page.evaluate(() =>
    (window as FixtureWindow).extensionFixture.editor.execute({ type: 'redo' }),
  );
  expect(await flush(page)).toContain('AlphaXY');
  await page.evaluate(() =>
    (window as FixtureWindow).extensionFixture.editor.execute({ type: 'undo' }),
  );
  expect(await flush(page)).toBe(before.source);
  await info.attach('actual-registration-state', {
    body: JSON.stringify({ original, before, after: await snapshot(page) }),
    contentType: 'application/json',
  });
  await info.attach('registered-editor', {
    body: await child(page).locator('#write').screenshot(),
    contentType: 'image/png',
  });
});

for (const kind of ['table', 'code', 'math'] as const) {
  test(`extension ${kind} uses the actual runtime model and original Undo/Redo`, async ({
    page,
  }, info) => {
    await select(page, true);
    const before = await flush(page);
    await page.evaluate(async (kind) => {
      const f = (window as FixtureWindow).extensionFixture;
      const registration = f.editor.registerExtension({
        id: 'blocks',
        commands: {
          'blocks.insert': (context) =>
            kind === 'table'
              ? context.execute({
                  type: 'insertText',
                  text: '| Name | Count |\n| --- | --- |\n| A | 1 |\n',
                })
              : context.execute({ type: kind === 'code' ? 'codeBlock' : 'mathBlock' }),
        },
      });
      await registration.ready;
      await f.editor.executeExtension('blocks', 'blocks.insert');
    }, kind);
    const selector = kind === 'table' ? 'table' : kind === 'code' ? '.md-fences' : '.md-math-block';
    await expect(child(page).locator(selector)).toHaveCount(1);
    const edited = await flush(page);
    expect(edited).not.toBe(before);
    await page.evaluate(() =>
      (window as FixtureWindow).extensionFixture.editor.execute({ type: 'undo' }),
    );
    expect(await flush(page)).toBe(before);
    await page.evaluate(() =>
      (window as FixtureWindow).extensionFixture.editor.execute({ type: 'redo' }),
    );
    expect(await flush(page)).toBe(edited);
    await info.attach('block-history', {
      body: JSON.stringify({ before, edited, redone: await snapshot(page) }),
      contentType: 'application/json',
    });
  });
}

test('image extension goes through the existing ImageHostAdapter and preserves source/history', async ({
  page,
}) => {
  await select(page);
  const before = await flush(page);
  await page.evaluate(async () => {
    const f = (window as FixtureWindow).extensionFixture;
    await f.editor.registerExtension({
      id: 'images',
      commands: {
        'images.insert': async (context) =>
          context.insertImage(await (await fetch(f.png)).blob(), 'image.png'),
      },
    }).ready;
    await f.editor.executeExtension('images', 'images.insert');
  });
  await expect
    .poll(() =>
      child(page)
        .locator('img')
        .evaluateAll((nodes) => nodes.some((img) => (img as HTMLImageElement).naturalWidth === 1)),
    )
    .toBe(true);
  const edited = await flush(page);
  expect(edited).toContain('assets/image.png');
  expect(edited).not.toContain('data:');
  expect(
    await page.evaluate(() =>
      (window as FixtureWindow).extensionFixture.imports.map((x) => ({
        context: x.context,
        name: x.name,
        bytes: x.bytes,
      })),
    ),
  ).toEqual([{ context: 'document', name: 'image.png', bytes: expect.any(Number) }]);
  await page.evaluate(() =>
    (window as FixtureWindow).extensionFixture.editor.execute({ type: 'undo' }),
  );
  expect(await flush(page)).toBe(before);
  await page.evaluate(() =>
    (window as FixtureWindow).extensionFixture.editor.execute({ type: 'redo' }),
  );
  expect(await flush(page)).toBe(edited);
});

test('direct SDK and extension insertion agree with the same explicit focus and selection preconditions', async ({
  page,
}, info) => {
  const outcomes: { mode: string; source: string; cells: number }[] = [];
  for (const mode of ['sdk', 'extension']) {
    await load(page, 'Alpha\n');
    await select(page, true);
    await page.evaluate(async (mode) => {
      const f = (window as FixtureWindow).extensionFixture;
      const command = {
        type: 'insertText',
        text: '| Name | Count |\n| --- | --- |\n| A | 1 |\n',
      } as const;
      if (mode === 'sdk') await f.editor.execute(command);
      else {
        await f.editor.registerExtension({
          id: 'control',
          commands: { 'control.table': (context) => context.execute(command) },
        }).ready;
        await f.editor.executeExtension('control', 'control.table');
      }
    }, mode);
    await expect(child(page).locator('table')).toHaveCount(1);
    outcomes.push({
      mode,
      source: await flush(page),
      cells: await child(page).locator('th,td').count(),
    });
  }
  expect(outcomes[0]?.source).toBe(outcomes[1]?.source);
  expect(outcomes[0]?.cells).toBe(outcomes[1]?.cells);
  await info.attach('direct-sdk-control', {
    body: JSON.stringify(outcomes),
    contentType: 'application/json',
  });
});

test('unload does not pretend to roll back an already dispatched editor command', async ({
  page,
}) => {
  await select(page);
  await child(page)
    .locator('#write')
    .evaluate(() => {
      (Reflect.get(window, '__extensionRequestGate') as ExtensionRequestGate).enabled = true;
    });
  await page.evaluate(async () => {
    const f = (window as FixtureWindow).extensionFixture;
    f.registrations.push(
      f.editor.registerExtension({
        id: 'sent',
        commands: {
          'sent.insert': (context) => context.execute({ type: 'insertText', text: 'X' }),
        },
      }),
    );
    await f.registrations[0]?.ready;
    f.job = 'pending';
    void f.editor.executeExtension('sent', 'sent.insert').then(
      () => {
        f.job = 'resolved';
      },
      (error: unknown) => {
        f.job = String(error);
      },
    );
  });
  await expect
    .poll(() =>
      child(page)
        .locator('#write')
        .evaluate(
          () =>
            (Reflect.get(window, '__extensionRequestGate') as ExtensionRequestGate).queue.length,
        ),
    )
    .toBe(1);
  await page.evaluate(() => (window as FixtureWindow).extensionFixture.registrations[0]?.dispose());
  await expect
    .poll(() => page.evaluate(() => (window as FixtureWindow).extensionFixture.job))
    .toContain('cancelled');
  await child(page)
    .locator('#write')
    .evaluate(() => {
      (Reflect.get(window, '__extensionRequestGate') as ExtensionRequestGate).release();
    });
  await expect.poll(() => flush(page)).toBe('AlphaX\n');
  await page.evaluate(() =>
    (window as FixtureWindow).extensionFixture.editor.execute({ type: 'undo' }),
  );
  expect(await flush(page)).toBe('Alpha\n');
});

for (const stop of ['unload', 'document'] as const) {
  test(`pending async extension is revoked on ${stop} before its late write`, async ({ page }) => {
    const before = await snapshot(page);
    await page.evaluate(async () => {
      const f = (window as FixtureWindow).extensionFixture;
      f.registrations.push(
        f.editor.registerExtension({
          id: 'slow',
          commands: {
            'slow.insert': async (context) => {
              f.commandContext = context;
              f.entered = true;
              await new Promise<void>((resolve) => {
                f.release = resolve;
              });
              await context.execute({ type: 'insertText', text: 'LATE' });
            },
          },
        }),
      );
      await f.registrations[0]?.ready;
      f.job = 'pending';
      void f.editor.executeExtension('slow', 'slow.insert').then(
        () => {
          f.job = 'resolved';
        },
        (error: unknown) => {
          f.job = String(error);
        },
      );
    });
    await expect
      .poll(() => page.evaluate(() => (window as FixtureWindow).extensionFixture.entered))
      .toBe(true);
    if (stop === 'unload')
      await page.evaluate(() =>
        (window as FixtureWindow).extensionFixture.registrations[0]?.dispose(),
      );
    else await load(page, 'New document\n');
    await expect
      .poll(() => page.evaluate(() => (window as FixtureWindow).extensionFixture.job))
      .toContain('cancelled');
    await page.evaluate(async () => {
      const f = (window as FixtureWindow).extensionFixture;
      f.release?.();
      await f.commandContext?.execute({ type: 'codeBlock' }).catch(() => {});
    });
    if (stop === 'unload') expect(await snapshot(page)).toEqual(before);
    else expect(await flush(page)).toBe('New document\n');
  });
}

test('unloading during a deferred image import aborts its adapter signal and rejects late insertion', async ({
  page,
}) => {
  await select(page);
  const before = await snapshot(page);
  await page.evaluate(async () => {
    const f = (window as FixtureWindow).extensionFixture;
    f.deferImport = true;
    f.registrations.push(
      f.editor.registerExtension({
        id: 'images',
        commands: {
          'images.insert': async (context) =>
            context.insertImage(await (await fetch(f.png)).blob(), 'image.png'),
        },
      }),
    );
    await f.registrations[0]?.ready;
    f.job = 'pending';
    void f.editor.executeExtension('images', 'images.insert').then(
      () => {
        f.job = 'resolved';
      },
      (error: unknown) => {
        f.job = String(error);
      },
    );
  });
  await expect
    .poll(() => page.evaluate(() => (window as FixtureWindow).extensionFixture.imports.length))
    .toBe(1);
  await page.evaluate(() => (window as FixtureWindow).extensionFixture.registrations[0]?.dispose());
  expect(
    await page.evaluate(
      () => (window as FixtureWindow).extensionFixture.imports[0]?.signal.aborted,
    ),
  ).toBe(true);
  await expect
    .poll(() => page.evaluate(() => (window as FixtureWindow).extensionFixture.job))
    .toContain('cancelled');
  await page.evaluate(() => (window as FixtureWindow).extensionFixture.releaseImport?.());
  expect(await snapshot(page)).toEqual(before);
  await expect(child(page).locator('img')).toHaveCount(0);
});

test('bad setup/observers/commands/cleanup cannot fault the SDK or healthy extensions', async ({
  page,
}) => {
  await select(page);
  const before = await flush(page);
  await page.evaluate(async () => {
    const f = (window as FixtureWindow).extensionFixture;
    await f.editor
      .registerExtension({
        id: 'setup-failure',
        commands: {},
        setup: () => {
          throw new Error('setup failure');
        },
      })
      .ready.catch(() => {});
    await f.editor.registerExtension({
      id: 'broken',
      commands: {
        'broken.command': async () => {
          throw new Error('command failure');
        },
      },
      setup: (context) => {
        context.onChange(async () => {
          throw new Error('observer failure');
        });
        return () => {
          throw new Error('cleanup failure');
        };
      },
    }).ready;
    await f.editor.executeExtension('broken', 'broken.command').catch(() => {});
    await f.editor.registerExtension({
      id: 'healthy',
      commands: {
        'healthy.insert': (context) => context.execute({ type: 'insertText', text: 'X' }),
      },
    }).ready;
    await f.editor.executeExtension('healthy', 'healthy.insert');
    await f.editor.flush();
    f.editor.unregisterExtension('broken');
  });
  expect(await flush(page)).toContain('AlphaX');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as FixtureWindow).extensionFixture.extensionErrors.map((x) => x.phase).sort(),
      ),
    )
    .toEqual(['change', 'command', 'dispose', 'setup']);
  await page.evaluate(() =>
    (window as FixtureWindow).extensionFixture.editor.execute({ type: 'undo' }),
  );
  expect(await flush(page)).toBe(before);
});

test('unknown plugins, conflicting commands and ABI/native-shaped inputs leave the actual document untouched', async ({
  page,
}) => {
  const before = await snapshot(page);
  const errors = await page.evaluate(async () => {
    const f = (window as FixtureWindow).extensionFixture;
    const errors: string[] = [];
    await f.editor.registerExtension({
      id: 'first',
      commands: { 'first.run': (context, input) => context.execute(input as never) },
    }).ready;
    try {
      f.editor.registerExtension({ id: 'collision', commands: { 'first.run': () => {} } });
    } catch (error) {
      errors.push(String(error));
    }
    for (const [id, command, input] of [
      ['missing', 'first.run', undefined],
      ['first', 'missing.command', undefined],
      ['first', 'first.run', { type: 'native.eval', path: '/fixture/private' }],
      ['first', 'first.run', { type: 'restoreSelection', bookmark: { type: 'remove' } }],
      ['first', 'first.run', { type: 'insertText', text: 'X', path: '/fixture/private' }],
    ] as const) {
      await f.editor.executeExtension(id, command, input).catch((error: unknown) => {
        errors.push(String(error));
      });
    }
    return errors;
  });
  expect(errors).toHaveLength(6);
  expect(await snapshot(page)).toEqual(before);
});

test('composition guard remains active for extension commands (synthetic, not OS IME)', async ({
  page,
}) => {
  const before = await flush(page);
  await page.evaluate(async () => {
    const f = (window as FixtureWindow).extensionFixture;
    await f.editor.registerExtension({
      id: 'blocks',
      commands: { 'blocks.code': (context) => context.execute({ type: 'codeBlock' }) },
    }).ready;
  });
  await child(page).locator('#write').dispatchEvent('compositionstart', { data: '' });
  await expect
    .poll(() => page.evaluate(() => (window as FixtureWindow).extensionFixture.editor.isComposing))
    .toBe(true);
  const error = await page.evaluate(() =>
    (window as FixtureWindow).extensionFixture.editor
      .executeExtension('blocks', 'blocks.code')
      .then(
        () => 'resolved',
        (error: unknown) => String(error),
      ),
  );
  expect(error).toContain('输入法候选');
  await child(page).locator('#write').dispatchEvent('compositionend', { data: '' });
  await expect
    .poll(() => page.evaluate(() => (window as FixtureWindow).extensionFixture.editor.isComposing))
    .toBe(false);
  expect(await flush(page)).toBe(before);
});

test('destroy revokes retained plugin callbacks and disposes setup once', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = (window as FixtureWindow).extensionFixture;
    await f.editor.registerExtension({
      id: 'observe',
      commands: {},
      setup: (context) => {
        f.context = context;
        context.onChange(() => {
          f.changes.push('unexpected');
        });
        return () => {
          f.cleanupCount++;
        };
      },
    }).ready;
    f.editor.destroy();
    f.editor.destroy();
    let error = '';
    try {
      f.context?.getSelection();
    } catch (cause) {
      error = String(cause);
    }
    return {
      error,
      count: f.cleanupCount,
      frames: document.querySelectorAll('.marklyra-editor-frame').length,
    };
  });
  expect(result.error).toContain('disposed');
  expect(result.count).toBe(1);
  expect(result.frames).toBe(0);
});

test('the existing React example can register/edit/dispose without replacing its iframe on re-render', async ({
  page,
}) => {
  await page.goto('/react.html');
  await page.waitForFunction(() => Boolean((window as Partial<FixtureWindow>).marklyraEditor));
  await page.evaluate(() => (window as FixtureWindow).marklyraEditor.ready);
  // This fixture is the existing React host, not the standalone registry double above.
  await page.evaluate(async () => {
    const editor = (window as FixtureWindow).marklyraEditor;
    await editor.load('Alpha\n');
    await editor.registerExtension({
      id: 'react-blocks',
      commands: {
        'react.insert': (context) => context.execute({ type: 'insertText', text: 'X' }),
      },
    }).ready;
  });
  const frame = await page.locator('.marklyra-editor-frame').elementHandle();
  await select(page);
  await page.evaluate(async () => {
    const editor = (window as FixtureWindow).marklyraEditor;
    await editor.executeExtension('react-blocks', 'react.insert');
    editor.unregisterExtension('react-blocks');
  });
  expect(await page.evaluate(() => (window as FixtureWindow).marklyraEditor.flush())).toBe(
    'AlphaX\n',
  );
  expect(await frame?.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => (window as FixtureWindow).marklyraEditor.execute({ type: 'undo' }));
  expect(await page.evaluate(() => (window as FixtureWindow).marklyraEditor.flush())).toBe(
    'Alpha\n',
  );
});
