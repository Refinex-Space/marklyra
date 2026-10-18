import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';
import { RuntimePreferences } from '../src/runtime/preferences.js';

function fixture() {
  const makeMirror = (lineNumbers = false, firstLineNumber = 1) => {
    const values = new Map<string, unknown>(
      Object.entries({
        lineNumbers,
        firstLineNumber,
        lineWrapping: true,
        lineWiseCopyCut: false,
        indentUnit: 4,
        tabSize: 4,
        autoCloseBrackets: true,
        autoCloseTags: true,
      }),
    );
    const cm = {
      getOption: (key: string) => values.get(key),
      setOption: vi.fn((key: string, value: unknown) => {
        values.set(key, value);
      }),
    };
    return { values, cm };
  };
  const source = makeMirror(true);
  const fence = makeMirror();
  const local = makeMirror(true, 8);
  const math = makeMirror();
  const html = makeMirror();
  const classes = new Set<string>(['unrelated']);
  const outer = Object.fromEntries(
    ['fence', 'local', 'mock-local', 'mock-plain'].map((cid) => {
      const tokens = new Set(cid === 'local' ? ['md-fences-with-lineno'] : []);
      return [
        cid,
        {
          tokens,
          getAttribute: () => cid,
          classList: {
            contains: (name: string) => tokens.has(name),
            toggle: vi.fn((name: string, on: boolean) => {
              if (on) tokens.add(name);
              else tokens.delete(name);
            }),
          },
        },
      ] as const;
    }),
  );
  const style = { fontSize: '17px' };
  vi.stubGlobal('document', { documentElement: { style } });
  const runtime = {
    _options: { untouched: 'value', noLineWrapping: false },
    CodeMirror: { keyMap: { default: { 'Shift-Tab': 'original' } } },
    File: { option: { autoPairExtendSymbol: false, noLineWrapping: false } },
    editor: {
      getNode: (cid: string) => ({ get: () => (cid === 'local' ? 'numbered' : 'javascript') }),
      writingArea: {
        querySelectorAll: () => Object.values(outer),
        classList: {
          contains: (name: string) => classes.has(name),
          toggle: (name: string, on: boolean) => {
            if (on) classes.add(name);
            else classes.delete(name);
          },
        },
      },
      sourceView: { cm: source.cm },
      fences: {
        queue: { fence: fence.cm, local: local.cm },
        getOptionsFromFencesAttr: (lang: string) =>
          lang === 'numbered' ? { lineNumbers: true, firstLineNumber: 8 } : {},
      },
      mathBlock: { currentCm: math.cm },
      htmlBlock: { currentCm: html.cm },
    },
  } as unknown as LegacyGlobals;
  const adapter = new RuntimePreferences({ runtime, composing: () => false });
  return { runtime, adapter, source, fence, local, math, html, classes, outer };
}
afterEach(() => vi.unstubAllGlobals());

describe('initial code display and clipboard configuration', () => {
  it('initializes each original CM scope and its startup mock-fence class', () => {
    const f = fixture();
    f.adapter.apply({
      showLineNumbersForFence: true,
      noLineWrapping: true,
      lineWiseCopyCut: true,
    });
    expect(f.source.values.get('lineNumbers')).toBe(true);
    expect(f.source.values.get('lineWrapping')).toBe(true);
    expect(f.html.values.get('lineNumbers')).toBe(false);
    for (const mirror of [f.fence, f.local, f.math])
      expect(mirror.values.get('lineNumbers')).toBe(true);
    for (const mirror of [f.fence, f.local, f.math, f.html])
      expect(mirror.values.get('lineWrapping')).toBe(false);
    for (const mirror of [f.source, f.fence, f.local, f.math, f.html])
      expect(mirror.values.get('lineWiseCopyCut')).toBe(true);
    expect(f.local.values.get('firstLineNumber')).toBe(8);
    expect(f.classes).toEqual(new Set(['unrelated', 'fences-no-line-wrapping']));
    expect(f.runtime._options).toMatchObject({
      showLineNumbersForFence: true,
      noLineWrapping: true,
      lineWiseCopyCut: true,
    });
    expect(f.runtime._options).not.toHaveProperty('no_line_wrapping');
    for (const element of Object.values(f.outer))
      expect(element.tokens.has('md-fences-with-lineno')).toBe(true);
  });

  it('does not disable a document-local numbered fence when the global default is false', () => {
    const f = fixture();
    f.adapter.apply({ showLineNumbersForFence: false });
    expect(f.fence.values.get('lineNumbers')).toBe(false);
    expect(f.math.values.get('lineNumbers')).toBe(false);
    expect(f.local.values.get('lineNumbers')).toBe(true);
    expect(f.local.values.get('firstLineNumber')).toBe(8);
    expect(f.outer.local?.tokens.has('md-fences-with-lineno')).toBe(true);
    expect(f.outer['mock-local']?.tokens.has('md-fences-with-lineno')).toBe(false);
  });

  it('keeps existing instance options and the startup class on a later imperative update', () => {
    const f = fixture();
    f.adapter.apply({ noLineWrapping: true, lineWiseCopyCut: true });
    for (const mirror of [f.source, f.fence, f.local, f.math, f.html])
      mirror.cm.setOption.mockClear();
    f.adapter.apply({
      noLineWrapping: true,
      lineWiseCopyCut: false,
      codeIndentSize: 2,
    });
    expect(f.runtime.File?.option).toMatchObject({
      showLineNumbersForFence: false,
      noLineWrapping: true,
      lineWiseCopyCut: false,
    });
    expect(f.runtime._options.noLineWrapping).toBe(true);
    expect(f.classes.has('fences-no-line-wrapping')).toBe(true);
    expect(f.fence.values.get('lineNumbers')).toBe(false);
    for (const mirror of [f.source, f.fence, f.local, f.math, f.html]) {
      expect(mirror.values.get('lineWiseCopyCut')).toBe(true);
      expect(mirror.cm.setOption).not.toHaveBeenCalled();
    }
  });

  it.each(['showLineNumbersForFence', 'noLineWrapping'] as const)(
    'rejects changing initialization-only %s before any live setting changes',
    (key) => {
      const f = fixture();
      f.adapter.apply({});
      const before = Object.getOwnPropertyDescriptors(f.runtime.File?.option);
      for (const mirror of [f.source, f.fence, f.local, f.math, f.html])
        mirror.cm.setOption.mockClear();
      expect(() => f.adapter.apply({ [key]: true, lineWiseCopyCut: true })).toThrow('重新创建');
      expect(Object.getOwnPropertyDescriptors(f.runtime.File?.option)).toEqual(before);
      for (const mirror of [f.source, f.fence, f.local, f.math, f.html])
        expect(mirror.cm.setOption).not.toHaveBeenCalled();
      expect(f.classes).toEqual(new Set(['unrelated']));
    },
  );

  it('restores partial CM changes, property descriptors and startup CSS on failure, then retries', () => {
    const f = fixture();
    f.classes.add('fences-no-line-wrapping');
    const oldFile = Object.getOwnPropertyDescriptors(f.runtime.File?.option);
    const oldOptions = Object.getOwnPropertyDescriptors(f.runtime._options);
    const original = f.html.cm.setOption.getMockImplementation();
    if (!original) throw Error('Missing fixture setter');
    f.html.cm.setOption.mockImplementation((key, value) => {
      original(key, value);
      if (key === 'lineWiseCopyCut' && value === true) throw Error('late CM failure');
    });
    expect(() => f.adapter.apply({ lineWiseCopyCut: true })).toThrow('late CM failure');
    expect(Object.getOwnPropertyDescriptors(f.runtime.File?.option)).toEqual(oldFile);
    expect(Object.getOwnPropertyDescriptors(f.runtime._options)).toEqual(oldOptions);
    expect(f.classes.has('fences-no-line-wrapping')).toBe(true);
    for (const mirror of [f.source, f.fence, f.local, f.math, f.html])
      expect(mirror.values.get('lineWiseCopyCut')).toBe(false);
    f.html.cm.setOption.mockImplementation(original);
    f.adapter.apply({ showLineNumbersForFence: true });
    expect(f.fence.values.get('lineNumbers')).toBe(true);
    expect(f.classes.has('fences-no-line-wrapping')).toBe(false);
  });

  it('rejects unproven fence attributes before mutating global settings or views', () => {
    const f = fixture();
    if (!f.runtime.editor) throw Error('Missing fixture editor');
    f.runtime.editor.getNode = () => undefined;
    const before = { ...f.runtime.File?.option };
    expect(() => f.adapter.apply({ showLineNumbersForFence: true })).toThrow('局部显示配置');
    expect(f.runtime.File?.option).toEqual(before);
    expect(f.source.cm.setOption).not.toHaveBeenCalled();
    expect(f.classes).toEqual(new Set(['unrelated']));
  });

  it('rolls back earlier fence decorations and CM options when a later decoration fails', () => {
    const f = fixture();
    const target = f.outer['mock-local'];
    if (!target) throw Error('Missing mock fence');
    const original = target.classList.toggle.getMockImplementation();
    if (!original) throw Error('Missing class setter');
    target.classList.toggle.mockImplementation((name, on) => {
      original(name, on);
      if (on) throw Error('view decoration failed');
    });
    expect(() => f.adapter.apply({ showLineNumbersForFence: true })).toThrow('view decoration');
    expect(f.fence.values.get('lineNumbers')).toBe(false);
    expect(f.local.values.get('lineNumbers')).toBe(true);
    expect(f.outer.fence?.tokens.has('md-fences-with-lineno')).toBe(false);
    expect(f.outer.local?.tokens.has('md-fences-with-lineno')).toBe(true);
    expect(target.tokens.has('md-fences-with-lineno')).toBe(false);
    target.classList.toggle.mockImplementation(original);
    f.adapter.apply({ noLineWrapping: true });
    expect(f.classes.has('fences-no-line-wrapping')).toBe(true);
  });
});
