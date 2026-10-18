import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';

interface NativeNode {
  cid: string;
  attributes: Record<string, unknown>;
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  unset(key: string): void;
  toMark(): string;
}
interface NativeMap {
  allNodes: { toArray(): NativeNode[] };
  blocks: { toArray(): NativeNode[] };
  toMark(): string;
}
interface NativeFixture extends Window {
  editor: { nodeMap: NativeMap };
  __nativeToMark?: (this: NativeMap) => string;
  __fallbackCalls: number;
  __nativeLineCalls: number;
}
type Host = Window & { marklyraEditor: MarkLyraEditor };

const fixtures = [
  { id: 'soft lines and Unicode', source: 'Alpha 中文😀\r\nsoft\nline\n\nOmega', fast: true },
  {
    id: 'mixed structural blocks',
    source:
      '# Heading\n\nA **bold** _em_ ~~del~~ `code` [link](https://example.test).\n\n3. First\n7. Second\n   - Nested\n\n> Quote\n> > Nested\n\n| a | b |\n|:---|---:|\n| x | y |\n\n```js\nconst x = 1;\n```',
    fast: true,
  },
  { id: 'front matter', source: '---\ntitle: "Quoted"\n---\n\nBody', fast: true },
  { id: 'formula', source: 'Inline $x^2$.\n\n$$\n\\frac{1}{2}\n$$', fast: true },
  { id: 'Mermaid', source: '```mermaid\ngraph TD; A-->B;\n```', fast: true },
  {
    id: 'footnotes and references',
    source: 'A[^n] [link][r].\n\n[^n]: Note\n\n[r]: <https://example.test> "Title"',
    fast: true,
  },
  { id: 'TOC and separators', source: '[TOC]\n\n# Heading\n\n------', fast: true },
  { id: 'setext', source: 'Heading\n=======\n\nNext\n----', fast: true },
  { id: 'empty document', source: '', fast: false },
  { id: 'empty fenced code', source: '```js\n\n```', fast: false },
  { id: 'empty table cell', source: '| a | b |\n|---|---|\n| | y |', fast: false },
  { id: 'normalization side effect', source: 'Alpha\n\nBeta', mutation: 'tail0', fast: true },
  {
    id: 'empty suffix before fallback',
    source: 'Alpha\n\nBeta',
    mutation: 'tail0empty',
    fast: false,
  },
  {
    id: 'unknown suffix before fallback',
    source: 'Alpha\n\nBeta',
    mutation: 'unknown',
    fast: false,
  },
  {
    id: 'generated table alignment',
    source: '| a | b |\n|:---|---:|\n| x | y |',
    mutation: 'table',
    fast: true,
  },
];

for (const nativeBinding of [false, true]) {
  for (const fixture of fixtures) {
    test(`linear native serializer preserves output and model effects (native=${nativeBinding}): ${fixture.id}`, async ({
      page,
    }) => {
      // Capture the shipped method before frame-host installs the new adapter.
      // This test-only counter distinguishes a real fast path from an all-fallback implementation.
      await page.addInitScript((nativeBinding) => {
        if (window === window.top) return;
        const target = window as unknown as NativeFixture;
        let instance: NativeFixture['editor'];
        if (nativeBinding) {
          const invoke = Reflect.apply;
          Reflect.apply = ((...args: Parameters<typeof Reflect.apply>) => {
            const capability = Reflect.get(window, '__MARKLYRA_NATIVE_SERIALIZATION__') as
              | { mapToMark: unknown; lines: unknown }
              | undefined;
            if (capability && args[0] === capability.mapToMark && args[1] === instance?.nodeMap)
              target.__fallbackCalls++;
            if (capability && args[0] === capability.lines) target.__nativeLineCalls++;
            return invoke(...args);
          }) as typeof Reflect.apply;
        }
        Object.defineProperty(window, 'editor', {
          configurable: true,
          get: () => instance,
          set(value: NativeFixture['editor']) {
            instance = value;
            if (!value?.nodeMap?.toMark || target.__nativeToMark) return;
            const original = value.nodeMap.toMark;
            target.__nativeToMark = original;
            target.__fallbackCalls = 0;
            target.__nativeLineCalls = 0;
            if (!nativeBinding)
              value.nodeMap.toMark = function () {
                target.__fallbackCalls++;
                return original.call(this);
              };
          },
        });
      }, nativeBinding);
      await page.goto('/');
      await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
      await page.evaluate(async (source) => {
        const editor = (window as unknown as Host).marklyraEditor;
        await editor.ready;
        await editor.load(source);
      }, fixture.source);
      const frame = page
        .frames()
        .find((candidate) => candidate.url().startsWith('http://127.0.0.1:4174/'));
      if (!frame) throw new Error('Missing runtime runtime');
      const result = await frame.evaluate((mutation) => {
        const target = window as unknown as NativeFixture;
        const map = target.editor.nodeMap;
        const roots = map.blocks.toArray();
        if (mutation === 'tail0' || mutation === 'tail0empty') roots[0]?.set('tail', 0);
        if (mutation === 'tail0empty') roots.at(-1)?.set('text', '');
        if (mutation === 'unknown') roots.at(-1)?.set('type', 'benchmark_unknown');
        if (mutation === 'table')
          roots.find((node) => node.get('type') === 'table')?.unset('userText');
        const nodes = map.allNodes.toArray();
        // Preserve relation/collection object identities, deep-copy value arrays.
        const clone = (value: unknown): unknown => {
          if (Array.isArray(value)) return value.map(clone);
          if (
            value &&
            typeof value === 'object' &&
            Object.getPrototypeOf(value) === Object.prototype
          )
            return Object.fromEntries(
              Object.entries(value).map(([key, entry]) => [key, clone(entry)]),
            );
          return value;
        };
        const saved = nodes.map((node) =>
          Object.fromEntries(
            Object.entries(node.attributes).map(([key, value]) => [key, clone(value)]),
          ),
        );
        const encode = (value: unknown): unknown => {
          if (value === undefined) return { undefined: true };
          if (value === map) return { nodeMap: true };
          if (!value || typeof value !== 'object') return value;
          const candidate = value as Record<string, unknown>;
          if (typeof candidate.cid === 'string') return { node: candidate.cid };
          if (Array.isArray(value)) return value.map(encode);
          if (typeof candidate.toArray === 'function')
            return {
              collection: (Reflect.apply(candidate.toArray, value, []) as NativeNode[]).map(
                (node) => node.cid,
              ),
            };
          return Object.fromEntries(
            Object.keys(candidate)
              .sort()
              .map((key) => [key, encode(candidate[key])]),
          );
        };
        const state = () =>
          JSON.stringify(
            nodes.map((node) => ({ id: node.cid, attributes: encode(node.attributes) })),
          );
        const before = state();
        if (!target.__nativeToMark) throw new Error('Missing original serializer capture');
        const original = target.__nativeToMark.call(map);
        const originalAfter = state();
        nodes.forEach((node, index) => {
          const attributes = saved[index];
          if (!attributes) throw new Error('Missing saved model');
          node.attributes = Object.fromEntries(
            Object.entries(attributes).map(([key, value]) => [key, clone(value)]),
          );
        });
        const restored = state();
        target.__fallbackCalls = 0;
        target.__nativeLineCalls = 0;
        const candidate = map.toMark();
        return {
          original,
          candidate,
          sameStart: before === restored,
          sameEffects: state() === originalAfter,
          fallbackCalls: target.__fallbackCalls,
          nativeLineCalls: target.__nativeLineCalls,
          roots: roots.length,
        };
      }, fixture.mutation);
      expect(result.sameStart).toBe(true);
      expect(result.candidate).toBe(result.original);
      expect(result.sameEffects).toBe(true);
      expect(result.fallbackCalls).toBe(nativeBinding ? 0 : fixture.fast ? 0 : 1);
      if (nativeBinding) expect(result.nativeLineCalls).toBe(result.roots);
    });
  }
}
