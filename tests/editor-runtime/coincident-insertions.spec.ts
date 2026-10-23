import { readFile, writeFile } from 'node:fs/promises';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import type { RuntimeChange, RuntimeState } from '../../packages/editor-runtime/src/protocol.js';

type Host = Window & {
  marklyraEditor: MarkLyraEditor;
  batch: {
    errors: string[];
    changes: RuntimeChange[];
    states: { canonical: string; tracking: RuntimeState['tracking'] }[];
  };
};
type Child = Window & {
  editor: {
    writingArea: HTMLElement;
    UserOp: { pasteHandler(editor: unknown, html: string, plain: boolean): unknown };
  };
  notificationGate?: { held: Map<number, () => void>; release(): void };
};
const scenarios = [
  { name: 'LF tail', source: '**Tail**\n', added: '\n', ending: '\n', proof: 'root' },
  {
    name: 'BOM and mixed EOL',
    source: '\uFEFFAlpha\r\n\r\nKeep\n\n**Tail**\n',
    added: '\n',
    ending: '\n',
    canonicalEnding: '\r\n',
    proof: 'either',
  },
  {
    name: 'CRLF tail',
    source: '**Tail**\r\n',
    added: '\r\n',
    ending: '\r\n',
    proof: 'root',
  },
  {
    name: 'existing empty cid',
    source: '**Tail**\n\n',
    added: '\n\n',
    ending: '\n',
    proof: 'coincident',
  },
] as const;
async function mount(page: Page, source: string) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as unknown as Host,
      old = host.marklyraEditor;
    await old.ready;
    const Constructor = old.constructor as typeof MarkLyraEditor,
      root = old.element.parentElement;
    if (!root) throw Error('Missing mount');
    old.destroy();
    host.batch = { errors: [], changes: [], states: [] };
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      onError: (error) => host.batch.errors.push(error.message),
    });
    window.addEventListener('message', (event) => {
      if (event.source !== host.marklyraEditor.element.contentWindow) return;
      const payload = event.data?.payload as
        | { state?: RuntimeState; tracking?: RuntimeState['tracking']; canonical?: string }
        | undefined;
      const tracking = payload?.state?.tracking ?? payload?.tracking;
      if (tracking?.changes.length) host.batch.changes.push(...structuredClone(tracking.changes));
      const canonical = payload?.state?.canonical ?? payload?.canonical;
      if (tracking && typeof canonical === 'string')
        host.batch.states.push({ canonical, tracking: structuredClone(tracking) });
    });
    await host.marklyraEditor.ready;
    await host.marklyraEditor.flush();
  }, source);
}
const flush = (page: Page) =>
  page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
const command = (page: Page, type: 'undo' | 'redo') =>
  page.evaluate((type) => (window as unknown as Host).marklyraEditor.execute({ type }), type);

async function batchEnterAndPaste(page: Page) {
  await page.locator('.marklyra-editor-frame').focus();
  const frame = page.frames().find((entry) => entry.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing frame');
  await frame.evaluate(() => {
    const host = window as unknown as Child,
      area = host.editor.writingArea,
      last = area.lastElementChild;
    if (!last) throw Error('Missing last block');
    area.focus();
    const walker = document.createTreeWalker(last, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode(),
      tail: Node | null = null;
    while (node) {
      tail = node;
      node = walker.nextNode();
    }
    const range = document.createRange();
    if (tail) {
      range.setStart(tail, tail.textContent?.length ?? 0);
      range.collapse(true);
    } else {
      range.selectNodeContents(last);
      range.collapse(false);
    }
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const schedule = window.setTimeout.bind(window),
      cancel = window.clearTimeout.bind(window);
    const held = new Map<number, () => void>();
    // Reproduce a real unsynchronized edit batch without depending on host CPU
    // speed. Only SDK change publication is held; native input and history run.
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (typeof handler === 'function' && handler.name === 'notifyChange') {
        const id = schedule(() => {}, 60_000);
        held.set(id, () => Reflect.apply(handler, window, args));
        return id;
      }
      return schedule(handler, delay, ...args);
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => {
      if (id !== undefined) held.delete(id);
      cancel(id);
    }) as typeof window.clearTimeout;
    host.notificationGate = {
      held,
      release() {
        window.setTimeout = schedule;
        window.clearTimeout = cancel;
        for (const [id, callback] of held) {
          cancel(id);
          schedule(callback, 0);
        }
        held.clear();
      },
    };
  });
  await page.keyboard.press('Enter');
  expect(
    await frame.evaluate(() => (window as unknown as Child).notificationGate?.held.size ?? 0),
  ).toBeGreaterThan(0);
  // The original native paste entry can execute in the same unpublished batch
  // as Enter. Root receipts can prove Enter before publication; the other
  // fixtures still require coincident serializer partition insertion checks.
  // Going through the SDK context menu would split that native unpublished batch.
  await frame.evaluate(() => {
    const editor = (window as unknown as Child).editor;
    editor.UserOp.pasteHandler(editor, '<strong>Bravo</strong>', false);
  });
  await expect.poll(() => frame.locator('#write').textContent()).toContain('Bravo');
  return frame;
}

for (const scenario of scenarios)
  test(`batched Enter and rich paste preserve saved bytes and native history: ${scenario.name}`, async ({
    page,
  }, info) => {
    await mount(page, scenario.source);
    const frame = await batchEnterAndPaste(page);
    const intermediate = scenario.source + scenario.added;
    const expected = intermediate + '**Bravo**' + scenario.ending;
    expect(await flush(page)).toBe(expected);
    const states = await page.evaluate(() => (window as unknown as Host).batch.states);
    await info.attach('actual-tracking-chain', {
      body: JSON.stringify(states, null, 2),
      contentType: 'application/json',
    });
    const proofs = await page.evaluate(() =>
      (window as unknown as Host).batch.changes.filter((change) => change.placementChecks?.length),
    );
    if (scenario.proof === 'root' || (scenario.proof === 'either' && proofs.length === 0)) {
      // Exact root receipts can precede publication, including the mixed-EOL
      // fixture. Missing coincident checks require both complete direct steps;
      // the existing-empty-cid fixture must still exercise the coincident path.
      expect(proofs).toEqual([]);
      const before = states.filter((state) => state.tracking.changes.length === 0).at(-1);
      const after = states.at(-1);
      if (!before || !after) throw Error('Missing native batch canonical states');
      const ending = 'canonicalEnding' in scenario ? scenario.canonicalEnding : scenario.ending;
      const initialCanonical = scenario.source
        .replace(/^\uFEFF/u, '')
        .replace(/\r\n|\r|\n/g, ending);
      const enteredCanonical = initialCanonical + ending;
      const pastedCanonical = enteredCanonical + '**Bravo**' + ending;
      expect(before.canonical).toBe(initialCanonical);
      const checkpoint = before.tracking.checkpoint;
      const point = initialCanonical.length - ending.length;
      expect(after.tracking.changes).toEqual([
        {
          baseCheckpoint: checkpoint,
          checkpoint: checkpoint + 1,
          baseProjectionEpoch: before.tracking.projectionEpoch,
          patches: [{ from: point, to: point, insert: ending }],
        },
        {
          baseCheckpoint: checkpoint + 1,
          checkpoint: checkpoint + 2,
          baseProjectionEpoch: before.tracking.projectionEpoch,
          patches: [
            {
              from: enteredCanonical.length,
              to: enteredCanonical.length,
              insert: `**Bravo**${ending}`,
            },
          ],
          placementRanges: [{ from: enteredCanonical.length, to: enteredCanonical.length }],
        },
      ]);
      let canonical = before.canonical;
      const chain = after.tracking.changes.map((change) => {
        for (const patch of [...change.patches].reverse())
          canonical = canonical.slice(0, patch.from) + patch.insert + canonical.slice(patch.to);
        return canonical;
      });
      expect(chain).toEqual([enteredCanonical, pastedCanonical]);
      expect(after.canonical).toBe(canonical);
      expect(after.tracking.checkpoint).toBe(checkpoint + 2);
      expect(after.tracking.projectionEpoch).toBe(before.tracking.projectionEpoch);
    } else expect(proofs.length).toBeGreaterThan(0);
    for (const proof of proofs) {
      const checks = proof.placementChecks ?? [];
      const point = checks[0]?.patch.from;
      expect(checks.every((check) => check.patch.from === point && check.patch.to === point)).toBe(
        true,
      );
      expect(proof.patches.find((patch) => patch.from === point)?.insert).toBe(
        checks.map((check) => check.patch.insert).join(''),
      );
      for (const check of checks) expect(proof.placementRanges).toContainEqual(check.range);
    }
    await frame.evaluate(() => (window as unknown as Child).notificationGate?.release());
    const saved = await page.evaluate(async () => {
      const editor = (window as unknown as Host).marklyraEditor;
      const source = await editor.flush();
      return { source, marked: await editor.markSaved(source) };
    });
    expect(saved).toEqual({ source: expected, marked: true });
    const file = info.outputPath('saved.md');
    await writeFile(file, saved.source, 'utf8');
    expect(await readFile(file)).toEqual(Buffer.from(expected, 'utf8'));
    await command(page, 'undo');
    expect(await flush(page)).toBe(intermediate);
    await command(page, 'undo');
    expect(await flush(page)).toBe(scenario.source);
    await command(page, 'redo');
    expect(await flush(page)).toBe(intermediate);
    await command(page, 'redo');
    expect(await flush(page)).toBe(expected);
    // A later native batch must still work after traversing the first batch's
    // two real history entries. This also covers a growing tail of rich pastes.
    const again = await batchEnterAndPaste(page);
    const repeatedIntermediate = expected + scenario.ending;
    const repeated = repeatedIntermediate + '**Bravo**' + scenario.ending;
    expect(await flush(page)).toBe(repeated);
    await again.evaluate(() => (window as unknown as Child).notificationGate?.release());
    await command(page, 'undo');
    expect(await flush(page)).toBe(repeatedIntermediate);
    await command(page, 'undo');
    expect(await flush(page)).toBe(expected);
    await command(page, 'redo');
    expect(await flush(page)).toBe(repeatedIntermediate);
    await command(page, 'redo');
    expect(await flush(page)).toBe(repeated);
    const repeatFile = info.outputPath('saved-after-repeat.md');
    await writeFile(repeatFile, await flush(page), 'utf8');
    expect(await readFile(repeatFile)).toEqual(Buffer.from(repeated, 'utf8'));
    expect(await page.evaluate(() => (window as unknown as Host).batch.errors)).toEqual([]);
    await info.attach('actual-placement-proof', {
      body: JSON.stringify(proofs, null, 2),
      contentType: 'application/json',
    });
  });
