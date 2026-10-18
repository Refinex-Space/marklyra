import type { SourceMirror } from '@marklyra/editor-core';
import {
  defaultMarkLyraMarkdownPreferences,
  type MarkLyraEditor,
  type MarkLyraMarkdownPreferences,
} from '@marklyra/editor-runtime';
import { expect, type Frame, type Page, test } from '@playwright/test';
import type { LegacyGlobals } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type Host = Window & {
  marklyraEditor: MarkLyraEditor;
  markdownPreferenceErrors: string[];
  expectedMarkdownErrors?: string[];
};
const original = '\uFEFF- Alpha\r\n- Beta\n\nTail  \r\n';

async function mount(page: Page, source = original) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as unknown as Host;
    await host.marklyraEditor.ready;
    const Constructor = host.marklyraEditor.constructor as typeof MarkLyraEditor;
    host.marklyraEditor.destroy();
    const root = document.querySelector<HTMLElement>('#editor');
    if (!root) throw new Error('Missing editor mount');
    host.markdownPreferenceErrors = [];
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      onError: (error) => host.markdownPreferenceErrors.push(error.message),
    });
    await host.marklyraEditor.ready;
  }, source);
  const frame = page.frames().find((value) => value.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw new Error('Missing runtime frame');
  return frame;
}
async function flush(page: Page) {
  return page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
}
async function set(page: Page, change: Partial<MarkLyraMarkdownPreferences>) {
  await page.evaluate(
    (change) => (window as unknown as Host).marklyraEditor.setMarkdownPreferences(change),
    change,
  );
}
async function execute(page: Page, type: 'undo' | 'redo' | 'toggleSource') {
  await page.evaluate((type) => (window as unknown as Host).marklyraEditor.execute({ type }), type);
}
async function canonical(frame: Frame) {
  return frame.evaluate(() => (window as unknown as LegacyGlobals).editor?.getMarkdown());
}
async function place(frame: Frame, text: string) {
  await frame.evaluate((text) => {
    const paragraph = [...document.querySelectorAll<HTMLElement>('#write p')].find(
      (node) => node.textContent === text,
    );
    if (!paragraph) throw new Error(`Missing paragraph ${text}`);
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let end = walker.nextNode();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) end = node;
    if (!end) throw new Error('Missing text endpoint');
    paragraph.focus();
    const range = document.createRange();
    range.setStart(end, end.textContent?.length ?? 0);
    range.collapse(true);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  }, text);
}
async function generated(page: Page, frame: Frame) {
  await place(frame, 'Beta');
  const before = await canonical(frame);
  try {
    await page.evaluate(() =>
      (window as unknown as Host).marklyraEditor.execute({ type: 'indent' }),
    );
  } catch (error) {
    const next = await page.evaluate(() => {
      const editor = (window as unknown as Host).marklyraEditor as unknown as {
        request(operation: string): Promise<unknown>;
      };
      return editor.request('flush');
    });
    await test.info().attach('indent-state', {
      body: JSON.stringify({ before, next }),
      contentType: 'application/json',
    });
    throw error;
  }
  const source = await flush(page);
  expect(source).toBe(original.replace('- Beta', '  - Beta'));
  return source;
}
async function history(frame: Frame) {
  return frame.evaluate(() => {
    const undo = (window as unknown as LegacyGlobals).editor?.undo;
    return JSON.stringify({ index: undo?.index, stack: undo?.commandStack });
  });
}
test.afterEach(async ({ page }) => {
  const result = await page.evaluate(() => {
    const host = window as unknown as Host;
    return {
      actual: host.markdownPreferenceErrors ?? [],
      expected: host.expectedMarkdownErrors ?? [],
    };
  });
  expect(result.actual).toEqual(result.expected);
});

test('live policy changes preserve exact raw bytes, document identity, selection, revision and native history', async ({
  page,
}) => {
  const frame = await mount(page);
  const source = await generated(page, frame);
  const before = await history(frame);
  const revision = await page.evaluate(() => (window as unknown as Host).marklyraEditor.revision);
  const selection = await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.getSelection(),
  );
  await frame.evaluate(() => {
    Reflect.set(window, 'policyDocumentNodes', [
      ...document.querySelectorAll('#write, #write [cid]'),
    ]);
  });
  for (const indentSize of [4, -1, 3, 0, 5, 2] as const) {
    await set(page, { indentSize, prettyIndent: true });
    expect(await flush(page)).toBe(source);
    expect(await canonical(frame)).toContain(
      `${indentSize === -1 ? '\t' : ' '.repeat(indentSize || 2)}- Beta`,
    );
    expect(await history(frame)).toBe(before);
    expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.revision)).toBe(
      revision,
    );
    expect(
      await page.evaluate(() => (window as unknown as Host).marklyraEditor.getSelection()),
    ).toEqual(selection);
    expect(
      await frame.evaluate(() => {
        const saved: unknown = Reflect.get(window, 'policyDocumentNodes');
        const nodes = [...document.querySelectorAll('#write, #write [cid]')];
        return (
          Array.isArray(saved) &&
          saved.length === nodes.length &&
          saved.every((node, index) => node === nodes[index])
        );
      }),
    ).toBe(true);
  }
});

test('existing undo and redo checkpoints retain raw formatting across repeated live policy changes', async ({
  page,
}) => {
  const frame = await mount(page);
  const nested = await generated(page, frame);
  await execute(page, 'undo');
  expect(await flush(page)).toBe(original);
  const before = await history(frame);
  await set(page, { indentSize: 4 });
  expect(await history(frame)).toBe(before);
  await execute(page, 'redo');
  expect(await flush(page)).toBe(nested);
  expect(await canonical(frame)).toContain('\n    - Beta');
  await set(page, { indentSize: -1 });
  await execute(page, 'undo');
  expect(await flush(page)).toBe(original);
  await execute(page, 'redo');
  expect(await flush(page)).toBe(nested);
  expect(await canonical(frame)).toContain('\n\t- Beta');
  await place(frame, 'Beta');
  await page.keyboard.type('!');
  expect(await flush(page)).toBe(nested.replace('Beta', 'Beta!'));
  await execute(page, 'undo');
  expect(await flush(page)).toBe(nested);
  await execute(page, 'redo');
  expect(await flush(page)).toBe(nested.replace('Beta', 'Beta!'));
});

test('Source hides a deferred policy without treating its canonical whitespace change as an edit', async ({
  page,
}) => {
  const frame = await mount(page);
  const source = await generated(page, frame);
  await execute(page, 'toggleSource');
  const sourceCanonical = await canonical(frame);
  const revision = await page.evaluate(() => (window as unknown as Host).marklyraEditor.revision);
  await set(page, { indentSize: -1 });
  expect(await canonical(frame)).toBe(sourceCanonical);
  expect(await flush(page)).toBe(source);
  await execute(page, 'toggleSource');
  expect(await canonical(frame)).toContain('\n\t- Beta');
  expect(await flush(page)).toBe(source);
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.revision)).toBe(
    revision,
  );
  await execute(page, 'undo');
  expect(await flush(page)).toBe(original);
  await execute(page, 'redo');
  expect(await flush(page)).toBe(source);
});

test('loaded indentation is preserved and a failed model proof leaves preferences, source and history usable', async ({
  page,
}) => {
  const source = '\uFEFF- Alpha\r\n  - Beta\n\nTail  \r\n';
  const frame = await mount(page, source);
  await set(page, { indentSize: 4, prettyIndent: true });
  expect(await flush(page)).toBe(source);
  expect(await canonical(frame)).toContain('\n  - Beta');
  const before = await history(frame);
  await frame.evaluate(() => {
    Reflect.set(
      (window as unknown as LegacyGlobals).editor?.nodeMap ?? {},
      'unsupportedPolicyField',
      () => {},
    );
  });
  await expect(set(page, { indentSize: -1 })).rejects.toThrow(/policy|model|field|data/i);
  await frame.evaluate(() => {
    Reflect.deleteProperty(
      (window as unknown as LegacyGlobals).editor?.nodeMap ?? {},
      'unsupportedPolicyField',
    );
  });
  expect(await flush(page)).toBe(source);
  expect(await history(frame)).toBe(before);
  expect(
    await frame.evaluate(() => (window as unknown as LegacyGlobals).File?.option.indentByTab),
  ).toBe(false);
  await set(page, { indentSize: -1 });
  expect(await flush(page)).toBe(source);
});

test('input arriving after preparation cancels the setting instead of overwriting newer content', async ({
  page,
}) => {
  const frame = await mount(page);
  const source = await generated(page, frame);
  await place(frame, 'Beta');
  await page.evaluate(() => {
    const editor = (window as unknown as Host).marklyraEditor;
    const target = editor as unknown as {
      request(operation: string, payload?: unknown): Promise<unknown>;
    };
    const original = target.request.bind(target);
    let once = true;
    target.request = async (operation, payload) => {
      if (operation === 'markdown-preferences-commit' && once) {
        once = false;
        await editor.execute({ type: 'insertText', text: 'Z' });
      }
      return original(operation, payload);
    };
  });
  await expect(set(page, { indentSize: 4 })).rejects.toThrow(/更改|过期/);
  expect(await flush(page)).toBe(source.replace('Beta', 'BetaZ'));
  expect(
    await frame.evaluate(() => (window as unknown as LegacyGlobals).File?.option.indentSize),
  ).toBe(2);
  await execute(page, 'undo');
  expect(await flush(page)).toBe(source);
});

test('Source editing after a deferred policy preserves the input and untouched raw formatting on hide', async ({
  page,
}) => {
  const frame = await mount(page);
  const source = await generated(page, frame);
  await execute(page, 'toggleSource');
  await set(page, { indentSize: 4, prettyIndent: true });
  await frame.evaluate(() => {
    const cm = (window as unknown as LegacyGlobals).editor?.sourceView.cm;
    if (!cm) throw new Error('Missing source CodeMirror');
    const value = cm.getValue();
    const lines = value.slice(0, value.indexOf('Beta') + 4).split(/\r\n|\r|\n/);
    cm.replaceRange(' 中文', { line: lines.length - 1, ch: lines.at(-1)?.length ?? 0 });
  });
  expect(await flush(page)).toBe(source.replace('Beta', 'Beta 中文'));
  await execute(page, 'toggleSource');
  expect(await flush(page)).toBe(source.replace('Beta', 'Beta 中文'));
  expect(
    await frame.evaluate(() => (window as unknown as LegacyGlobals).File?.option.indentSize),
  ).toBe(4);
});

test('a cancelled composition wait never applies its abandoned policy after composition ends', async ({
  page,
}) => {
  const frame = await mount(page);
  await frame.evaluate(() => {
    document
      .querySelector('#write p')
      ?.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
  });
  await page.waitForFunction(() => (window as unknown as Host).marklyraEditor.isComposing);
  await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    const controller = new AbortController();
    const pending = editor.setMarkdownPreferences(
      { indentSize: -1 },
      { signal: controller.signal },
    );
    await Promise.resolve();
    await Promise.resolve();
    const waiters: unknown = Reflect.get(editor, 'compositionWaiters');
    if (!(waiters instanceof Set) || waiters.size !== 1)
      throw new Error('Preference did not enter its composition wait');
    controller.abort();
    let rejected = false;
    try {
      await pending;
    } catch (error) {
      rejected = String(error).includes('取消');
    }
    if (!rejected) throw new Error('Aborted preference was not rejected');
  });
  await frame.evaluate(() => {
    document
      .querySelector('#write p')
      ?.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
  });
  expect(await flush(page)).toBe(original);
  expect(
    await frame.evaluate(() => (window as unknown as LegacyGlobals).File?.option.indentByTab),
  ).toBe(false);
  await set(page, { indentSize: 3 });
  expect(await flush(page)).toBe(original);
});

test('a rejected projected history recovers through its known native checkpoint and keeps later epochs usable', async ({
  page,
}) => {
  const frame = await mount(page);
  const source = await generated(page, frame);
  await set(page, { indentSize: 4 });
  await page.evaluate(() => {
    const host = window as unknown as Host;
    host.expectedMarkdownErrors = ['injected history projection failure'];
    const target = host.marklyraEditor as unknown as { mirror: SourceMirror };
    const original = target.mirror.update.bind(target.mirror);
    let once = true;
    target.mirror.update = (...args) => {
      const hint = args[1];
      if (once && hint?.kind === 'history' && hint.canonicalProjection) {
        once = false;
        throw new Error('injected history projection failure');
      }
      return original(...args);
    };
  });
  await expect(execute(page, 'undo')).rejects.toThrow('injected history projection failure');
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.getMarkdown())).toBe(
    source,
  );
  await execute(page, 'redo');
  expect(await flush(page)).toBe(source);
  await place(frame, 'Beta');
  await page.keyboard.type('!');
  expect(await flush(page)).toBe(source.replace('Beta', 'Beta!'));
  await execute(page, 'undo');
  expect(await flush(page)).toBe(source);
  await execute(page, 'redo');
  expect(await flush(page)).toBe(source.replace('Beta', 'Beta!'));
});

test('new generated content uses the current policy and document loading resets only its mapping generation', async ({
  page,
}) => {
  const source = '\uFEFFAlpha\r\n\r\nTail\n';
  const frame = await mount(page, source);
  await set(page, { indentSize: 4, prettyIndent: true });
  await place(frame, 'Alpha');
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'list', style: 'blockquote' }),
  );
  // The original block conversion includes its paragraph's trailing empty quote
  // line. Preserve that command result when later policies or history change.
  const quoted = source.replace('Alpha\r\n', '>   Alpha\r\n>\r\n');
  expect(await flush(page)).toBe(quoted);
  await execute(page, 'undo');
  expect(await flush(page)).toBe(source);
  await set(page, { indentSize: 5 });
  await execute(page, 'redo');
  expect(await canonical(frame)).toMatch(/^> {4}Alpha/);
  expect(await flush(page)).toBe(quoted);
  const next = '\uFEFF# Next\r\n\r\nKeep 中文\n';
  await page.evaluate((next) => (window as unknown as Host).marklyraEditor.load(next), next);
  expect(await flush(page)).toBe(next);
  expect(
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.getMarkdownPreferences()),
  ).toEqual({ ...defaultMarkLyraMarkdownPreferences, indentSize: 5, prettyIndent: true });
  await set(page, { indentSize: 0 });
  expect(await flush(page)).toBe(next);
});

test('a focused browser Tab uses the same proven list operation and preserves physical line endings', async ({
  page,
}) => {
  const frame = await mount(page);
  await frame.locator('#write li > p').nth(1).click();
  await place(frame, 'Beta');
  await page.keyboard.press('Tab');
  await expect(frame.locator('#write li li')).toHaveCount(1);
  expect(await flush(page)).toBe(original.replace('- Beta', '  - Beta'));
  await execute(page, 'undo');
  expect(await flush(page)).toBe(original);
  await execute(page, 'redo');
  expect(await flush(page)).toBe(original.replace('- Beta', '  - Beta'));
});

test('Source undo after a live policy projection uses its exact CM history bridge, including failed-load restoration', async ({
  page,
}) => {
  const frame = await mount(page);
  const nested = await generated(page, frame);
  await set(page, { indentSize: 4 });
  await execute(page, 'toggleSource');
  await frame.evaluate(() => {
    const cm = (window as unknown as LegacyGlobals).editor?.sourceView.cm;
    if (!cm) throw new Error('Missing source CodeMirror');
    const lines = cm
      .getValue()
      .slice(0, cm.getValue().indexOf('Beta') + 4)
      .split(/\r\n|\r|\n/);
    cm.replaceRange('!', { line: lines.length - 1, ch: lines.at(-1)?.length ?? 0 });
  });
  expect(await flush(page)).toBe(nested.replace('Beta', 'Beta!'));
  await frame.evaluate(() => {
    const cm = (window as unknown as LegacyGlobals).editor?.sourceView.cm;
    if (!cm) throw new Error('Missing source CodeMirror');
    const undo: unknown = Reflect.get(cm, 'undo');
    if (typeof undo !== 'function') throw new Error('Missing source Undo');
    Reflect.apply(undo, cm, []);
  });
  expect(await flush(page)).toBe(nested);
  await frame.evaluate(() => {
    const cm = (window as unknown as LegacyGlobals).editor?.sourceView.cm;
    if (!cm) throw new Error('Missing source CodeMirror');
    const redo: unknown = Reflect.get(cm, 'redo');
    if (typeof redo !== 'function') throw new Error('Missing source Redo');
    Reflect.apply(redo, cm, []);
  });
  expect(await flush(page)).toBe(nested.replace('Beta', 'Beta!'));
  await page.evaluate(() => {
    const host = window as unknown as Host;
    host.expectedMarkdownErrors = ['Text contains an unpaired high surrogate'];
  });
  await expect(
    page.evaluate(() => (window as unknown as Host).marklyraEditor.load('\ud800')),
  ).rejects.toThrow();
  expect(await flush(page)).toBe(nested.replace('Beta', 'Beta!'));
  await frame.evaluate(() => {
    const cm = (window as unknown as LegacyGlobals).editor?.sourceView.cm;
    if (!cm) throw new Error('Missing source CodeMirror');
    const undo: unknown = Reflect.get(cm, 'undo');
    if (typeof undo !== 'function') throw new Error('Missing source Undo');
    Reflect.apply(undo, cm, []);
  });
  expect(await flush(page)).toBe(nested);
  await frame.evaluate(() => {
    const cm = (window as unknown as LegacyGlobals).editor?.sourceView.cm;
    if (!cm) throw new Error('Missing source CodeMirror');
    const redo: unknown = Reflect.get(cm, 'redo');
    if (typeof redo !== 'function') throw new Error('Missing source Redo');
    Reflect.apply(redo, cm, []);
  });
  expect(await flush(page)).toBe(nested.replace('Beta', 'Beta!'));
});

test('a lost committed policy receipt is resolved from the token before getters or same-value updates proceed', async ({
  page,
}) => {
  const frame = await mount(page);
  const nested = await generated(page, frame);
  const before = await history(frame);
  await page.evaluate(() => {
    const editor = (window as unknown as Host).marklyraEditor as unknown as {
      request(operation: string, payload?: unknown): Promise<unknown>;
    };
    const original = editor.request.bind(editor);
    let once = true;
    editor.request = async (operation, payload) => {
      const result = await original(operation, payload);
      if (operation === 'markdown-preferences-commit' && once) {
        once = false;
        throw new Error('injected lost commit receipt');
      }
      return result;
    };
  });
  await set(page, { indentSize: 4 });
  expect(
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.getMarkdownPreferences()),
  ).toEqual({ ...defaultMarkLyraMarkdownPreferences, indentSize: 4, prettyIndent: false });
  expect(await canonical(frame)).toContain('\n    - Beta');
  expect(await flush(page)).toBe(nested);
  await set(page, { indentSize: 2 });
  expect(await canonical(frame)).toContain('\n  - Beta');
  expect(await history(frame)).toBe(before);
  expect(await flush(page)).toBe(nested);
});

test('an unknown commit blocks stale-policy consumers and retries resolution before a same-value update', async ({
  page,
}) => {
  const frame = await mount(page);
  const nested = await generated(page, frame);
  const before = await history(frame);
  await page.evaluate(() => {
    const host = window as unknown as Host;
    host.expectedMarkdownErrors = [
      'Markdown策略结果尚未确认，原稿保留，请重试同步：Error: injected resolve unavailable',
    ];
    const editor = host.marklyraEditor as unknown as {
      request(operation: string, payload?: unknown): Promise<unknown>;
    };
    const original = editor.request.bind(editor);
    let commit = true,
      resolve = true;
    editor.request = async (operation, payload) => {
      if (operation === 'markdown-preferences-resolve' && resolve) {
        resolve = false;
        throw new Error('injected resolve unavailable');
      }
      const result = await original(operation, payload);
      if (operation === 'markdown-preferences-commit' && commit) {
        commit = false;
        throw new Error('injected lost commit receipt');
      }
      return result;
    };
  });
  await expect(set(page, { indentSize: 4 })).rejects.toThrow(/尚未确认/);
  const guarded = await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    const failures: string[] = [];
    for (const work of [
      () => editor.getMarkdownPreferences(),
      () => editor.load('must not load'),
      () =>
        editor.reloadFromDisk('must not reload', {
          expectedSource: editor.getMarkdown(),
          expectedRevision: editor.revision,
        }),
      () => editor.exportHTML(),
      () => editor.getStatistics(),
    ]) {
      try {
        await work();
        failures.push('unexpected success');
      } catch (error) {
        failures.push(String(error));
      }
    }
    return {
      failures,
      frames: document.querySelectorAll('.marklyra-editor-frame').length,
      raw: editor.getMarkdown(),
    };
  });
  expect(guarded.failures).toHaveLength(5);
  for (const error of guarded.failures) expect(error).toContain('尚未确认');
  expect(guarded.frames).toBe(1);
  expect(guarded.raw).toBe(nested);
  await set(page, { indentSize: 2 });
  expect(
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.getMarkdownPreferences()),
  ).toEqual({ ...defaultMarkLyraMarkdownPreferences, indentSize: 2, prettyIndent: false });
  expect(await canonical(frame)).toContain('\n  - Beta');
  expect(await flush(page)).toBe(nested);
  expect(await history(frame)).toBe(before);
});

test('resolving an undelivered commit cancels its token before a late command can change the policy', async ({
  page,
}) => {
  const frame = await mount(page);
  const nested = await generated(page, frame);
  await page.evaluate(() => {
    const editor = (window as unknown as Host).marklyraEditor as unknown as {
      request(operation: string, payload?: unknown): Promise<unknown>;
    };
    const original = editor.request.bind(editor);
    let once = true;
    editor.request = async (operation, payload) => {
      if (operation === 'markdown-preferences-commit' && once) {
        once = false;
        Reflect.set(window, 'undeliveredPolicyToken', payload);
        throw new Error('injected undelivered commit');
      }
      return original(operation, payload);
    };
  });
  await expect(set(page, { indentSize: 4 })).rejects.toThrow('injected undelivered commit');
  expect(
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.getMarkdownPreferences()),
  ).toEqual({ ...defaultMarkLyraMarkdownPreferences, indentSize: 2, prettyIndent: false });
  await expect(
    page.evaluate(() => {
      const editor = (window as unknown as Host).marklyraEditor as unknown as {
        request(operation: string, payload?: unknown): Promise<unknown>;
      };
      return editor.request(
        'markdown-preferences-commit',
        Reflect.get(window, 'undeliveredPolicyToken'),
      );
    }),
  ).rejects.toThrow(/过期/);
  expect(await flush(page)).toBe(nested);
  await set(page, { indentSize: 4 });
  expect(await canonical(frame)).toContain('\n    - Beta');
  expect(await flush(page)).toBe(nested);
});

for (const [headingStyle, expected] of [
  [0, '# Alpha'],
  [1, 'Alpha\n==='],
  [2, '# Alpha #'],
  [3, 'Alpha\n====='],
] as const) {
  test(`generated heading style ${headingStyle} preserves loaded syntax and replays exact raw history`, async ({
    page,
  }) => {
    const source = '\uFEFFAlpha\r\n\r\n## Loaded ##\n\nTail  \r\n';
    const frame = await mount(page, source);
    await set(page, { headingStyle });
    expect(await flush(page)).toBe(source);
    await place(frame, 'Alpha');
    await page.evaluate(() =>
      (window as unknown as Host).marklyraEditor.execute({ type: 'heading', level: 1 }),
    );
    const edited = source.replace('Alpha', expected.replace(/\n/g, '\r\n'));
    expect(await flush(page)).toBe(edited);
    const stack = await history(frame);
    const revision = await page.evaluate(() => (window as unknown as Host).marklyraEditor.revision);
    const selection = await page.evaluate(() =>
      (window as unknown as Host).marklyraEditor.getSelection(),
    );
    await frame.evaluate(() =>
      Reflect.set(window, 'styleNodes', [...document.querySelectorAll('#write, #write [cid]')]),
    );
    for (const next of [3, 2, 1, 0] as const) {
      await set(page, { headingStyle: next, ulStyle: 2, olStyle: 1 });
      expect(await flush(page)).toBe(edited);
      expect(await history(frame)).toBe(stack);
      expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.revision)).toBe(
        revision,
      );
      expect(
        await page.evaluate(() => (window as unknown as Host).marklyraEditor.getSelection()),
      ).toEqual(selection);
      expect(
        await frame.evaluate(() => {
          const saved = Reflect.get(window, 'styleNodes') as Node[];
          return [...document.querySelectorAll('#write, #write [cid]')].every(
            (node, i) => node === saved[i],
          );
        }),
      ).toBe(true);
    }
    await execute(page, 'undo');
    expect(await flush(page)).toBe(source);
    await execute(page, 'redo');
    expect(await flush(page)).toBe(edited);
    await frame.locator('#write h1').click();
    await frame.evaluate(() => {
      const el = document.querySelector('#write h1');
      if (!el) throw Error('Missing generated heading');
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let text = walker.nextNode();
      while (text && !text.textContent?.includes('Alpha')) text = walker.nextNode();
      if (!text) throw Error('Missing heading text');
      const end = (text.textContent?.indexOf('Alpha') ?? 0) + 5;
      getSelection()?.setBaseAndExtent(text, end, text, end);
    });
    await page.keyboard.type('!');
    expect(await flush(page)).toBe(edited.replace('Alpha', 'Alpha!'));
    await execute(page, 'undo');
    expect(await flush(page)).toBe(edited);
    await execute(page, 'redo');
    expect(await flush(page)).toBe(edited.replace('Alpha', 'Alpha!'));
  });
}

test('style projection defers in source mode and keeps literal source edits, load and export coherent', async ({
  page,
}) => {
  const source = '\uFEFFAlpha\r\n\r\nTail  \n';
  const frame = await mount(page, source);
  await place(frame, 'Alpha');
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.execute({ type: 'heading', level: 1 }),
  );
  const edited = source.replace('Alpha', '# Alpha');
  await execute(page, 'toggleSource');
  const literal = await canonical(frame);
  await set(page, { headingStyle: 3, ulStyle: 1, olStyle: 1 });
  expect(await canonical(frame)).toBe(literal);
  expect(await flush(page)).toBe(edited);
  await execute(page, 'toggleSource');
  expect(await flush(page)).toBe(edited);
  expect(await canonical(frame)).toMatch(/^Alpha[ \t]*\r?\n=====[ \t]*\r?\n/);
  await execute(page, 'toggleSource');
  await frame.evaluate(() => {
    const cm = (window as unknown as LegacyGlobals).editor?.sourceView.cm;
    if (!cm) throw Error('Missing source CM');
    const lines = cm
      .getValue()
      .slice(0, cm.getValue().indexOf('Tail') + 4)
      .split(/\r\n|\r|\n/);
    cm.replaceRange(' 中文', { line: lines.length - 1, ch: lines.at(-1)?.length ?? 0 });
  });
  expect(await flush(page)).toBe(edited.replace('Tail', 'Tail 中文'));
  await execute(page, 'toggleSource');
  expect(await flush(page)).toBe(edited.replace('Tail', 'Tail 中文'));
  const next = '\uFEFF- Existing\r\n\r\nNew\n';
  await page.evaluate((next) => (window as unknown as Host).marklyraEditor.load(next), next);
  expect(await flush(page)).toBe(next);
  expect(
    await page.evaluate(() => (window as unknown as Host).marklyraEditor.getMarkdownPreferences()),
  ).toMatchObject({ headingStyle: 3, ulStyle: 1, olStyle: 1 });
  const html = await page.evaluate(() => (window as unknown as Host).marklyraEditor.exportHTML());
  expect(html).toContain('Existing');
  expect(await flush(page)).toBe(next);
});

for (const [ulStyle, marker] of [
  [0, '-'],
  [1, '+'],
  [2, '*'],
] as const) {
  test(`generated unordered marker ${marker} survives style epochs and exact history`, async ({
    page,
  }) => {
    const source = 'Alpha\n\nKeep\n';
    const frame = await mount(page, source);
    await set(page, { ulStyle, olStyle: 1 });
    await place(frame, 'Alpha');
    await page.evaluate(() =>
      (window as unknown as Host).marklyraEditor.execute({ type: 'list', style: 'ul' }),
    );
    const edited = source.replace('Alpha\n', `${marker} Alpha\n\n`);
    expect(await flush(page)).toBe(edited);
    await set(page, { ulStyle: ulStyle === 2 ? 0 : 2 });
    expect(await flush(page)).toBe(edited);
    await execute(page, 'undo');
    expect(await flush(page)).toBe(source);
    await execute(page, 'redo');
    expect(await flush(page)).toBe(edited);
  });
}

for (const olStyle of [0, 1] as const) {
  test(`generated ordered style ${olStyle} drives list continuation and preserves loaded numbering`, async ({
    page,
  }) => {
    const source = 'Alpha\n\nKeep\n';
    const frame = await mount(page, source);
    await set(page, { olStyle });
    await place(frame, 'Alpha');
    await page.evaluate(() =>
      (window as unknown as Host).marklyraEditor.execute({ type: 'list', style: 'ol' }),
    );
    expect(await flush(page)).toBe(source.replace('Alpha\n', '1. Alpha\n\n'));
    await place(frame, 'Alpha');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Beta');
    const edited = source.replace('Alpha', `1. Alpha\n${olStyle ? 1 : 2}. Beta`);
    expect(await flush(page)).toBe(edited);
    await set(page, { olStyle: olStyle ? 0 : 1 });
    expect(await flush(page)).toBe(edited);
    await execute(page, 'undo');
    expect(await flush(page)).not.toContain('Beta');
    await execute(page, 'redo');
    expect(await flush(page)).toBe(edited);
    const loaded = '\uFEFF7. Old\r\n9. Other\n';
    await page.evaluate(
      (loaded) => (window as unknown as Host).marklyraEditor.load(loaded),
      loaded,
    );
    await set(page, { olStyle });
    expect(await flush(page)).toBe(loaded);
  });
}
