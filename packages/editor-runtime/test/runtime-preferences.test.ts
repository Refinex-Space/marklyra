import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';
import { RuntimePreferences } from '../src/runtime/preferences.js';

afterEach(() => vi.unstubAllGlobals());

describe('runtime preference failure boundaries', () => {
  function fixture() {
    const style = { fontSize: '17px' };
    vi.stubGlobal('document', { documentElement: { style } });
    const source = new Map<string, unknown>([['autoCloseBrackets', true]]);
    const fence = new Map<string, unknown>([
      ['autoCloseBrackets', true],
      ['autoCloseTags', true],
    ]);
    let failRollback = false;
    const classes = new Set<string>();
    const runtime = {
      _options: { existing: 'preserved' },
      CodeMirror: { keyMap: { default: { 'Shift-Tab': 'original' } } },
      File: { option: { noPairingMatch: false, autoPairExtendSymbol: false } },
      editor: {
        writingArea: {
          querySelectorAll: () => [],
          classList: {
            contains: (name: string) => classes.has(name),
            toggle: (name: string, enabled: boolean) => {
              if (enabled) classes.add(name);
              else classes.delete(name);
            },
          },
        },
        getNode: () => ({ get: () => '' }),
        sourceView: {
          cm: {
            getOption: (key: string) => source.get(key),
            setOption: (key: string, value: unknown) => {
              if (failRollback && value === true) throw new Error('rollback failed');
              source.set(key, value);
            },
          },
        },
        fences: {
          getOptionsFromFencesAttr: () => ({}),
          queue: {
            test: {
              getOption: (key: string) => fence.get(key),
              setOption: (key: string, value: unknown) => {
                if (key === 'autoCloseTags' && value === false)
                  throw new Error('CodeMirror rejected option');
                fence.set(key, value);
              },
            },
          },
        },
      },
    } as unknown as LegacyGlobals;
    return {
      runtime,
      style,
      source,
      fence,
      failRestoration: () => {
        failRollback = true;
      },
    };
  }

  it('restores property presence, font and previously changed CodeMirrors on failure', () => {
    const { runtime, style, source, fence } = fixture();
    const original = { ...runtime.File?.option };
    const adapter = new RuntimePreferences({ runtime, composing: () => false });
    expect(() =>
      adapter.apply({ useCustomFontSize: true, customFontSize: 20, noPairingMatch: true }),
    ).toThrow('CodeMirror rejected option');
    expect(runtime.File?.option).toEqual(original);
    expect(runtime._options).toEqual({ existing: 'preserved' });
    expect(style.fontSize).toBe('17px');
    expect(source.get('autoCloseBrackets')).toBe(true);
    expect([...fence.values()]).toEqual([true, true]);
    expect(runtime.CodeMirror?.keyMap.default['Shift-Tab']).toBe('original');
  });

  it('injects initial width into existing mirrors once, then changes only the next-instance option', () => {
    const { runtime, source, fence } = fixture();
    const html = new Map<string, unknown>([
      ['autoCloseBrackets', true],
      ['autoCloseTags', true],
    ]);
    if (!runtime.editor) throw new Error('fixture editor');
    runtime.editor.htmlBlock = {
      currentCm: {
        getOption: (key) => html.get(key),
        setOption: (key, value) => {
          html.set(key, value);
        },
      },
    };
    const adapter = new RuntimePreferences({ runtime, composing: () => false });
    adapter.apply({ codeIndentSize: 2, shiftTabAutoIndent: true });
    for (const mirror of [source, fence, html]) {
      expect(mirror.get('indentUnit')).toBe(2);
      expect(mirror.get('tabSize')).toBe(2);
    }
    expect(html.get('autoCloseTags')).toBe(true);
    expect(runtime.CodeMirror?.keyMap.default['Shift-Tab']).toBe('indentAuto');
    adapter.apply({ codeIndentSize: 5, shiftTabAutoIndent: false });
    expect(runtime.File?.option.codeIndentSize).toBe(5);
    expect(runtime._options.codeIndentSize).toBe(5);
    expect(runtime.CodeMirror?.keyMap.default['Shift-Tab']).toBe('indentLess');
    for (const mirror of [source, fence, html]) {
      expect(mirror.get('indentUnit')).toBe(2);
      expect(mirror.get('tabSize')).toBe(2);
    }
  });

  it('keeps initial width injection pending after failure and restores absent keymap properties', () => {
    const { runtime, source, fence } = fixture();
    const map = runtime.CodeMirror?.keyMap.default;
    if (!map) throw new Error('fixture CodeMirror');
    delete map['Shift-Tab'];
    const adapter = new RuntimePreferences({ runtime, composing: () => false });
    expect(() =>
      adapter.apply({ codeIndentSize: 2, noPairingMatch: true, shiftTabAutoIndent: true }),
    ).toThrow('CodeMirror rejected option');
    expect(Object.hasOwn(map, 'Shift-Tab')).toBe(false);
    expect(source.get('indentUnit')).toBeUndefined();
    adapter.apply({ codeIndentSize: 3 });
    expect(source.get('indentUnit')).toBe(3);
    expect(fence.get('tabSize')).toBe(3);
    expect(map['Shift-Tab']).toBe('indentLess');
  });

  it('rejects unavailable CodeMirror and restores preferences when the keymap rejects a write', () => {
    const { runtime, style } = fixture();
    const original = { ...runtime.File?.option };
    const codeMirror = runtime.CodeMirror;
    delete runtime.CodeMirror;
    expect(() => new RuntimePreferences({ runtime, composing: () => false }).apply({})).toThrow(
      '当前运行资源缺少代码缩进快捷键能力',
    );
    if (!codeMirror) throw new Error('fixture CodeMirror');
    runtime.CodeMirror = codeMirror;
    Object.defineProperty(codeMirror.keyMap.default, 'Shift-Tab', {
      value: 'locked',
      writable: false,
    });
    expect(() =>
      new RuntimePreferences({ runtime, composing: () => false }).apply({ codeIndentSize: 2 }),
    ).toThrow(TypeError);
    expect(runtime.File?.option).toEqual(original);
    expect(runtime._options).toEqual({ existing: 'preserved' });
    expect(style.fontSize).toBe('17px');
    expect(codeMirror.keyMap.default['Shift-Tab']).toBe('locked');
  });

  it('reports a failed restoration while still restoring other settings', () => {
    const { runtime, style, fence, failRestoration } = fixture();
    failRestoration();
    const adapter = new RuntimePreferences({ runtime, composing: () => false });
    expect(() => adapter.apply({ noPairingMatch: true })).toThrow(AggregateError);
    expect(runtime._options).toEqual({ existing: 'preserved' });
    expect(style.fontSize).toBe('17px');
    expect([...fence.values()]).toEqual([true, true]);
  });

  it('rejects composition and unavailable cache reset before touching the document', () => {
    const { runtime, style } = fixture();
    const original = { ...runtime.File?.option };
    expect(() => new RuntimePreferences({ runtime, composing: () => true }).apply({})).toThrow(
      '请先完成输入法候选',
    );
    expect(() =>
      new RuntimePreferences({ runtime, composing: () => false }).apply({
        autoPairExtendSymbol: true,
      }),
    ).toThrow('当前运行资源缺少已验证的配对配置能力');
    expect(runtime.File?.option).toEqual(original);
    expect(runtime._options).toEqual({ existing: 'preserved' });
    expect(style.fontSize).toBe('17px');
  });
});
