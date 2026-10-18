import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { build } from 'vite';
import type { LegacyGlobals } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import type { PolicyModelSnapshot } from '../../packages/editor-runtime/src/runtime/policy-serialization.js';

type Oracle = typeof import('../../packages/editor-runtime/src/runtime/policy-serialization.js');
type Child = LegacyGlobals & { policyOracle: Oracle; policySnapshot?: PolicyModelSnapshot };
const runtimeUrl = process.env.POLICY_ORACLE_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html';
let bundle = '';
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(
          new URL(
            '../../packages/editor-runtime/src/runtime/policy-serialization.ts',
            import.meta.url,
          ),
        ),
        formats: ['iife'],
        name: 'PolicyOracle',
      },
    },
  });
  if (!Array.isArray(result)) throw Error('Unexpected utility build');
  const chunk = result[0]?.output.find((value) => value.type === 'chunk');
  if (chunk?.type !== 'chunk') throw Error('Missing utility module');
  bundle = `${chunk.code}\nwindow.policyOracle=PolicyOracle;`;
});
async function mount(page: Page, source: string) {
  const host = new URL('/__policy_oracle__', runtimeUrl).href;
  // A localhost document avoids Chromium's opaque-origin local-network denial.
  await page.route(host, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<iframe title="private oracle" style="width:1100px;height:800px;border:0"></iframe>',
    }),
  );
  await page.goto(host);
  await page.locator('iframe').evaluate((element, url) => {
    (element as HTMLIFrameElement).src = `${url}?channel=policy-oracle`;
  }, runtimeUrl);
  const frame = await expect
    .poll(() =>
      page
        .frames()
        .find((value) => value.url().startsWith(runtimeUrl))
        ?.url(),
    )
    .toBeTruthy()
    .then(() => page.frames().find((value) => value.url().startsWith(runtimeUrl)));
  if (!frame) throw Error('Missing private runtime');
  await frame.waitForFunction(() => {
    const runtime = window as unknown as Child;
    return (
      runtime.editor &&
      !runtime.File?._onInitParse &&
      Reflect.get(runtime.editor.fences, 'modeLoaded')
    );
  });
  await frame.addScriptTag({ content: bundle });
  await frame.evaluate(async (source) => {
    const runtime = window as unknown as Child;
    if (!runtime.File) throw Error('Missing original File');
    runtime.File.option.indentSize = 2;
    runtime.File.option.indentByTab = false;
    runtime.File.option.prettyIndent = false;
    await runtime.File.loadFile('', false, [source, null, {}]);
  }, source);
  return frame;
}
const vectors = [
  { name: 'loaded nested list preserves explicit source indentation', source: '- Alpha\n  - Beta' },
  {
    name: 'generated nested list uses current policy',
    source: '- Alpha\n- Beta',
    generate: 'nested',
  },
  { name: 'generated quote', source: 'Alpha', generate: 'blockquote' },
  { name: 'generated ordered list', source: 'Alpha', generate: 'ol' },
  { name: 'generated task list', source: 'Alpha', generate: 'tasklist' },
  {
    name: 'loaded mixed quote list and tasks',
    source: '> Alpha\n>\n> 12. 中文😀\n>     - [x] Task\n>     - Beta\n\nTail',
  },
  {
    name: 'table code YAML math and inline',
    source:
      '---\ntitle: 中文\n---\n\n| A | B |\n| --- | ---: |\n| `a|b` | 你好 |\n\n```js\n  keep\n\tspaces\n```\n\n$$\nx+y\n$$\n\n**Alpha** *中文😀* $x$',
  },
  {
    name: 'footnotes references HTML and TOC',
    source:
      '# Alpha\n\n[TOC]\n\n[link][ref] and [^note]\n\n[ref]: https://example.test "Title"\n\n[^note]: Content\n\n<div>Raw HTML</div>',
  },
  {
    name: 'mixed EOL and Unicode',
    source: '# 中文😀\r\n\r\n- Alpha\r\n  - Beta\n\n> Quote\r\n\r\nTail\n',
  },
  { name: 'unholdable trailing paragraph after fence', source: '```text\nAlpha\n```' },
  { name: 'canonical final-newline wrapper', source: 'Alpha', finalNewline: true },
  { name: 'empty document', source: '' },
];
for (const vector of vectors)
  test(vector.name, async ({ page }, info) => {
    const frame = await mount(page, vector.source);
    if (vector.generate) {
      await frame.evaluate(() => {
        const runtime = window as unknown as Child,
          editor = runtime.editor;
        if (!editor) throw Error('No editor');
        const walker = document.createTreeWalker(editor.writingArea, NodeFilter.SHOW_TEXT);
        let text: Text | undefined;
        for (let node = walker.nextNode(); node; node = walker.nextNode())
          if (node.textContent?.includes('Beta') || node.textContent?.includes('Alpha'))
            text = node as Text;
        if (!text) throw Error('No target');
        editor.writingArea.focus();
        editor.refocus(text.parentElement?.closest('[cid]')?.getAttribute('cid') ?? undefined);
        getSelection()?.setBaseAndExtent(text, 0, text, 0);
      });
      if (vector.generate === 'nested') await page.keyboard.press('Tab');
      else
        await frame.evaluate((kind) => {
          const runtime = window as unknown as Child;
          runtime.editor?.stylize.toggleIndent(kind);
        }, vector.generate);
    }
    const result = await frame.evaluate(
      ({ finalNewline }) => {
        const runtime = window as unknown as Child,
          editor = runtime.editor,
          file = runtime.File;
        if (!editor || !file) throw Error('No runtime');
        file.finalNewline = finalNewline;
        const currentCanonical = editor.getMarkdown();
        const map = editor.nodeMap as unknown as { storeToJson(): unknown };
        const nodeType = Reflect.get(window, 'NodeDef') as { pool: Map<string, object> };
        const pool = [...nodeType.pool],
          activityNodes = [...editor.writingArea.querySelectorAll('[cid]')];
        const toc = editor.nodeMap.toc;
        const refresh = toc?.refresh;
        let tocCalls = 0;
        if (toc)
          toc.refresh = () => {
            tocCalls++;
          };
        const state = () => ({
          model: JSON.stringify(map.storeToJson()),
          history: JSON.stringify(editor.undo.commandStack),
          index: editor.undo.index,
          html: editor.writingArea.innerHTML,
          selection: JSON.stringify(editor.selection.buildUndo()),
          active: document.activeElement,
          options: Object.getOwnPropertyDescriptors(file.option),
        });
        const before = state();
        const snapshot = runtime.policyOracle.capturePolicyModel(runtime);
        const oldPolicy = { indentSize: 2, indentByTab: false, prettyIndent: false } as const;
        const old = runtime.policyOracle.serializePolicyModel(runtime, snapshot, oldPolicy);
        const policies = [
          { indentSize: 4, indentByTab: false, prettyIndent: true },
          { indentSize: 2, indentByTab: true, prettyIndent: false },
          { indentSize: 3, indentByTab: false, prettyIndent: false },
        ] as const;
        const comparisons = policies.map((policy) => {
          const oracle = runtime.policyOracle.serializePolicyModel(runtime, snapshot, policy);
          const again = runtime.policyOracle.serializePolicyModel(runtime, snapshot, policy);
          const saved = ['indentSize', 'indentByTab', 'prettyIndent'].map(
            (key) => [key, Object.getOwnPropertyDescriptor(file.option, key)] as const,
          );
          let actual: string;
          try {
            Object.assign(file.option, policy);
            actual = editor.getMarkdown();
          } finally {
            for (const [key, descriptor] of saved)
              if (descriptor) Object.defineProperty(file.option, key, descriptor);
          }
          return { policy, oracle, again, actual };
        });
        const after = state();
        if (toc && refresh) toc.refresh = refresh;
        return {
          currentCanonical,
          old,
          comparisons,
          unchanged: {
            model: before.model === after.model,
            history: before.history === after.history,
            index: before.index === after.index,
            html: before.html === after.html,
            selection: before.selection === after.selection,
            focus: before.active === after.active,
            options: JSON.stringify(before.options) === JSON.stringify(after.options),
            pool:
              pool.length === nodeType.pool.size &&
              pool.every(([id, node]) => nodeType.pool.get(id) === node),
            nodes: activityNodes.every(
              (node) =>
                editor.writingArea.querySelector(`[cid="${node.getAttribute('cid')}"]`) === node,
            ),
          },
          tocCalls,
        };
      },
      { finalNewline: vector.finalNewline ?? false },
    );
    await info.attach('policy-oracle.json', {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    });
    expect(result.old.canonical).toBe(result.currentCanonical);
    for (const comparison of result.comparisons) {
      expect(comparison.oracle.canonical).toBe(comparison.actual);
      expect(comparison.again).toEqual(comparison.oracle);
      expect(comparison.oracle.blocks.map((block) => block.text).join('')).toBe(
        comparison.oracle.canonical,
      );
      let at = 0;
      for (const block of comparison.oracle.blocks) {
        expect(block.from).toBe(at);
        at = block.to;
      }
      expect(at).toBe(comparison.oracle.canonical.length);
    }
    expect(Object.values(result.unchanged).every(Boolean)).toBe(true);
    expect(result.tocCalls).toBe(0);
  });
