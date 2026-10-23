import { expect, type Page, test } from '@playwright/test';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import {
  advancedErrors,
  advancedFrame,
  advancedHistory,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';
import { settleMarkerClick, settleMarkerClickTasks } from './marker-selection.helpers.js';

type Entry = { cid: string; inlineOnly: boolean };
type Task = Entry & { token: number };
type Batch = { id: number; tasks: Task[]; completed: boolean; remaining?: Task[] };
type MathCall = { id: number; batchId: number | null; completed: boolean };
type Render = {
  batchId: number;
  mathId: number;
  held: boolean;
  actualSettled: boolean;
  returnedSettled: boolean;
  actualTag?: string;
};
type State = {
  phase: 'math' | 'tail';
  batches: Batch[];
  maths: MathCall[];
  renders: Render[];
  additions: { phase: string; cid: string; tasks: Task[] }[];
  inputs: { phase: string; trusted: boolean; data: string | null }[];
  releasedAfter: number;
};
type Snapshot = State & { live: Task[]; tailHTML: string | undefined; strong: string | null };
type Brush = {
  queue: Entry[];
  addToQueue(cid: string, inlineOnly?: boolean): unknown;
  brushQueue(): Promise<unknown>;
};
type Runtime = Window & {
  editor: LegacyEditor & {
    brush: Brush;
    mathInline: { brush(...args: unknown[]): Promise<unknown> };
  };
  MathJax: { tex2svgPromise(...args: unknown[]): Promise<Element> };
  brushFixture: { state: State; release(): void; snapshot(): Snapshot };
};
const source = '\ufeffWarm $w^2$.\r\n\r\nAlpha\r\n\r\nTail\n';
const mathInput = ' $\\text{QueueAwaitProbe}$ end';
const tailInput = ' **fresh**';
const afterMath = source.replace('Alpha\r\n', `Alpha${mathInput}\r\n`);
const afterTail = afterMath.replace('Tail\n', `Tail${tailInput}\n`);

async function install(page: Page, hold: boolean) {
  await advancedFrame(page)
    .locator('#write')
    .evaluate((_, hold) => {
      const runtime = window as unknown as Runtime;
      const { editor } = runtime;
      const brush = editor.brush;
      const state: State = {
        phase: 'math',
        batches: [],
        maths: [],
        renders: [],
        additions: [],
        inputs: [],
        releasedAfter: 0,
      };
      const identities = new WeakMap<Entry, number>();
      let nextTask = 0;
      const tasks = (): Task[] =>
        brush.queue.map((entry) => {
          if (!identities.has(entry)) identities.set(entry, ++nextTask);
          return { ...entry, token: identities.get(entry) as number };
        });
      let activeBatch: number | null = null;
      let activeMath: number | null = null;
      const originalAdd = brush.addToQueue;
      brush.addToQueue = function (cid, inlineOnly) {
        const result = originalAdd.call(this, cid, inlineOnly);
        state.additions.push({ phase: state.phase, cid, tasks: tasks() });
        return result;
      };
      const originalQueue = brush.brushQueue;
      brush.brushQueue = function () {
        const batch: Batch = { id: state.batches.length + 1, tasks: tasks(), completed: false };
        state.batches.push(batch);
        const previous = activeBatch;
        activeBatch = batch.id;
        let result: Promise<unknown>;
        try {
          result = originalQueue.call(this);
        } finally {
          activeBatch = previous;
        }
        // Observe the native promise without changing its identity or scheduling.
        void result.then(
          () => {
            batch.completed = true;
            batch.remaining = tasks();
          },
          () => {},
        );
        return result;
      };
      const math = editor.mathInline;
      const originalMath = math.brush;
      math.brush = function (...args) {
        const call: MathCall = {
          id: state.maths.length + 1,
          batchId: activeBatch,
          completed: false,
        };
        state.maths.push(call);
        const previous = activeMath;
        activeMath = call.id;
        let result: Promise<unknown>;
        try {
          result = Reflect.apply(originalMath, this, args);
        } finally {
          activeMath = previous;
        }
        void result.then(
          () => {
            call.completed = true;
          },
          () => {},
        );
        return result;
      };
      const base = runtime.MathJax;
      const facade = Object.create(base) as Runtime['MathJax'];
      const releases: (() => void)[] = [];
      Object.defineProperty(facade, 'tex2svgPromise', {
        value: (...args: unknown[]) => {
          const actual = Reflect.apply(base.tex2svgPromise, base, args);
          // A popup or unrelated render does not establish the brush await window.
          if (
            !String(args[0]).includes('QueueAwaitProbe') ||
            activeBatch === null ||
            activeMath === null
          )
            return actual;
          const render: Render = {
            batchId: activeBatch,
            mathId: activeMath,
            held: hold,
            actualSettled: false,
            returnedSettled: false,
          };
          state.renders.push(render);
          void actual.then(
            (value) => {
              render.actualSettled = true;
              render.actualTag = value.tagName;
            },
            () => {},
          );
          // Real MathJax still runs. Only its actual result is held, never replaced.
          const held = hold ? new Promise<void>((resolve) => releases.push(resolve)) : null;
          const returned = held
            ? actual.then(async (value) => {
                await held;
                return value;
              })
            : actual;
          void returned.then(
            () => {
              render.returnedSettled = true;
            },
            () => {},
          );
          return returned;
        },
      });
      runtime.MathJax = facade;
      editor.writingArea.addEventListener(
        'input',
        (event) => {
          state.inputs.push({
            phase: state.phase,
            trusted: event.isTrusted,
            data: (event as InputEvent).data,
          });
        },
        true,
      );
      runtime.brushFixture = {
        state,
        release() {
          state.releasedAfter = state.batches.length;
          for (const release of releases.splice(0)) release();
        },
        snapshot() {
          const tail = editor.writingArea.lastElementChild;
          return {
            ...state,
            live: tasks(),
            tailHTML: tail?.innerHTML,
            strong: tail?.querySelector('strong')?.textContent ?? null,
          };
        },
      };
    }, hold);
}

async function activateEnd(page: Page, word: string) {
  const frame = advancedFrame(page);
  await frame
    .locator('#write > p > [md-inline="plain"]')
    .filter({ hasText: word })
    .last()
    .dblclick();
  await settleMarkerClickTasks(page);
  expect(await frame.locator('#write').evaluate(() => getSelection()?.toString())).toBe(word);
  await page.keyboard.press('ArrowRight');
  const caret = await frame.locator('#write').evaluate(() => {
    const selection = getSelection();
    if (!selection?.isCollapsed || !selection.rangeCount)
      throw Error('Missing collapsed native caret');
    const range = selection.getRangeAt(0);
    const element =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    const block = element?.closest('#write > p');
    if (!block) throw Error('Caret is outside the intended paragraph');
    const prefix = range.cloneRange();
    prefix.selectNodeContents(block);
    prefix.setEnd(range.startContainer, range.startOffset);
    return { text: block.textContent, prefix: prefix.toString(), cid: block.getAttribute('cid') };
  });
  expect(caret.text).toBe(word);
  expect(caret.prefix).toBe(word);
  expect(caret.cid).toBeTruthy();
  return caret.cid as string;
}

for (const hold of [false, true])
  test(`${hold ? 'held' : 'unheld'} real inline-math rendering preserves subsequent native brush work`, async ({
    page,
  }, info) => {
    await mountAdvanced(page, source);
    const frame = advancedFrame(page);
    await expect(frame.locator('.md-inline-math svg')).toHaveCount(1);
    expect(await advancedSource(page)).toBe(source);
    await settleMarkerClick(page);
    await install(page, hold);
    const snapshot = () =>
      frame
        .locator('#write')
        .evaluate(() => (window as unknown as Runtime).brushFixture.snapshot());
    try {
      await activateEnd(page, 'Alpha');
      await page.keyboard.insertText(mathInput);
      await expect
        .poll(
          async () => {
            const state = await snapshot();
            return state.renders.some(
              (render) =>
                render.actualTag === 'MJX-CONTAINER' &&
                render.actualSettled &&
                (hold
                  ? !render.returnedSettled &&
                    !state.batches.find((batch) => batch.id === render.batchId)?.completed &&
                    !state.maths.find((math) => math.id === render.mathId)?.completed
                  : render.returnedSettled &&
                    state.batches.find((batch) => batch.id === render.batchId)?.completed),
            );
          },
          { message: 'The real native queue must reach the actual inline MathJax await' },
        )
        .toBe(true);
      const tailCid = await activateEnd(page, 'Tail');
      await frame.locator('#write').evaluate(() => {
        (window as unknown as Runtime).brushFixture.state.phase = 'tail';
      });
      await page.keyboard.insertText(tailInput);
      const beforeRelease = await snapshot();
      const render = beforeRelease.renders[0];
      expect(render).toBeDefined();
      if (!render) throw Error('Missing proven native MathJax caller');
      if (hold) {
        expect(render.returnedSettled).toBe(false);
        expect(beforeRelease.batches.find((batch) => batch.id === render.batchId)?.completed).toBe(
          false,
        );
      }
      const tokens = [
        ...new Set(
          beforeRelease.additions
            .filter((entry) => entry.phase === 'tail' && entry.cid === tailCid)
            .flatMap((entry) =>
              entry.tasks.filter((task) => task.cid === tailCid).map((task) => task.token),
            ),
        ),
      ];
      expect(tokens.length).toBeGreaterThan(0);
      expect(beforeRelease.inputs.filter((input) => input.phase === 'tail')).toContainEqual({
        phase: 'tail',
        trusted: true,
        data: tailInput,
      });
      await frame
        .locator('#write')
        .evaluate(() => (window as unknown as Runtime).brushFixture.release());
      // Observe native completion and two scheduled follow-up batches. Never call
      // addToQueue/brushQueue or sleep to manufacture a queue-consumption result.
      await expect
        .poll(async () => {
          const state = await snapshot();
          return (
            state.batches.find((batch) => batch.id === render.batchId)?.completed &&
            state.batches.filter((batch) => batch.id > state.releasedAfter && batch.completed)
              .length >= 2
          );
        })
        .toBe(true);
      const completed = await snapshot();
      const disposition = tokens.map((token) => ({
        token,
        retainedOrConsumed:
          completed.live.some((task) => task.token === token) ||
          completed.batches.some(
            (batch) => batch.completed && batch.tasks.some((task) => task.token === token),
          ),
      }));
      await info.attach('native-brush-work', {
        body: JSON.stringify({ beforeRelease, completed, disposition }, null, 2),
        contentType: 'application/json',
      });
      expect
        .soft(
          disposition.every((task) => task.retainedOrConsumed),
          'No later input task may disappear with an earlier batch',
        )
        .toBe(true);
      expect
        .soft(completed.strong, 'The later Markdown must become real strong DOM before flush')
        .toBe('fresh');
      // A lost brush task is not itself proof of lost Markdown. Keep independent,
      // exact BOM/EOL and history checks even when the live-render assertions fail.
      expect(await advancedSource(page)).toBe(afterTail);
      await advancedHistory(page, 'undo');
      expect(await advancedSource(page)).toBe(afterMath);
      await advancedHistory(page, 'redo');
      expect(await advancedSource(page)).toBe(afterTail);
      expect(await advancedErrors(page)).toEqual([]);
    } finally {
      await frame
        .locator('#write')
        .evaluate(() => (window as unknown as Runtime).brushFixture.release());
    }
  });
