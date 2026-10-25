import { fileURLToPath } from 'node:url';
import type {
  ClipboardContent,
  ContextAction,
  ContextMenuRequest,
  MarkLyraEditor,
} from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import { offeredContextActions } from '../../packages/editor-runtime/src/context-menu/contracts.js';
import type { LegacyEditor } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type Range = { anchor: { line: number; ch: number }; head: { line: number; ch: number } };
type CM = NonNullable<LegacyEditor['sourceView']['cm']> & {
  getHistory(): unknown;
  getInputField(): HTMLTextAreaElement;
  charCoords(
    position: { line: number; ch: number },
    mode: string,
  ): { left: number; top: number; bottom: number };
};
type Child = Window & {
  editor: LegacyEditor;
  File: { option: { lineWiseCopyCut: boolean } };
  lineCM?: CM;
  lineIdentity?: { cm: CM; wrapper: HTMLElement; doc: CM['doc'] };
};
type Host = Window & {
  marklyraEditor: MarkLyraEditor;
  linewise: {
    request?: ContextMenuRequest;
    choose?: (action: ContextAction | null) => void;
    writes: ClipboardContent[];
    errors: string[];
    mode: 'success' | 'reject' | 'hold';
    release?: () => void;
    load?: Promise<void>;
  };
};
const runtimeUrl = process.env.LINEWISE_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html';
const sdkModule =
  process.env.LINEWISE_SDK_URL ??
  `/@fs/${fileURLToPath(new URL('../../packages/editor-runtime/dist/index.js', import.meta.url)).replaceAll('\\', '/')}`;
const hostPath = process.env.LINEWISE_HOST_PATH ?? '/';
// The retained pre-preference SDK negative control configures its old runtime
// explicitly. Normal runs always exercise the real public preference API.
const legacyControl = process.env.LINEWISE_LEGACY_CONTROL === '1';
const frame = (page: Page) => page.frameLocator('.marklyra-editor-frame');
const raw = '\uFEFFAlpha\r\nBravo\nCharlie';
const fenceRaw = '\uFEFF```text\r\nAlpha\r\nBravo\nCharlie\r\n```\r\n\r\nTail';

async function mount(page: Page, source: string, option = true, preferences = true) {
  // The same test also runs against an owned blank harness. On the regular
  // playground suppress its unrelated demo instance before mounting this SDK.
  await page.route('**/src/runtime-example*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'export {};' }),
  );
  await page.goto(hostPath);
  await page.evaluate(
    async ({ source, option, preferences, runtimeUrl, sdkModule }) => {
      const api = (await import(sdkModule)) as { MarkLyraEditor: typeof MarkLyraEditor };
      const host = window as unknown as Host;
      const root = document.querySelector<HTMLElement>('#mount,#app');
      if (!root) throw Error('Missing test mount');
      root.replaceChildren();
      root.style.height = '850px';
      host.linewise = { writes: [], errors: [], mode: 'success' };
      host.marklyraEditor = new api.MarkLyraEditor(root, {
        runtimeUrl,
        markdown: source,
        ...(preferences ? { preferences: { lineWiseCopyCut: option } } : {}),
        onError: (error) => host.linewise.errors.push(error.message),
        host: {
          contextMenu: {
            show(request, choose) {
              host.linewise.request = request;
              host.linewise.choose = choose;
            },
          },
          clipboard: {
            async read() {
              return { text: '' };
            },
            async write(content) {
              host.linewise.writes.push(structuredClone(content));
              if (host.linewise.mode === 'reject') throw Error('linewise clipboard write rejected');
              if (host.linewise.mode === 'hold')
                await new Promise<void>((resolve) => {
                  host.linewise.release = resolve;
                });
            },
          },
        },
      });
      await host.marklyraEditor.ready;
    },
    { source, option, preferences: preferences && !legacyControl, runtimeUrl, sdkModule },
  );
}
async function enter(page: Page, mode: 'source' | 'fence') {
  if (mode === 'source')
    await page.evaluate(() =>
      (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }),
    );
  else await expect(frame(page).locator('#write [mdtype="fences"] .CodeMirror')).toHaveCount(1);
  await frame(page)
    .locator('body')
    .evaluate(
      (_body, { mode, legacyControl }) => {
        const child = window as unknown as Child;
        const owner = document.querySelector<HTMLElement>(
          mode === 'source'
            ? '#marklyra-source .CodeMirror'
            : '#write [mdtype="fences"] .CodeMirror',
        );
        const cm =
          mode === 'source'
            ? (child.editor.sourceView.cm as CM)
            : owner && (Reflect.get(owner, 'CodeMirror') as CM);
        if (!owner || !cm) throw Error('Missing live code editor');
        if (legacyControl) {
          cm.setOption('lineWiseCopyCut', true);
          child.File.option.lineWiseCopyCut = true;
        }
        cm.focus();
        child.lineCM = cm;
        child.lineIdentity = { cm, wrapper: cm.getWrapperElement(), doc: cm.doc };
      },
      { mode, legacyControl },
    );
}
async function select(page: Page, ranges: Range[], primary = 0) {
  return frame(page)
    .locator('body')
    .evaluate(
      (_body, { ranges, primary }) => {
        const cm = (window as unknown as Child).lineCM;
        if (!cm) throw Error('Missing CM');
        // Source already ships this false. Preserve multiple empty fence carets in
        // the explicit multi-caret vector; the ordinary fence case keeps its default.
        if (ranges.length > 1) cm.setOption('resetSelectionOnContextMenu', false);
        cm.focus();
        cm.setSelections(ranges, primary);
        const caret = ranges[primary]?.head;
        if (!caret) throw Error('Missing primary caret');
        const rect = cm.charCoords(caret, 'window');
        return { x: rect.left + 1, y: (rect.top + rect.bottom) / 2 };
      },
      { ranges, primary },
    );
}
async function open(page: Page, ranges: Range[], primary = 0) {
  await page.evaluate(() => {
    delete (window as unknown as Host).linewise.request;
  });
  const point = await select(page, ranges, primary);
  const box = await page.locator('.marklyra-editor-frame').boundingBox();
  if (!box) throw Error('Missing runtime bounds');
  await page.mouse.click(box.x + point.x, box.y + point.y, { button: 'right' });
  await page.waitForFunction(() => Boolean((window as unknown as Host).linewise.request));
}
const caret = (line: number, ch = 1): Range => ({ anchor: { line, ch }, head: { line, ch } });
const flush = (page: Page) =>
  page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
const choose = (page: Page, action: ContextAction) =>
  page.evaluate((action) => (window as unknown as Host).linewise.choose?.(action), action);
async function completed(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as Host).linewise.writes.length +
          (window as unknown as Host).linewise.errors.length,
      ),
    )
    .toBeGreaterThan(0);
  // Flush serializes the completed menu command; it does not grant new source edits.
  await flush(page);
}
async function snapshot(page: Page) {
  return frame(page)
    .locator('body')
    .evaluate(() => {
      const child = window as unknown as Child,
        cm = child.lineCM,
        identity = child.lineIdentity;
      if (!cm || !identity) throw Error('Missing CM identity');
      return {
        value: cm.getValue(),
        ranges: cm.listSelections(),
        anchor: cm.getCursor('anchor'),
        head: cm.getCursor('head'),
        history: cm.getHistory(),
        wrapper: cm.getWrapperElement() === identity.wrapper,
        doc: cm.doc === identity.doc,
        connected: identity.wrapper.isConnected,
      };
    });
}
async function enabled(page: Page, action: ContextAction) {
  const request = await page.evaluate(() => (window as unknown as Host).linewise.request);
  if (!request) throw Error('Missing menu request');
  return offeredContextActions(request.items).has(action);
}
async function holdCut(page: Page) {
  await page.evaluate(() => {
    (window as unknown as Host).linewise.mode = 'hold';
  });
  await choose(page, 'edit.cut');
  await page.waitForFunction(
    () => typeof (window as unknown as Host).linewise.release === 'function',
  );
}
const release = (page: Page) =>
  page.evaluate(() => (window as unknown as Host).linewise.release?.());

for (const mode of ['source', 'fence'] as const) {
  test(`original CM ${mode} copy selects repeated whole lines while selectLineWrap selects only primary contents`, async ({
    page,
  }, info) => {
    await mount(page, mode === 'source' ? raw : fenceRaw, false, false);
    await enter(page, mode);
    await select(page, [caret(0), caret(0, 3), caret(2)], 2);
    const observed = await frame(page)
      .locator('body')
      .evaluate(() => {
        const child = window as unknown as Child,
          cm = child.lineCM;
        if (!cm) throw Error('Missing CM');
        cm.setOption('lineWiseCopyCut', true);
        const original = cm.listSelections();
        child.editor.selection.selectLineWrap();
        const selectedByLineWrap = { text: cm.getSelection(), ranges: cm.listSelections() };
        cm.setSelections(original, 2);
        const field = cm.getInputField();
        if (field.tagName !== 'TEXTAREA') throw Error('Expected original textarea input path');
        field.dispatchEvent(
          new ClipboardEvent('copy', {
            bubbles: true,
            cancelable: true,
            clipboardData: new DataTransfer(),
          }),
        );
        return {
          inputStyle: cm.getOption('inputStyle'),
          original,
          selectedByLineWrap,
          clipboardText: field.value.slice(field.selectionStart, field.selectionEnd),
          ranges: cm.listSelections(),
          value: cm.getValue(),
        };
      });
    await info.attach('original-linewise-copy.json', {
      body: JSON.stringify(observed, null, 2),
      contentType: 'application/json',
    });
    expect(observed.selectedByLineWrap.text).toBe('Charlie');
    expect(observed.selectedByLineWrap.ranges).toHaveLength(1);
    expect(observed.clipboardText).toBe('Alpha\n\nAlpha\n\nCharlie');
    expect(observed.ranges).toEqual(observed.original);
    expect(await flush(page)).toBe(mode === 'source' ? raw : fenceRaw);
  });
  test(`original CM ${mode} textarea multi-caret cut copies every line but deletes only its first range`, async ({
    page,
  }, info) => {
    await mount(page, mode === 'source' ? raw : fenceRaw, false, false);
    await enter(page, mode);
    await select(page, [caret(0), caret(2)], 1);
    const observed = await frame(page)
      .locator('body')
      .evaluate((_body, mode) => {
        const child = window as unknown as Child,
          cm = child.lineCM;
        if (!cm) throw Error('Missing CM');
        cm.setOption('lineWiseCopyCut', true);
        const field = cm.getInputField(),
          data = new DataTransfer();
        const before = {
          value: cm.getValue(),
          ranges: cm.listSelections(),
          head: cm.getCursor('head'),
        };
        if (field.tagName !== 'TEXTAREA') throw Error('Expected original textarea path');
        field.dispatchEvent(
          new ClipboardEvent('cut', { bubbles: true, cancelable: true, clipboardData: data }),
        );
        const after = {
          value: cm.getValue(),
          ranges: cm.listSelections(),
          head: cm.getCursor('head'),
        };
        if (mode === 'source') Reflect.apply(Reflect.get(cm, 'undo') as () => void, cm, []);
        else child.editor.undo.undo();
        const undo = {
          value: cm.getValue(),
          ranges: cm.listSelections(),
          head: cm.getCursor('head'),
        };
        if (mode === 'source') Reflect.apply(Reflect.get(cm, 'redo') as () => void, cm, []);
        else child.editor.undo.redo();
        const redo = {
          value: cm.getValue(),
          ranges: cm.listSelections(),
          head: cm.getCursor('head'),
        };
        return {
          text: data.getData('Text'),
          value: after.value,
          ranges: after.ranges,
          before,
          undo,
          redo,
        };
      }, mode);
    await info.attach('original-linewise-cut.json', {
      body: JSON.stringify(observed, null, 2),
      contentType: 'application/json',
    });
    expect(observed.text).toBe('Alpha\r\n\nCharlie');
    expect(observed.value).toBe('Bravo\r\nCharlie');
    expect(observed.undo.value).toBe(observed.before.value);
    expect(observed.undo.ranges).toEqual(
      mode === 'source'
        ? observed.before.ranges
        : [{ anchor: observed.before.head, head: observed.before.head }],
    );
    expect(observed.redo.value).toBe('Bravo\r\nCharlie');
    expect(observed.redo.ranges).toHaveLength(mode === 'source' ? 2 : 1);
    expect(observed.redo.head).toMatchObject({ line: 1, ch: 1 });
  });
  for (const action of ['copy', 'cut'] as const)
    test(`original CM ${mode} ${action} empty EOF records DOM/DataTransfer effects without assuming OS clipboard writes`, async ({
      page,
    }, info) => {
      await mount(page, mode === 'source' ? 'Alpha\n' : '```text\nAlpha\n\n```', false, false);
      await enter(page, mode);
      await select(page, [caret(1, 0)]);
      const observed = await frame(page)
        .locator('body')
        .evaluate((_body, action) => {
          const child = window as unknown as Child,
            cm = child.lineCM;
          if (!cm) throw Error('Missing CM');
          cm.setOption('lineWiseCopyCut', true);
          const field = cm.getInputField(),
            data = new DataTransfer(),
            writes: { format: string; text: string }[] = [];
          const set = data.setData.bind(data);
          data.setData = (format, text) => {
            writes.push({ format, text });
            set(format, text);
          };
          const before = {
            value: cm.getValue(),
            history: cm.getHistory(),
            undo: child.editor.undo.index,
          };
          const event = new ClipboardEvent(action, {
            bubbles: true,
            cancelable: true,
            clipboardData: data,
          });
          field.dispatchEvent(event);
          return {
            before,
            after: {
              value: cm.getValue(),
              history: cm.getHistory(),
              undo: child.editor.undo.index,
            },
            writes,
            prevented: event.defaultPrevented,
            fieldValue: field.value,
            start: field.selectionStart,
            end: field.selectionEnd,
            dataText: data.getData('Text'),
          };
        }, action);
      await info.attach('original-empty-eof-effects.json', {
        body: JSON.stringify(observed, null, 2),
        contentType: 'application/json',
      });
      expect(observed.after.value).toBe(observed.before.value);
      expect(observed.dataText).toBe('');
      expect(observed.writes).toEqual(action === 'copy' ? [] : [{ format: 'Text', text: '' }]);
      expect(observed.prevented).toBe(action === 'cut');
    });
}

for (const mode of ['source', 'fence'] as const)
  for (const action of ['edit.copy', 'edit.cut'] as const) {
    test(`${mode} ${action} keeps an entire logical line and lossless source with one Undo/Redo`, async ({
      page,
    }) => {
      const source = mode === 'source' ? raw : fenceRaw;
      await mount(page, source);
      await enter(page, mode);
      await open(page, [caret(1, 2)]);
      const before = await snapshot(page);
      await choose(page, action);
      await completed(page);
      expect(await page.evaluate(() => (window as unknown as Host).linewise.errors)).toEqual([]);
      expect(await page.evaluate(() => (window as unknown as Host).linewise.writes[0]?.text)).toBe(
        action === 'edit.copy' ? 'Bravo\n' : 'Bravo\r\n',
      );
      if (action === 'edit.copy') {
        expect(await flush(page)).toBe(source);
        expect(await snapshot(page)).toEqual(before);
      } else {
        const after =
          mode === 'source'
            ? '\uFEFFAlpha\r\nCharlie'
            : '\uFEFF```text\r\nAlpha\r\nCharlie\r\n```\r\n\r\nTail';
        expect(await flush(page)).toBe(after);
        await page.evaluate(() =>
          (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }),
        );
        expect(await flush(page)).toBe(source);
        expect((await snapshot(page)).ranges).toEqual(before.ranges);
        await page.evaluate(() =>
          (window as unknown as Host).marklyraEditor.execute({ type: 'redo' }),
        );
        expect(await flush(page)).toBe(after);
      }
    });
  }

for (const mode of ['source', 'fence'] as const)
  for (const action of ['edit.copy', 'edit.cut'] as const) {
    test(`${mode} ${action} preserves duplicate caret clipboard text and first-sorted-range semantics`, async ({
      page,
    }) => {
      const source = mode === 'source' ? raw : fenceRaw;
      await mount(page, source);
      await enter(page, mode);
      await open(page, [caret(0), caret(0, 3), caret(2)], 2);
      const before = await snapshot(page);
      expect(before.ranges).toEqual([caret(0), caret(0, 3), caret(2)]);
      await choose(page, action);
      await completed(page);
      expect(await page.evaluate(() => (window as unknown as Host).linewise.errors)).toEqual([]);
      expect(await page.evaluate(() => (window as unknown as Host).linewise.writes[0]?.text)).toBe(
        action === 'edit.copy' ? 'Alpha\n\nAlpha\n\nCharlie' : 'Alpha\r\n\nAlpha\r\n\nCharlie',
      );
      if (action === 'edit.copy') {
        expect(await flush(page)).toBe(source);
        expect(await snapshot(page)).toEqual(before);
        return;
      }
      const after =
        mode === 'source'
          ? '\uFEFFBravo\nCharlie'
          : '\uFEFF```text\r\nBravo\nCharlie\r\n```\r\n\r\nTail';
      expect(await flush(page)).toBe(after);
      await page.evaluate(() =>
        (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }),
      );
      expect(await flush(page)).toBe(source);
      expect((await snapshot(page)).ranges).toEqual(
        mode === 'source' ? before.ranges : [{ anchor: before.head, head: before.head }],
      );
      expect((await snapshot(page)).head).toMatchObject({
        line: before.head.line,
        ch: before.head.ch,
      });
      await page.evaluate(() =>
        (window as unknown as Host).marklyraEditor.execute({ type: 'redo' }),
      );
      expect(await flush(page)).toBe(after);
      await page.keyboard.type('X');
      expect(await flush(page)).toBe(
        mode === 'source'
          ? '\uFEFFXBravo\nCXharlie'
          : '\uFEFF```text\r\nBravo\nCXharlie\r\n```\r\n\r\nTail',
      );
    });
  }
for (const mode of ['source', 'fence'] as const)
  for (const vector of [
    {
      name: 'last line without terminator',
      raw: '\uFEFFAlpha\r\nBravo',
      line: 1,
      text: 'Bravo',
      after: '\uFEFFAlpha\r\n',
    },
    {
      name: 'interior blank line',
      raw: '\uFEFFAlpha\r\n\r\nBravo',
      line: 1,
      text: '\r\n',
      after: '\uFEFFAlpha\r\nBravo',
    },
    {
      name: 'empty final line',
      raw: '\uFEFFAlpha\r\n',
      line: 1,
      text: '',
      after: '\uFEFFAlpha\r\n',
    },
  ])
    test(`${mode} cut ${vector.name} retains untouched bytes and a no-op has no history change`, async ({
      page,
    }) => {
      const document = (text: string) =>
        mode === 'source' ? text : ['\uFEFF```text', text.slice(1), '```', '', 'Tail'].join('\r\n');
      await mount(page, document(vector.raw));
      await enter(page, mode);
      await open(page, [caret(vector.line, 0)]);
      const before = await snapshot(page);
      await choose(page, 'edit.cut');
      await completed(page);
      expect(await page.evaluate(() => (window as unknown as Host).linewise.errors)).toEqual([]);
      expect(await page.evaluate(() => (window as unknown as Host).linewise.writes[0]?.text)).toBe(
        vector.text,
      );
      expect(await flush(page)).toBe(document(vector.after));
      if (vector.raw === vector.after)
        expect((await snapshot(page)).history).toEqual(before.history);
      else {
        await page.evaluate(() =>
          (window as unknown as Host).marklyraEditor.execute({ type: 'undo' }),
        );
        expect(await flush(page)).toBe(document(vector.raw));
        expect((await snapshot(page)).ranges).toEqual(before.ranges);
        await page.evaluate(() =>
          (window as unknown as Host).marklyraEditor.execute({ type: 'redo' }),
        );
        expect(await flush(page)).toBe(document(vector.after));
      }
    });
for (const mode of ['source', 'fence'] as const) {
  test(`${mode} failed clipboard write does not delete a line or change its selection/history`, async ({
    page,
  }) => {
    const source = mode === 'source' ? raw : fenceRaw;
    await mount(page, source);
    await enter(page, mode);
    await open(page, [caret(1, 2)]);
    const before = await snapshot(page);
    await page.evaluate(() => {
      (window as unknown as Host).linewise.mode = 'reject';
    });
    await choose(page, 'edit.cut');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Host).linewise.errors.length))
      .toBe(1);
    expect(await flush(page)).toBe(source);
    expect(await snapshot(page)).toEqual(before);
  });
  test(`${mode} input arriving during clipboard write is preserved and cancels the old line deletion`, async ({
    page,
  }) => {
    const source = mode === 'source' ? raw : fenceRaw;
    await mount(page, source);
    await enter(page, mode);
    await open(page, [caret(1, 2)]);
    await holdCut(page);
    await frame(page)
      .locator('body')
      .evaluate(() => {
        (window as unknown as Child).lineCM?.focus();
      });
    await page.keyboard.type('X');
    await release(page);
    expect(await flush(page)).toBe(source.replace('Bravo', 'BrXavo'));
    expect((await snapshot(page)).head).toMatchObject({ line: 1, ch: 3 });
  });
  test(`${mode} instance policy remains true after the global linewise preference changes to false`, async ({
    page,
  }) => {
    const source = mode === 'source' ? raw : fenceRaw;
    await mount(page, source);
    await enter(page, mode);
    await page.evaluate(() =>
      (window as unknown as Host).marklyraEditor.setPreferences({ lineWiseCopyCut: false }),
    );
    expect(
      await frame(page)
        .locator('body')
        .evaluate(() => {
          const child = window as unknown as Child;
          return {
            global: child.File.option.lineWiseCopyCut,
            instance: child.lineCM?.getOption('lineWiseCopyCut'),
          };
        }),
    ).toEqual({ global: false, instance: true });
    await open(page, [caret(1, 2)]);
    expect(await enabled(page, 'edit.copy')).toBe(true);
    await choose(page, 'edit.copy');
    await completed(page);
    expect(await page.evaluate(() => (window as unknown as Host).linewise.writes[0]?.text)).toBe(
      'Bravo\n',
    );
    expect(await flush(page)).toBe(source);
  });
  test(`${mode} read-only CM does not offer cut even though the document is not globally locked`, async ({
    page,
  }) => {
    const source = mode === 'source' ? raw : fenceRaw;
    await mount(page, source);
    await enter(page, mode);
    await frame(page)
      .locator('body')
      .evaluate(() => {
        (window as unknown as Child).lineCM?.setOption('readOnly', true);
      });
    await open(page, [caret(1, 2)]);
    expect(await enabled(page, 'edit.copy')).toBe(true);
    expect(await enabled(page, 'edit.cut')).toBe(false);
    await choose(page, 'edit.cut');
    expect(await flush(page)).toBe(source);
    expect(await page.evaluate(() => (window as unknown as Host).linewise.writes)).toEqual([]);
  });
  test(`${mode} read-only change after prepare blocks a late clipboard acknowledgment`, async ({
    page,
  }) => {
    const source = mode === 'source' ? raw : fenceRaw;
    await mount(page, source);
    await enter(page, mode);
    await open(page, [caret(1, 2)]);
    await holdCut(page);
    await frame(page)
      .locator('body')
      .evaluate(() => {
        (window as unknown as Child).lineCM?.setOption('readOnly', 'nocursor');
      });
    await release(page);
    expect(await flush(page)).toBe(source);
  });
}
for (const mode of ['source', 'fence'] as const) {
  test(`${mode} synthetic composition cancels a prepared line cut without committing candidate text`, async ({
    page,
  }) => {
    const source = mode === 'source' ? raw : fenceRaw;
    await mount(page, source);
    await enter(page, mode);
    await open(page, [caret(1, 2)]);
    await holdCut(page);
    await frame(page)
      .locator('body')
      .evaluate(() => {
        (window as unknown as Child).lineCM
          ?.getInputField()
          .dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '候' }));
      });
    await release(page);
    await frame(page)
      .locator('body')
      .evaluate(() => {
        (window as unknown as Child).lineCM
          ?.getInputField()
          .dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
      });
    expect(await flush(page)).toBe(source);
  });
  test(`${mode} loading another document cancels a prepared line cut before the late write resolves`, async ({
    page,
  }) => {
    await mount(page, mode === 'source' ? raw : fenceRaw);
    await enter(page, mode);
    await open(page, [caret(1, 2)]);
    await holdCut(page);
    await page.evaluate(() => {
      const host = window as unknown as Host;
      host.linewise.load = host.marklyraEditor.load('Replacement document');
    });
    await release(page);
    await page.evaluate(() => (window as unknown as Host).linewise.load);
    expect(await flush(page)).toBe('Replacement document');
  });
}
