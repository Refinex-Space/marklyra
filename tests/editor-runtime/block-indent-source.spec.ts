import { fileURLToPath } from 'node:url';
import { expect, type Frame, type Page, test } from '@playwright/test';
import { build } from 'vite';
import { SourceMirror } from '../../packages/editor-core/src/source-mirror.js';
import type {
  BlockIndentAction,
  BlockIndentReceipt,
} from '../../packages/editor-runtime/src/runtime/block-indent-source.js';
import type {
  LegacyGlobals,
  LegacyNode,
} from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import type { NativeSerialization } from '../../packages/editor-runtime/src/runtime/serialization.js';
import { type BlockIndentFixture, blockIndentFixtures } from '../fixtures/block-indent-fixtures.js';

type Oracle = typeof import('../../packages/editor-runtime/src/runtime/block-indent-source.js') &
  typeof import('../../packages/editor-runtime/src/runtime/serialization.js');
interface Observation {
  json: string;
  nodes: unknown[];
  dom: unknown[];
  pool: object;
  entries: [unknown, unknown][];
  stack: object[];
}
type Probe = LegacyGlobals & {
  BlockIndentOracle: Oracle;
  blockComplete?: ((source: string) => BlockIndentReceipt | undefined) | undefined;
  blockObserve(): Observation;
  blockSame(a: Observation, b: Observation): boolean;
};
const runtimeUrl = process.env.BLOCK_INDENT_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html';
let bundle = '';
test.beforeAll(async () => {
  const entry = 'block-indent-oracle';
  const block = fileURLToPath(
    new URL('../../packages/editor-runtime/src/runtime/block-indent-source.ts', import.meta.url),
  );
  const serializer = fileURLToPath(
    new URL('../../packages/editor-runtime/src/runtime/serialization.ts', import.meta.url),
  );
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [
      {
        name: entry,
        transform(code, id) {
          if (id === block)
            return `${code}\nexport { trySerializeNativeBlocks } from ${JSON.stringify(serializer)};`;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: { entry: block, name: 'BlockIndentOracle', formats: ['iife'] },
    },
  });
  if (!Array.isArray(result)) throw Error('Missing memory build');
  const chunk = result[0]?.output.find((value) => value.type === 'chunk');
  if (chunk?.type !== 'chunk') throw Error('Missing oracle bundle');
  bundle = chunk.code;
});
async function mount(page: Page, source: string) {
  const host = new URL('/__block_indent_oracle__', runtimeUrl).href;
  await page.route(host, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<iframe title="independent original runtime" style="width:1150px;height:820px"></iframe>',
    }),
  );
  await page.goto(host);
  await page.locator('iframe').evaluate((node, url) => {
    (node as HTMLIFrameElement).src = `${url}?channel=block-indent-oracle`;
  }, runtimeUrl);
  await expect
    .poll(() =>
      page
        .frames()
        .find((frame) => frame.url().startsWith(runtimeUrl))
        ?.url(),
    )
    .toBeTruthy();
  const frame = page.frames().find((value) => value.url().startsWith(runtimeUrl));
  if (!frame) throw Error('Missing runtime');
  await frame.waitForFunction(() => {
    const g = window as unknown as LegacyGlobals;
    return g.editor && !g.File?._onInitParse && Reflect.get(g.editor.fences, 'modeLoaded');
  });
  await frame.addScriptTag({ content: bundle });
  await frame.evaluate(async (source) => {
    const g = window as unknown as LegacyGlobals;
    if (!g.File) throw Error('Missing File');
    g.File.option.indentSize = 2;
    g.File.option.indentByTab = false;
    g.File.option.prettyIndent = false;
    g.File.useCRLF = source.includes('\r\n');
    await g.File.loadFile('', false, [source.replace(/^\ufeff/u, ''), null, {}]);
  }, source);
  return frame;
}
async function semantic(frame: Frame) {
  return frame.evaluate(() => {
    const g = window as unknown as LegacyGlobals,
      e = g.editor;
    if (!e) throw Error('Missing editor');
    const output: unknown[] = [];
    const read = (node: LegacyNode, key: string): unknown => Reflect.apply(node.get, node, [key]);
    const walk = (node: LegacyNode, path: unknown[]) => {
      const type = node.get('type');
      let next = path;
      if (type === 'list_item') {
        const parent = node.get('parent') as LegacyNode;
        next = [
          ...path,
          [
            'list',
            read(parent, 'style'),
            read(node, 'style') ?? null,
            read(node, 'checked') ?? null,
          ],
        ];
      }
      if (type === 'blockquote') next = [...path, ['quote', read(node, 'alert') ?? null]];
      if (type === 'list' || type === 'list_item' || type === 'blockquote') {
        for (let child = node.getFirstChild(); child; child = child.get('after')) walk(child, next);
      } else {
        if (type === 'paragraph' && node.get('text') === '') {
          const dom = [...e.writingArea.querySelectorAll('[cid]')].find(
            (element) => element.getAttribute('cid') === node.cid,
          );
          if (dom?.classList.contains('unholdable')) return;
        }
        output.push({ type, text: node.get('text'), lang: read(node, 'lang') ?? null, path: next });
      }
    };
    for (let node = e.nodeMap.blocks.sortedFirst(); node; node = node.get('after')) walk(node, []);
    return output;
  });
}
async function arm(frame: Frame, fixture: BlockIndentFixture, backward: boolean) {
  await frame.evaluate(
    ({ from, to, backward }) => {
      const paragraphs = [...document.querySelectorAll<HTMLElement>('#write p[cid]')];
      const first = paragraphs.find((node) => node.textContent === from),
        last = to ? paragraphs.find((node) => node.textContent === to) : first;
      if (!first || !last) throw Error('Missing fixture selection');
      first.focus();
      const endpoint = (paragraph: Element) => {
        const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
        let end = walker.nextNode();
        for (let node = walker.nextNode(); node; node = walker.nextNode()) end = node;
        if (!end) throw Error('Missing source endpoint');
        return end;
      };
      const a = endpoint(first),
        b = endpoint(last),
        selection = getSelection();
      if (!selection) throw Error('Missing selection');
      if (backward && to) selection.setBaseAndExtent(b, b.textContent?.length ?? 0, a, 0);
      else
        selection.setBaseAndExtent(
          a,
          to ? 0 : (a.textContent?.length ?? 0),
          b,
          b.textContent?.length ?? 0,
        );
    },
    { from: fixture.from, to: fixture.to, backward },
  );
  return frame.evaluate((action) => {
    const g = window as unknown as Probe,
      e = g.editor;
    if (!e) throw Error('Missing editor');
    const cap: unknown = Reflect.get(g, '__MARKLYRA_NATIVE_SERIALIZATION__');
    if (!cap || typeof cap !== 'object') throw Error('Missing native capability');
    g.blockObserve = () => {
      const raw: unknown = Reflect.get(e.nodeMap, 'allNodes'),
        nodes = raw && typeof raw === 'object' ? Reflect.get(raw, '_set') : undefined;
      if (!Array.isArray(nodes)) throw Error('Missing native model');
      const flatten = (node: object) => {
        const attrs: unknown = Reflect.get(node, 'attributes');
        if (!attrs || typeof attrs !== 'object') throw Error('Missing attributes');
        return Object.fromEntries(
          Object.entries(attrs).map(([key, value]) => [
            key,
            value && typeof value === 'object'
              ? (Reflect.get(value, 'cid') ??
                (Array.isArray(value)
                  ? value
                  : Array.isArray(Reflect.get(value, '_set'))
                    ? Reflect.get(value, '_set').map((child: object) => Reflect.get(child, 'cid'))
                    : '[map]'))
              : value,
          ]),
        );
      };
      const ctor = Reflect.get(Reflect.get(cap, 'nodePrototype'), 'constructor'),
        pool: unknown = Reflect.get(ctor, 'pool');
      if (!(pool instanceof Map)) throw Error('Missing node pool');
      return {
        json: JSON.stringify({
          model: nodes.map((node) => [Reflect.get(node, 'cid'), flatten(node)]),
          history: e.undo.commandStack,
          index: e.undo.index,
          html: e.writingArea.innerHTML,
          nid: Reflect.get(ctor, 'nid'),
          selection: e.selection.buildUndo(),
          options: Object.getOwnPropertyDescriptors(g.File?.option ?? {}),
        }),
        nodes: [...nodes],
        dom: [e.writingArea, ...e.writingArea.querySelectorAll('*')],
        pool,
        entries: [...pool],
        stack: [...e.undo.commandStack],
      };
    };
    g.blockSame = (a, b) =>
      a.json === b.json &&
      a.pool === b.pool &&
      (['nodes', 'dom', 'stack'] as const).every(
        (key) => a[key].length === b[key].length && a[key].every((node, i) => node === b[key][i]),
      ) &&
      a.entries.length === b.entries.length &&
      a.entries.every(([key, node], i) => key === b.entries[i]?.[0] && node === b.entries[i]?.[1]);
    let receipt: NativeSerialization | undefined;
    const source = g.BlockIndentOracle.trySerializeNativeBlocks(
      e.nodeMap,
      Boolean(g.File?.useCRLF),
      (result) => {
        receipt = result;
      },
      {
        capability: cap,
        original: Reflect.get(cap, 'mapToMark'),
        useCRLF: () => Boolean(g.File?.useCRLF),
      },
    );
    const canonical = e.getMarkdown();
    if (source === undefined || !receipt || !canonical.startsWith(source))
      throw Error('Missing native block receipt');
    const last = receipt.blocks.at(-1);
    if (last) {
      last.text += canonical.slice(source.length);
      last.to = canonical.length;
    }
    const before = g.blockObserve();
    g.blockComplete = g.BlockIndentOracle.captureBlockIndent(
      g,
      canonical,
      receipt.blocks,
      action,
      g.File?.useCRLF ? '\r\n' : '\n',
    );
    const after = g.blockObserve();
    return { armed: !!g.blockComplete, unchanged: g.blockSame(before, after), canonical };
  }, fixture.action);
}
async function perform(frame: Frame, action: BlockIndentAction) {
  return frame.evaluate((action) => {
    const g = window as unknown as Probe,
      e = g.editor;
    if (!e) throw Error('Missing editor');
    if (action === 'quote') e.stylize.toggleIndent('blockquote');
    else if (action === 'indent') e.UserOp.moreIndent(e);
    else e.UserOp.lessIndent(e);
    const canonical = e.getMarkdown(),
      before = g.blockObserve(),
      receipt = g.blockComplete?.(canonical),
      after = g.blockObserve();
    return { canonical, receipt, unchanged: g.blockSame(before, after) };
  }, action);
}
function mirrorSource(raw: string, base: string, receipt: BlockIndentReceipt) {
  const mirror = new SourceMirror(raw, base),
    initial = mirror.stateId;
  const result = mirror.update(receipt.canonical, {
    kind: 'edit',
    baseStateId: initial,
    baseProjectionEpoch: mirror.projectionEpoch,
    baseCanonical: base,
    patches: receipt.patches,
    completePrefixes: receipt.completePrefixes,
    ...(receipt.normalizationPatches.length
      ? {
          canonicalProjection: {
            baseProjectionEpoch: mirror.projectionEpoch,
            baseCanonical: receipt.editCanonical,
            patches: receipt.normalizationPatches,
          },
        }
      : {}),
  }).source;
  const edited = mirror.stateId;
  expect(
    mirror.update(base, {
      kind: 'history',
      baseStateId: edited,
      baseProjectionEpoch: mirror.projectionEpoch,
      targetStateId: initial,
    }).source,
  ).toBe(raw);
  expect(
    mirror.update(receipt.canonical, {
      kind: 'history',
      baseStateId: mirror.stateId,
      baseProjectionEpoch: mirror.projectionEpoch,
      targetStateId: edited,
    }).source,
  ).toBe(result);
  return result;
}
const fixtures = [
  ...blockIndentFixtures,
  ...blockIndentFixtures
    .filter((fixture) => fixture.name.includes('quote') && !fixture.source.includes('\r'))
    .map((fixture) => ({
      ...fixture,
      name: `${fixture.name} CRLF`,
      source: fixture.source.replace(/\n/gu, '\r\n'),
      canonical: fixture.canonical.replace(/\n/gu, '\r\n'),
      edited: fixture.edited.replace(/\n/gu, '\r\n'),
    })),
];
for (const fixture of fixtures)
  for (const backward of fixture.to ? [false, true] : [false])
    test(`${fixture.name}${backward ? ' backward' : ''}: original command, exact raw and independent reparse`, async ({
      page,
      context,
    }) => {
      const frame = await mount(page, fixture.source),
        capture = await arm(frame, fixture, backward);
      expect(capture.armed).toBe(true);
      expect(capture.unchanged).toBe(true);
      const result = await perform(frame, fixture.action);
      expect(result.unchanged).toBe(true);
      expect(result.canonical).toBe(fixture.canonical);
      if (fixture.noop) {
        expect(result.receipt).toBeUndefined();
        return;
      }
      const proof = result.receipt;
      if (!proof) throw Error('Missing source proof');
      expect(proof.editCanonical).toBe(fixture.edited);
      const raw = `\ufeff${fixture.source}`,
        source = mirrorSource(raw, capture.canonical, proof);
      expect(source).toBe(`\ufeff${fixture.edited}`);
      const expected = await semantic(frame),
        other = await context.newPage();
      try {
        const loaded = await mount(other, source);
        expect(await semantic(loaded)).toEqual(expected);
      } finally {
        await other.close();
      }
    });

for (const name of ['indent-middle', 'indent-ordered', 'indent-task', 'indent-fence'])
  test(`${name}: BOM and mixed EOL remain exact`, async ({ page, context }) => {
    const fixture = blockIndentFixtures.find((value) => value.name === name);
    if (!fixture) throw Error('Missing fixture');
    const lines = fixture.source.split('\n'),
      edited = fixture.edited.split('\n');
    expect(edited.length).toBe(lines.length);
    const physical = (content: readonly string[]) =>
      `\ufeff${content.map((line, i) => line + (i + 1 < lines.length ? (i % 2 ? '\n' : '\r\n') : '')).join('')}`;
    const frame = await mount(page, fixture.source),
      before = await arm(frame, fixture, false);
    expect(before.armed).toBe(true);
    expect(before.unchanged).toBe(true);
    const result = await perform(frame, fixture.action);
    expect(result.unchanged).toBe(true);
    if (!result.receipt) throw Error('Missing proof');
    const raw = mirrorSource(physical(lines), before.canonical, result.receipt);
    expect(raw).toBe(physical(edited));
    const expected = await semantic(frame),
      other = await context.newPage();
    try {
      const loaded = await mount(other, raw);
      expect(await semantic(loaded)).toEqual(expected);
    } finally {
      await other.close();
    }
  });
test('a captured source proof cannot survive a same-text document replacement', async ({
  page,
}) => {
  const fixture = blockIndentFixtures[0];
  if (!fixture) throw Error('Missing fixture');
  const frame = await mount(page, fixture.source);
  expect((await arm(frame, fixture, false)).armed).toBe(true);
  const result = await frame.evaluate(async (source) => {
    const g = window as unknown as Probe;
    if (!g.File || !g.editor) throw Error('Missing runtime');
    await g.File.loadFile('', false, [source, null, {}]);
    const paragraph = [...document.querySelectorAll<HTMLElement>('#write p')].find(
      (node) => node.textContent === 'Beta',
    );
    if (!paragraph) throw Error('Missing replacement document target');
    paragraph.focus();
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let end = walker.nextNode();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) end = node;
    if (!end) throw Error('Missing replacement document endpoint');
    const range = document.createRange();
    range.setStart(end, end.textContent?.length ?? 0);
    range.collapse(true);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    g.editor.UserOp.moreIndent(g.editor);
    const canonical = g.editor.getMarkdown();
    return { canonical, proof: g.blockComplete?.(canonical) };
  }, fixture.source);
  expect(result.canonical).toBe(fixture.canonical);
  expect(result.proof).toBeUndefined();
});
