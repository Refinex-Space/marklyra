import { writeFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import {
  createImageEditor,
  focusEnd,
  type ImageTestWindow,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';

const diagram = '```mermaid\ngraph TD; A-->B;\n```\n\nTail\n';
const yaml = '---\r\ntitle: "Next document"\n---\r\n\r\nBody\n';
interface NativeNode {
  cid: string;
  get(name: string): unknown;
}
interface NativeEditor {
  nodeMap: { allNodes: { toArray(): NativeNode[] } };
  sourceView: {
    inSourceMode: boolean;
    cm: {
      getValue(): string;
      doc: { historySize(): { undo: number; redo: number } };
      setCursor(position: { line: number; ch: number }): void;
      focus(): void;
    };
  };
  undo: { index: number };
}
interface Snapshot {
  label: string;
  raw: string | null;
  error: string | null;
  view: {
    sourceMode: boolean;
    sourceText: string | null;
    historyIndex: number;
    nodes: { cid: string; type: unknown; text: unknown; lang: unknown }[];
    html: string;
    metaText: string | null;
    metaCodeMirrors: number;
    svg: number;
  };
}
const diagnostics = new WeakMap<Page, Snapshot[]>();
const errors = new WeakMap<Page, string[]>();
const expectedErrors = new WeakMap<Page, number>();
test.beforeEach(async ({ page }) => {
  const captured: string[] = [];
  errors.set(page, captured);
  expectedErrors.set(page, 0);
  diagnostics.set(page, []);
  page.on('pageerror', (error) => captured.push(error.message));
  const baseline = process.env.RECOVERY_LIFECYCLE_BASELINE_FRAME;
  if (baseline)
    await page.route('http://127.0.0.1:4174/frame-host.js', (route) =>
      route.fulfill({ path: baseline, contentType: 'text/javascript' }),
    );
  await setupImageHost(page);
  await createImageEditor(page, { source: '', context: 'lifecycle' });
});
test.afterEach(async ({ page }, testInfo) => {
  await writeFile(
    testInfo.outputPath('document-lifecycle-states.json'),
    JSON.stringify(diagnostics.get(page), null, 2),
  );
  await testInfo.attach('document-lifecycle-states', {
    body: JSON.stringify(diagnostics.get(page), null, 2),
    contentType: 'application/json',
  });
  expect(errors.get(page)).toEqual([]);
  const reported = await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors);
  expect(reported).toHaveLength(expectedErrors.get(page) ?? 0);
  for (const error of reported) expect(error).toMatch(/normalization|surrogate/);
});

async function load(page: Page, source: string) {
  await page.evaluate(async (source) => {
    const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
    if (!editor) throw new Error('Missing lifecycle editor');
    await editor.load(source);
  }, source);
}
async function reload(page: Page, source: string) {
  await page.evaluate(async (source) => {
    const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
    if (!editor) throw new Error('Missing lifecycle editor');
    const expectedSource = await editor.flush(),
      expectedRevision = editor.revision;
    await editor.reloadFromDisk(source, { expectedSource, expectedRevision });
  }, source);
}
async function command(page: Page, type: 'undo' | 'redo' | 'toggleSource') {
  await page.evaluate(
    (type) => (window as ImageTestWindow).imageHostFixture.editors[0]?.execute({ type }),
    type,
  );
}
async function typeAtSourceEnd(page: Page, text: string) {
  await imageFrame(page)
    .locator('#write')
    .evaluate(() => {
      const editor = Reflect.get(window, 'editor') as NativeEditor;
      const cm = editor.sourceView.cm;
      const lines = cm.getValue().replace(/\r\n?/g, '\n').split('\n');
      let line = lines.length - 1;
      while (line > 0 && lines[line] === '') line--;
      cm.setCursor({ line, ch: lines[line]?.length ?? 0 });
      cm.focus();
    });
  await page.keyboard.type(text);
}
async function snapshot(page: Page, label: string): Promise<Snapshot> {
  // Read the model/DOM before flush, to distinguish pre-existing corruption from
  // any normalization during the public save/sync boundary.
  const view = await imageFrame(page)
    .locator('#write')
    .evaluate((element) => {
      const editor = Reflect.get(window, 'editor') as NativeEditor;
      return {
        sourceMode: editor.sourceView.inSourceMode,
        sourceText: editor.sourceView.inSourceMode ? editor.sourceView.cm.getValue() : null,
        historyIndex: editor.undo.index,
        nodes: editor.nodeMap.allNodes
          .toArray()
          .slice(0, 24)
          .map((node) => ({
            cid: node.cid,
            type: node.get('type'),
            text: node.get('text'),
            lang: node.get('lang'),
          })),
        html: element.innerHTML.slice(0, 20_000),
        metaText: element.querySelector('.md-meta-block')?.textContent ?? null,
        metaCodeMirrors: element.querySelectorAll('.md-meta-block .CodeMirror').length,
        svg: element.querySelectorAll('.md-diagram-panel-preview svg').length,
      };
    });
  const state = await page.evaluate(async () => {
    const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
    if (!editor) throw new Error('Missing lifecycle editor');
    try {
      return { raw: await editor.flush(), error: null };
    } catch (error) {
      return { raw: null, error: String(error) };
    }
  });
  const result = { label, ...state, view };
  diagnostics.get(page)?.push(result);
  return result;
}
async function assertYaml(page: Page, label: string) {
  const state = await snapshot(page, label);
  expect(state.error).toBeNull();
  expect(state.raw).toBe(yaml);
  if (state.view.sourceMode) {
    expect(state.view.sourceText).toContain('title: "Next document"');
    expect(state.view.sourceText).not.toContain('graph TD');
  } else {
    expect(state.view.nodes.find((node) => node.type === 'meta_block')?.text).toBe(
      'title: "Next document"',
    );
    expect(state.view.metaCodeMirrors).toBe(0);
    expect(state.view.metaText).not.toContain('graph TD');
    expect(state.view.metaText).not.toContain('xxxxxxxxxx');
  }
}

test('fresh YAML fixture is parsed as an actual meta block before lifecycle comparisons', async ({
  page,
}) => {
  await load(page, yaml);
  await assertYaml(page, 'YAML positive control without preceding Mermaid');
});

test('consecutive SDK load keeps new YAML raw/model/DOM intact after pending Mermaid work', async ({
  page,
}) => {
  // Four finite scheduling offsets around 80ms refresh / 200ms diagram
  // work. These are semantic race vectors, not performance measurements.
  for (const delay of [0, 40, 100, 240]) {
    await load(page, diagram);
    if (delay) await page.waitForTimeout(delay);
    await snapshot(page, `Mermaid before load (${delay}ms)`);
    await load(page, yaml);
    await assertYaml(page, `YAML immediately after load (${delay}ms)`);
    await page.waitForTimeout(650);
    await assertYaml(page, `YAML after pending work (${delay}ms)`);
  }
});

test('completed Mermaid rendering is a positive control before loading YAML and editing its body', async ({
  page,
}) => {
  await load(page, diagram);
  await expect(imageFrame(page).locator('#write .md-diagram-panel-preview svg')).toHaveCount(1);
  await snapshot(page, 'Mermaid SVG completed');
  await load(page, yaml);
  await page.waitForTimeout(650);
  await assertYaml(page, 'YAML after completed Mermaid');
  await focusEnd(page);
  await page.keyboard.type('X');
  expect(await imageSource(page)).toBe(yaml.replace('Body', 'BodyX'));
  await command(page, 'undo');
  await assertYaml(page, 'YAML body Undo');
  await command(page, 'redo');
  expect(await imageSource(page)).toBe(yaml.replace('Body', 'BodyX'));
});

for (const sourceMode of [false, true]) {
  test(`${sourceMode ? 'source' : 'WYSIWYG'} SDK reload from Mermaid to YAML preserves delayed state and exact Undo/Redo`, async ({
    page,
  }) => {
    await load(page, diagram);
    if (sourceMode) await command(page, 'toggleSource');
    await reload(page, yaml);
    await assertYaml(page, 'YAML after reload');
    await page.waitForTimeout(650);
    await assertYaml(page, 'YAML after reload callbacks');
    await command(page, 'undo');
    expect(await imageSource(page)).toBe(diagram);
    await snapshot(page, 'Mermaid reload Undo');
    await command(page, 'redo');
    await page.waitForTimeout(650);
    await assertYaml(page, 'YAML reload Redo after callbacks');
    if (sourceMode) {
      await command(page, 'toggleSource');
      await assertYaml(page, 'YAML back to WYSIWYG');
    }
  });
}

for (const operation of ['load', 'reload'] as const) {
  test(`failed SDK ${operation} rolls back Mermaid history without contaminating a later YAML document`, async ({
    page,
  }) => {
    await load(page, diagram);
    await focusEnd(page);
    await page.keyboard.type('X');
    const edited = diagram.replace('Tail', 'TailX');
    expect(await imageSource(page)).toBe(edited);
    const invalid = '---\ntitle: "Rejected"\n---\n\nUnsupported \uE027 marker';
    const result = await (operation === 'load' ? load(page, invalid) : reload(page, invalid)).then(
      () => '',
      (error: unknown) => String(error),
    );
    expect(result).toMatch(/normalization/);
    if (operation === 'load') expectedErrors.set(page, 1);
    await page.waitForTimeout(650);
    const restored = await snapshot(page, 'Mermaid restored after rejected candidate');
    expect(restored.error).toBeNull();
    expect(restored.raw).toBe(edited);
    await command(page, 'undo');
    expect(await imageSource(page)).toBe(diagram);
    await command(page, 'redo');
    expect(await imageSource(page)).toBe(edited);
    await load(page, yaml);
    await page.waitForTimeout(650);
    await assertYaml(page, 'YAML after rollback and history');
  });
}

test('source-mode transitions around continuous loads do not retain old Mermaid content under a reused YAML cid', async ({
  page,
}, testInfo) => {
  await load(page, diagram);
  await command(page, 'toggleSource');
  await snapshot(page, 'Mermaid source mode');
  await imageFrame(page)
    .locator('#write')
    .evaluate(() => {
      const editor = Reflect.get(window, 'editor') as NativeEditor;
      const file = Reflect.get(window, 'File') as unknown as {
        loadFile(...args: unknown[]): Promise<unknown>;
      };
      const events: unknown[] = [];
      Reflect.set(window, '__lifecycleNativeLoads', events);
      const original = file.loadFile;
      file.loadFile = async function (...args) {
        const result = await Reflect.apply(original, this, args);
        const payload = args[2] as unknown[] | undefined;
        events.push({
          source: payload?.[0],
          sourceMode: editor.sourceView.inSourceMode,
          sourceText: editor.sourceView.cm?.getValue(),
          nodes: editor.nodeMap.allNodes
            .toArray()
            .map((node) => ({ cid: node.cid, type: node.get('type'), text: node.get('text') })),
        });
        return result;
      };
    });
  let failed: unknown;
  try {
    await load(page, yaml);
  } catch (error) {
    failed = error;
  }
  const nativeLoads = await imageFrame(page)
    .locator('#write')
    .evaluate(() => Reflect.get(window, '__lifecycleNativeLoads') as unknown[]);
  await writeFile(
    testInfo.outputPath('native-load-states.json'),
    JSON.stringify(nativeLoads, null, 2),
  );
  if (failed) throw failed;
  await page.waitForTimeout(120);
  await assertYaml(page, 'YAML loaded in source mode');
  const mode = await imageFrame(page)
    .locator('#write')
    .evaluate(() => (Reflect.get(window, 'editor') as NativeEditor).sourceView.inSourceMode);
  if (mode) await command(page, 'toggleSource');
  await page.waitForTimeout(650);
  await assertYaml(page, 'YAML after leaving source mode');
  await command(page, 'toggleSource');
  await command(page, 'toggleSource');
  await page.waitForTimeout(650);
  await assertYaml(page, 'YAML after a second mode round-trip');
});

test('source-mode ordinary load clears prior source edits but rejected replacements restore the current document history', async ({
  page,
}) => {
  await load(page, diagram);
  await command(page, 'toggleSource');
  await typeAtSourceEnd(page, 'X');
  expect(await imageSource(page)).toBe(diagram.replace('Tail', 'TailX'));
  await load(page, yaml);
  await assertYaml(page, 'new YAML after edited source document');
  const history = await imageFrame(page)
    .locator('#write')
    .evaluate(() =>
      (Reflect.get(window, 'editor') as NativeEditor).sourceView.cm.doc.historySize(),
    );
  expect(history).toEqual({ undo: 0, redo: 0 });
  await command(page, 'undo');
  await assertYaml(page, 'Undo cannot cross ordinary source-mode load');
  await command(page, 'toggleSource');
  const clean = await snapshot(page, 'new YAML leaves source mode without a stale dirty flag');
  expect(clean.view.historyIndex).toBe(-1);
  await command(page, 'toggleSource');
  await typeAtSourceEnd(page, 'Y');
  const edited = yaml.replace('Body', 'BodyY');
  expect(await imageSource(page)).toBe(edited);
  const error = await load(page, 'Invalid \uD800 source').then(
    () => '',
    (error: unknown) => String(error),
  );
  expect(error).toMatch(/normalization|surrogate/);
  expectedErrors.set(page, 1);
  await page.waitForTimeout(650);
  expect(await imageSource(page)).toBe(edited);
  await command(page, 'undo');
  await assertYaml(page, 'current YAML history survives failed source-mode load');
  await command(page, 'redo');
  expect(await imageSource(page)).toBe(edited);
});

for (const sourceMode of [false, true])
  test(`${sourceMode ? 'source' : 'WYSIWYG'} large generated HTML followed immediately by YAML cannot commit the previous document later`, async ({
    page,
  }, testInfo) => {
    // One long plain paragraph reaches reset's 100k HTML scheduling
    // branch without the unrelated cost of thousands of tables/images.
    const large = `Large ${'a'.repeat(110_000)}\n\nTail\n`;
    if (sourceMode) await command(page, 'toggleSource');
    await imageFrame(page)
      .locator('#write')
      .evaluate((element) => {
        const commits: { at: number; size: number; prefix: string }[] = [];
        Reflect.set(window, '__lifecycleCommits', commits);
        const observer = new MutationObserver(() => {
          if (commits.length < 24)
            commits.push({
              at: performance.now(),
              size: element.innerHTML.length,
              prefix: element.textContent?.slice(0, 64) ?? '',
            });
        });
        observer.observe(element, { childList: true });
        Reflect.set(window, '__lifecycleObserver', observer);
      });
    await page.evaluate(
      async ({ large, yaml }) => {
        const editor = (window as ImageTestWindow).imageHostFixture.editors[0];
        if (!editor) throw new Error('Missing lifecycle editor');
        await editor.load(large);
        await editor.load(yaml);
      },
      { large, yaml },
    );
    await assertYaml(page, 'YAML after >100k HTML load');
    await page.waitForTimeout(650);
    await assertYaml(page, 'YAML after pending large-DOM commit');
    const commits = await imageFrame(page)
      .locator('#write')
      .evaluate(() => {
        (Reflect.get(window, '__lifecycleObserver') as MutationObserver).disconnect();
        return Reflect.get(window, '__lifecycleCommits') as {
          at: number;
          size: number;
          prefix: string;
        }[];
      });
    await writeFile(
      testInfo.outputPath('large-document-dom-commits.json'),
      JSON.stringify(commits, null, 2),
    );
    await testInfo.attach('large-document-dom-commits', {
      body: JSON.stringify(commits, null, 2),
      contentType: 'application/json',
    });
    expect(commits.some((commit) => commit.size > 100_000)).toBe(true);
    expect(commits.at(-1)?.prefix).toContain('Next document');
  });
