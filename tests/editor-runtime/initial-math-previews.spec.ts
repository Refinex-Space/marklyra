import { readFile } from 'node:fs/promises';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Frame, type Page, test } from '@playwright/test';
import type {
  LegacyEditor,
  LegacyGlobals,
} from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type Host = Window & { marklyraEditor: MarkLyraEditor; initialMathErrors: string[] };
interface Probe {
  firstStarted: boolean;
  firstDone: boolean;
  fallbacks: string[];
  checks: boolean[];
  focus?: Element | null;
  history?: { index: number; size: number };
  holdFallback: boolean;
  holdInitial: boolean;
  held: (() => Promise<void>)[];
  releasePanels(): Promise<void>;
  restore(): void;
}
test.beforeEach(async ({ page }) => {
  const frame = process.env.INITIAL_MATH_FRAME;
  if (frame)
    await page.route('http://127.0.0.1:4174/frame-host.js', async (route) =>
      route.fulfill({ contentType: 'text/javascript', body: await readFile(frame) }),
    );
});
async function fixture(
  page: Page,
  enabled: boolean,
  hold: 'none' | 'initial' | 'fallback' = 'none',
) {
  await page.goto('/runtime.html');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (enabled) => {
    const host = window as unknown as Host;
    const old = host.marklyraEditor;
    await old.ready;
    const Constructor = old.constructor as typeof MarkLyraEditor;
    old.destroy();
    host.initialMathErrors = [];
    const root = document.querySelector<HTMLElement>('#editor');
    if (!root) throw Error('Missing runtime host');
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: '',
      startupPreferences: { noLegacyMath: !enabled, gitlabMath: enabled },
      onError: (error) => host.initialMathErrors.push(error.message),
    });
    await host.marklyraEditor.ready;
  }, enabled);
  const frame = page.frames().find((candidate) => candidate.url().includes('4174/index.html'));
  if (!frame) throw Error('Missing current runtime frame');
  await expect
    .poll(() =>
      frame.evaluate(() =>
        (window as unknown as LegacyGlobals).editor?.mathBlock?.isMathJaxReady?.(),
      ),
    )
    .toBe(true);
  await frame.evaluate(async (hold) => {
    type MathAPI = {
      renderUnder(...args: unknown[]): Promise<unknown>;
      updateDiagram(cid: string): void;
    };
    type Diagrams = { startPreview(...args: unknown[]): Promise<unknown> };
    const runtime = window as unknown as LegacyGlobals & {
      MathJax: { tex2svgPromise(...args: unknown[]): Promise<Element> };
    };
    const editor = runtime.editor;
    if (!editor) throw Error('Missing current runtime editor');
    const math = editor.mathBlock as MathAPI;
    const diagrams = Reflect.get(editor, 'diagrams') as Diagrams;
    await math.renderUnder(document, true);
    const original = math.renderUnder,
      start = diagrams.startPreview,
      update = math.updateDiagram;
    const renderer = runtime.MathJax.tex2svgPromise;
    const ticket = runtime.__MARKLYRA_RENDER_TICKET__;
    if (!ticket) throw Error('Missing actual render-ticket hook');
    const deferredPasses: (() => void)[] = [],
      panels: (() => Promise<void>)[] = [];
    let inFallback = false;
    const probe: Probe = {
      firstStarted: false,
      firstDone: false,
      fallbacks: [],
      checks: [],
      holdFallback: hold === 'fallback',
      holdInitial: hold === 'initial',
      held: [],
      async releasePanels() {
        for (const release of panels.splice(0)) await release();
      },
      restore() {
        math.renderUnder = original;
        diagrams.startPreview = start;
        math.updateDiagram = update;
        runtime.MathJax.tex2svgPromise = renderer;
        runtime.__MARKLYRA_RENDER_TICKET__ = ticket;
        for (const release of deferredPasses.splice(0)) release();
      },
    };
    Reflect.set(window, 'initialMathProbe', probe);
    // Each document gets exactly one real native first pass. Redundant passes
    // wait so they cannot accidentally repair the missing-panel branch for us.
    math.renderUnder = function (...args) {
      if (!editor.writingArea.querySelector('.md-fences-math'))
        return Reflect.apply(original, this, args);
      if (probe.firstStarted)
        return new Promise((resolve) => deferredPasses.push(() => resolve(undefined)));
      probe.firstStarted = true;
      return Reflect.apply(original, this, args).then((value) => {
        probe.firstDone = true;
        return value;
      });
    };
    diagrams.startPreview = function (...args) {
      const node = editor.getNode(String(args[0]));
      if (!probe.firstDone && node?.get('lang') === 'math')
        return new Promise((resolve, reject) => {
          const source = node.get('text');
          panels.push(async () => {
            if (
              editor.sourceView.inSourceMode ||
              editor.getNode(node.cid) !== node ||
              node.get('text') !== source
            ) {
              resolve(undefined);
              return;
            }
            try {
              resolve(await Reflect.apply(start, this, args));
            } catch (error) {
              reject(error);
            }
          });
        });
      return Reflect.apply(start, this, args);
    };
    math.updateDiagram = function (cid) {
      probe.fallbacks.push(cid);
      probe.focus = document.activeElement;
      probe.history = { index: editor.undo.index, size: editor.undo.commandStack.length };
      inFallback = true;
      try {
        return Reflect.apply(update, this, [cid]);
      } finally {
        inFallback = false;
      }
    };
    runtime.__MARKLYRA_RENDER_TICKET__ = (preview, cm) => {
      const originalTicket = ticket(preview, cm);
      return inFallback
        ? {
            current() {
              const value = originalTicket.current();
              probe.checks.push(value);
              return value;
            },
          }
        : originalTicket;
    };
    runtime.MathJax.tex2svgPromise = function (...args) {
      const actual = Reflect.apply(renderer, this, args);
      if (!(inFallback ? probe.holdFallback : probe.holdInitial && String(args[0]) === 'y=2'))
        return actual;
      return new Promise((resolve, reject) =>
        probe.held.push(async () => {
          try {
            resolve(await actual);
          } catch (error) {
            reject(error);
          }
        }),
      );
    };
  }, hold);
  return frame;
}
const source = (formula: string) =>
  `\uFEFFAlpha \\(x+1\\)\r\n\r\n\`\`\`math\n${formula}\n\`\`\`\r\n\r\nTail  \n`;
const load = (page: Page, markdown: string) =>
  page.evaluate((text) => (window as unknown as Host).marklyraEditor.load(text), markdown);
const flush = (page: Page) =>
  page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
const probe = (frame: Frame) =>
  frame.evaluate(() => {
    const p = Reflect.get(window, 'initialMathProbe') as Probe;
    return {
      firstDone: p.firstDone,
      fallbacks: p.fallbacks,
      checks: p.checks,
      held: p.held.length,
    };
  });
async function release(frame: Frame) {
  await frame.evaluate(async () => {
    const p = Reflect.get(window, 'initialMathProbe') as Probe;
    p.holdInitial = false;
    p.holdFallback = false;
    for (const release of p.held.splice(0)) await release();
  });
}

for (const formula of ['x+1', 'y=2', 'x+1\ny=2'])
  test(`initial math fence completes when its real render finishes before panel creation: ${JSON.stringify(formula)}`, async ({
    page,
  }) => {
    const frame = await fixture(page, true);
    const raw = source(formula);
    await load(page, raw);
    await expect.poll(async () => (await probe(frame)).firstDone).toBe(true);
    await frame.evaluate(() => (Reflect.get(window, 'initialMathProbe') as Probe).releasePanels());
    await expect(frame.locator('#write mjx-container')).toHaveCount(2);
    expect((await probe(frame)).fallbacks).toEqual(['n2']);
    expect(
      await frame.evaluate(() => {
        const p = Reflect.get(window, 'initialMathProbe') as Probe;
        const editor = (window as unknown as LegacyGlobals).editor;
        return {
          focus: document.activeElement === p.focus,
          history:
            editor?.undo.index === p.history?.index &&
            editor?.undo.commandStack.length === p.history?.size,
        };
      }),
    ).toEqual({ focus: true, history: true });
    expect(await flush(page)).toBe(raw);
    expect(await page.evaluate(() => (window as unknown as Host).initialMathErrors)).toEqual([]);
  });

test('disabled legacy and fenced math do not opt into initial preview recovery', async ({
  page,
}) => {
  const frame = await fixture(page, false);
  const raw = source('x+1');
  await load(page, raw);
  await expect(frame.locator('#write mjx-container')).toHaveCount(0);
  expect((await probe(frame)).fallbacks).toEqual([]);
  expect(await flush(page)).toBe(raw);
});

for (const change of ['document', 'source', 'edit'] as const)
  test(`an old initial math completion cannot recover the preview after ${change} changes`, async ({
    page,
  }) => {
    const frame = await fixture(page, true, 'initial');
    const raw = source('y=2');
    await load(page, raw);
    await expect.poll(async () => (await probe(frame)).held).toBe(1);
    if (change === 'document') await load(page, 'Replacement\r\n');
    else if (change === 'source')
      await page.evaluate(() =>
        (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
      );
    else {
      await frame.locator('#write .md-fences-math').evaluate((block) => {
        const editor = (window as unknown as LegacyGlobals).editor;
        const id = block.getAttribute('cid');
        if (!editor || !id) throw Error('Missing current math fence');
        const cm = editor.fences.queue?.[id] as NonNullable<LegacyEditor['sourceView']['cm']>;
        editor.refocus(id);
        cm.focus();
        cm.setSelections([{ anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 3 } }]);
      });
      await page.keyboard.type('z=3');
    }
    const edits = (await probe(frame)).fallbacks.length;
    await release(frame);
    await expect.poll(async () => (await probe(frame)).firstDone).toBe(true);
    await frame.evaluate(() => (Reflect.get(window, 'initialMathProbe') as Probe).releasePanels());
    expect((await probe(frame)).fallbacks).toHaveLength(edits);
    expect(await flush(page)).toBe(
      change === 'document'
        ? 'Replacement\r\n'
        : change === 'edit'
          ? raw.replace('y=2', 'z=3')
          : raw,
    );
    expect(await page.evaluate(() => (window as unknown as Host).initialMathErrors)).toEqual([]);
  });

test('an IME cancellation keeps the exact initial preview pending until composition ends', async ({
  page,
}) => {
  const frame = await fixture(page, true, 'fallback');
  const raw = source('y=2');
  await load(page, raw);
  await expect.poll(async () => (await probe(frame)).held).toBe(1);
  await frame
    .locator('#write')
    .evaluate((area) =>
      area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })),
    );
  await release(frame);
  await expect.poll(async () => (await probe(frame)).checks).toEqual([false]);
  await frame
    .locator('#write')
    .evaluate((area) =>
      area.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })),
    );
  await expect(frame.locator('#write mjx-container')).toHaveCount(2);
  expect((await probe(frame)).fallbacks).toEqual(['n2', 'n2']);
  expect((await probe(frame)).checks).toEqual([false, true]);
  expect(await flush(page)).toBe(raw);
  expect(await page.evaluate(() => (window as unknown as Host).initialMathErrors)).toEqual([]);
});
