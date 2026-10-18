import { writeFile } from 'node:fs/promises';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Frame, type Page, test } from '@playwright/test';
import type { LegacyGlobals } from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type Host = Window & {
  marklyraEditor: MarkLyraEditor;
  fixtureErrors: string[];
  fixtureChanges: { source: string; phase: string }[];
  fixturePhase: string;
  fixtureExpectedErrors?: string[];
};
const states = new WeakMap<Page, unknown[]>();
const pageErrors = new WeakMap<Page, string[]>();
const original =
  '\uFEFF---\r\ntitle: Source\n---\r\n\r\n```txt\r\nsame\n```\r\n\r\n| A | B |\n| --- | --- |\r\n| same | same |\n\nTail  \r\n';

async function mount(page: Page, source = original): Promise<Frame> {
  states.set(page, []);
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as unknown as Host;
    await host.marklyraEditor.ready;
    const Constructor = host.marklyraEditor.constructor as typeof MarkLyraEditor;
    host.marklyraEditor.destroy();
    const root = document.querySelector<HTMLElement>('#editor');
    if (!root) throw new Error('Missing editor mount');
    host.fixtureErrors = [];
    host.fixtureChanges = [];
    host.fixturePhase = 'mount';
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      onError: (error) => host.fixtureErrors.push(error.message),
      onChange: (source) => host.fixtureChanges.push({ source, phase: host.fixturePhase }),
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
async function command(page: Page, type: 'undo' | 'redo' | 'toggleSource') {
  await page.evaluate((type) => {
    const host = window as unknown as Host;
    host.fixturePhase = type;
    return host.marklyraEditor.execute({ type });
  }, type);
}
async function snapshot(page: Page, frame: Frame, label: string) {
  const native = await frame.evaluate(() => {
    const editor = (window as unknown as LegacyGlobals).editor;
    if (!editor) throw new Error('Missing original editor');
    const cm = editor.sourceView.cm;
    const view = editor.sourceView.inSourceMode;
    return {
      sourceMode: view,
      canonical: editor.getMarkdown(),
      source: cm?.getValue(),
      generation: cm?.doc.history.generation,
      done: cm?.doc.history.done.map((entry) => ({
        generation: entry.generation,
        changes: entry.changes,
      })),
      undone: cm?.doc.history.undone.map((entry) => ({
        generation: entry.generation,
        changes: entry.changes,
      })),
      ranges: cm?.listSelections().map((range) => ({ anchor: range.anchor, head: range.head })),
      wysIndex: editor.undo.index,
      wysStack: editor.undo.commandStack.map((entry) => ({ tag: Reflect.get(entry, 'tag') })),
      dom: document.querySelector('#write')?.innerHTML,
    };
  });
  const raw = await flush(page);
  const host = await page.evaluate(() => {
    const host = window as unknown as Host;
    return { revision: host.marklyraEditor.revision, changes: host.fixtureChanges };
  });
  const value = { label, raw, native, host };
  states.get(page)?.push(value);
  return value;
}
async function sourceReplace(frame: Frame, needle: string, replacement: string) {
  await frame.evaluate(
    ({ needle, replacement }) => {
      const cm = (window as unknown as LegacyGlobals).editor?.sourceView.cm;
      if (!cm) throw new Error('Missing source editor');
      const at = cm.getValue().indexOf(needle);
      if (at < 0) throw new Error(`Missing source target ${needle}`);
      const pos = (index: number) => {
        const lines = cm
          .getValue()
          .slice(0, index)
          .split(/\r\n|\r|\n/);
        return { line: lines.length - 1, ch: lines.at(-1)?.length ?? 0 };
      };
      cm.changeGeneration(true);
      cm.replaceRange(replacement, pos(at), pos(at + needle.length), '+source');
      cm.changeGeneration(true);
    },
    { needle, replacement },
  );
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page }, info) => {
  await writeFile(
    info.outputPath('source-mode-states.json'),
    JSON.stringify(states.get(page), null, 2),
  );
  expect(pageErrors.get(page)).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as Host).fixtureErrors ?? [])).toEqual(
    await page.evaluate(() => (window as unknown as Host).fixtureExpectedErrors ?? []),
  );
});

for (const edit of [
  { name: 'YAML', needle: 'title: Source', replacement: 'title: Source!' },
  { name: 'fenced code repeated text', needle: 'same', replacement: 'same!' },
  { name: 'table repeated cell', needle: '| same | same |', replacement: '| same | same! |' },
])
  test(`Source ${edit.name} edit preserves raw surroundings across hide and native WYS Undo/Redo`, async ({
    page,
  }) => {
    const frame = await mount(page);
    await snapshot(page, frame, 'loaded');
    await command(page, 'toggleSource');
    await sourceReplace(frame, edit.needle, edit.replacement);
    const edited = original.replace(edit.needle, edit.replacement);
    expect((await snapshot(page, frame, 'source edit')).raw).toBe(edited);
    if (edit.name === 'YAML')
      await page.screenshot({ path: test.info().outputPath('source-edited.png') });
    await command(page, 'toggleSource');
    expect((await snapshot(page, frame, 'source hidden')).raw).toBe(edited);
    await command(page, 'undo');
    expect((await snapshot(page, frame, 'WYS Undo source sync')).raw).toBe(original);
    await command(page, 'redo');
    expect((await snapshot(page, frame, 'WYS Redo source sync')).raw).toBe(edited);
    if (edit.name === 'YAML')
      await page.screenshot({ path: test.info().outputPath('wys-redo.png') });
  });

test('equal-text Source edit/Undo/hide follows original sync history without creating a source change', async ({
  page,
}) => {
  const frame = await mount(page);
  const before = await snapshot(page, frame, 'loaded');
  await command(page, 'toggleSource');
  await sourceReplace(frame, 'same', 'same!');
  await command(page, 'undo');
  expect((await snapshot(page, frame, 'source Undo equal')).raw).toBe(original);
  const revision = await page.evaluate(() => (window as unknown as Host).marklyraEditor.revision);
  await command(page, 'toggleSource');
  const hidden = await snapshot(page, frame, 'equal-text source hidden');
  expect(hidden.raw).toBe(original);
  expect(hidden.host.revision).toBe(revision);
  // Original hide may retain an equal-text sync step; it is not a user edit.
  expect(hidden.native.wysIndex).toBe(before.native.wysIndex + 1);
  await command(page, 'undo');
  expect((await snapshot(page, frame, 'equal WYS Undo')).raw).toBe(original);
  await command(page, 'redo');
  const redone = await snapshot(page, frame, 'equal WYS Redo');
  expect(redone.raw).toBe(original);
  expect(redone.host.changes).toEqual(hidden.host.changes);
  // revision is an optimistic CAS activity counter: original Undo/Redo dirty
  // notifications may increment it without a committed source change.
  expect(redone.host.revision).toBeGreaterThan(revision);
});

test('Source external versions retain raw-only format identities through source Undo/Redo and a mode round-trip', async ({
  page,
}) => {
  const frame = await mount(page);
  await command(page, 'toggleSource');
  const external = original.replace('\uFEFF', '').replace('title: Source\n', 'title: Source\r\n');
  await page.evaluate(async (external) => {
    const editor = (window as unknown as Host).marklyraEditor;
    await editor.reloadFromDisk(external, {
      expectedSource: await editor.flush(),
      expectedRevision: editor.revision,
    });
  }, external);
  expect((await snapshot(page, frame, 'raw-only external reload')).raw).toBe(external);
  await command(page, 'undo');
  expect((await snapshot(page, frame, 'source Undo external')).raw).toBe(original);
  await command(page, 'redo');
  expect((await snapshot(page, frame, 'source Redo external')).raw).toBe(external);
  await command(page, 'toggleSource');
  expect((await snapshot(page, frame, 'external after source hide')).raw).toBe(external);
  await command(page, 'undo');
  expect((await snapshot(page, frame, 'WYS Undo raw-only external')).raw).toBe(original);
  await command(page, 'redo');
  expect((await snapshot(page, frame, 'WYS Redo raw-only external')).raw).toBe(external);
  await command(page, 'toggleSource');
  expect((await snapshot(page, frame, 'external after source reshow')).raw).toBe(external);
  await command(page, 'undo');
  expect((await snapshot(page, frame, 'new Source session has cleared source history')).raw).toBe(
    external,
  );
});

test('deferred policy with Source table/code/YAML edits preserves exact raw and original two history domains', async ({
  page,
}) => {
  const frame = await mount(page);
  await command(page, 'toggleSource');
  await page.evaluate(() =>
    (window as unknown as Host).marklyraEditor.setMarkdownPreferences({
      indentSize: -1,
      prettyIndent: true,
    }),
  );
  expect((await snapshot(page, frame, 'Source policy changes no text')).raw).toBe(original);
  let edited = original;
  for (const [needle, replacement] of [
    ['title: Source', 'title: Source!'],
    ['same', 'same🙂'],
    ['| same | same |', '| same | same! |'],
  ] as const) {
    await sourceReplace(frame, needle, replacement);
    edited = edited.replace(needle, replacement);
    expect((await snapshot(page, frame, `Source edit ${needle}`)).raw).toBe(edited);
  }
  await command(page, 'toggleSource');
  expect((await snapshot(page, frame, 'deferred policy hidden')).raw).toBe(edited);
  await command(page, 'undo');
  expect((await snapshot(page, frame, 'WYS Undo complete source sync')).raw).toBe(original);
  await command(page, 'redo');
  expect((await snapshot(page, frame, 'WYS Redo complete source sync')).raw).toBe(edited);
  await command(page, 'toggleSource');
  await command(page, 'undo');
  expect(
    (await snapshot(page, frame, 'fresh source history cannot undo previous session')).raw,
  ).toBe(edited);
});

test('Source reload preserves its logical caret and subsequent physical typing at its actual input position', async ({
  page,
}) => {
  const frame = await mount(page, '\uFEFFAlpha\r\n\r\nTail\n');
  await command(page, 'toggleSource');
  await frame.evaluate(() => {
    const cm = (window as unknown as LegacyGlobals).editor?.sourceView.cm;
    if (!cm) throw new Error('Missing source editor');
    cm.setSelections([{ anchor: { line: 2, ch: 4 }, head: { line: 2, ch: 4 } }], 0);
    cm.focus();
  });
  await page.keyboard.type('Q');
  const typed = '\uFEFFAlpha\r\n\r\nTailQ\n';
  expect((await snapshot(page, frame, 'physical Q')).raw).toBe(typed);
  const before = await frame.evaluate(() =>
    (window as unknown as LegacyGlobals).editor?.sourceView.cm?.listSelections(),
  );
  await page.evaluate(async () => {
    const editor = (window as unknown as Host).marklyraEditor;
    const expectedSource = await editor.flush();
    await editor.reloadFromDisk(expectedSource.slice(1), {
      expectedSource,
      expectedRevision: editor.revision,
    });
  });
  expect(
    await frame.evaluate(() =>
      (window as unknown as LegacyGlobals).editor?.sourceView.cm?.listSelections(),
    ),
  ).toEqual(before);
  await page.keyboard.type('Z');
  expect((await snapshot(page, frame, 'physical QZ after BOM reload')).raw).toBe(
    typed.slice(1).replace('TailQ', 'TailQZ'),
  );
  await command(page, 'undo');
  expect((await snapshot(page, frame, 'Undo Z')).raw).toBe(typed.slice(1));
  await command(page, 'undo');
  expect((await snapshot(page, frame, 'Undo external BOM')).raw).toBe(typed);
  await command(page, 'redo');
  expect((await snapshot(page, frame, 'Redo external BOM')).raw).toBe(typed.slice(1));
  await command(page, 'redo');
  expect((await snapshot(page, frame, 'Redo Z')).raw).toBe(
    typed.slice(1).replace('TailQ', 'TailQZ'),
  );
});

test('rejected Source replacements retain real CM history and ordinary load never inherits the prior document undo', async ({
  page,
}) => {
  const frame = await mount(page);
  await command(page, 'toggleSource');
  await sourceReplace(frame, 'title: Source', 'title: Source!');
  const edited = original.replace('title: Source', 'title: Source!');
  const before = await snapshot(page, frame, 'before rejected source replacement');
  await page.evaluate(() => {
    (window as unknown as Host).fixtureExpectedErrors = [
      'Text contains an unpaired high surrogate',
    ];
  });
  await expect(
    page.evaluate(() => (window as unknown as Host).marklyraEditor.load('\ud800')),
  ).rejects.toThrow('unpaired high surrogate');
  const restored = await snapshot(page, frame, 'failed replacement restored source history');
  expect(restored.raw).toBe(edited);
  expect(restored.native.sourceMode).toBe(true);
  expect(restored.native.generation).toBe(before.native.generation);
  expect(restored.native.done).toEqual(before.native.done);
  expect(restored.native.undone).toEqual(before.native.undone);
  expect(restored.native.ranges).toEqual(before.native.ranges);
  await command(page, 'undo');
  expect((await snapshot(page, frame, 'Undo after failed load')).raw).toBe(original);
  await command(page, 'redo');
  expect((await snapshot(page, frame, 'Redo after failed load')).raw).toBe(edited);
  await expect(
    page.evaluate(async () => {
      const editor = (window as unknown as Host).marklyraEditor;
      await editor.reloadFromDisk('wrong', {
        expectedSource: 'stale source',
        expectedRevision: editor.revision,
      });
    }),
  ).rejects.toThrow();
  expect((await snapshot(page, frame, 'stale reload rejected')).raw).toBe(edited);
  const replacement = '\uFEFF---\r\ntitle: Next\n---\r\n\nBody  \r\n';
  await page.evaluate(
    (replacement) => (window as unknown as Host).marklyraEditor.load(replacement),
    replacement,
  );
  const loaded = await snapshot(page, frame, 'new ordinary document');
  expect(loaded.raw).toBe(replacement);
  expect(loaded.native.sourceMode).toBe(true);
  expect(loaded.native.done).toEqual([]);
  expect(loaded.native.undone).toEqual([]);
  await command(page, 'undo');
  expect((await snapshot(page, frame, 'ordinary load Undo cannot cross documents')).raw).toBe(
    replacement,
  );
  await command(page, 'toggleSource');
  expect((await snapshot(page, frame, 'new document source hide')).raw).toBe(replacement);
});
