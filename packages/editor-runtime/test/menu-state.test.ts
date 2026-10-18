import { describe, expect, it, vi } from 'vitest';
import { marklyraMenuState, menuStyles } from '../src/menu-state.js';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';
import { readRuntimeMenuState } from '../src/runtime/menu-state.js';

function fixture() {
  const style = { inline: ['strong'], block: ['paragraph'], canContainInline: false };
  const sync = vi.fn(),
    putBookmark = vi.fn(),
    focus = vi.fn();
  const file = { isLocked: false, isFocusMode: true, isTypeWriterMode: false, sync };
  const editor = {
    sourceView: {
      inSourceMode: false,
      cm: { doc: { history: { done: [], undone: [] }, historySize: () => ({ undo: 0, redo: 1 }) } },
    },
    undo: { hasUndo: () => true, hasRedo: () => false },
    stylize: {
      buildBookmark: () => style,
      putBookmark,
      CONST: { NormalBlockMap: { paragraph: 'Paragraph' } },
    },
    writingArea: { focus, ownerDocument: { body: { classList: { contains: () => false } } } },
  };
  return {
    runtime: { editor, File: file } as unknown as LegacyGlobals,
    editor,
    file,
    style,
    sync,
    putBookmark,
    focus,
  };
}
describe('original menu presentation facts', () => {
  it('reads current modes/style/history without synchronizing, storing bookmarks or focusing', () => {
    const f = fixture(),
      before = JSON.stringify([f.style, f.file, f.editor.sourceView]);
    const value = readRuntimeMenuState(f.runtime);
    expect(value).toMatchObject({
      focusMode: true,
      typewriterMode: false,
      sourceMode: false,
      inlineAllowed: true,
      blockAllowed: true,
      inlineStyles: ['strong'],
      blockStyles: ['paragraph'],
      canUndo: true,
      canRedo: false,
    });
    expect(JSON.stringify([f.style, f.file, f.editor.sourceView])).toBe(before);
    expect(f.sync).not.toHaveBeenCalled();
    expect(f.putBookmark).not.toHaveBeenCalled();
    expect(f.focus).not.toHaveBeenCalled();
    (value.inlineStyles as string[]).push('em');
    expect(f.style.inline).toEqual(['strong']);
  });
  it('reads Source CodeMirror history and disables the original Paragraph/Format groups', () => {
    const f = fixture();
    f.editor.sourceView.inSourceMode = true;
    f.editor.sourceView.cm.doc.history.undone.push({} as never);
    expect(readRuntimeMenuState(f.runtime)).toMatchObject({
      sourceMode: true,
      canUndo: false,
      canRedo: true,
      inlineAllowed: false,
      blockAllowed: false,
      inlineStyles: [],
      blockStyles: [],
    });
  });
  it('does not enable inline formatting in a raw block or inside inline math', () => {
    const f = fixture();
    f.style.block = ['fences'];
    f.style.canContainInline = true;
    expect(readRuntimeMenuState(f.runtime)).toMatchObject({
      inlineAllowed: false,
      blockAllowed: false,
    });
    f.style.block = ['paragraph'];
    f.style.canContainInline = false;
    f.style.inline = ['inline_math'];
    expect(readRuntimeMenuState(f.runtime).inlineAllowed).toBe(false);
    f.file.isLocked = true;
    expect(readRuntimeMenuState(f.runtime).blockAllowed).toBe(false);
  });
  it('selection-only CodeMirror history records do not enable Undo', () => {
    const f = fixture();
    f.editor.sourceView.inSourceMode = true;
    f.editor.sourceView.cm.doc.history.done.push({ ranges: [] } as never);
    expect(readRuntimeMenuState(f.runtime).canUndo).toBe(false);
  });
  it('validates finite flags, bounded unique styles and copies accepted arrays', () => {
    const input = readRuntimeMenuState(fixture().runtime),
      accepted = marklyraMenuState(input);
    expect(accepted).toEqual(input);
    expect(accepted.inlineStyles).not.toBe(input.inlineStyles);
    for (const bad of [
      { ...input, action: 'delete' },
      { ...input, sourceMode: 1 },
      { ...input, inlineStyles: ['strong', 'strong'] },
      { ...input, inlineStyles: ['unknown'] },
      { ...input, blockStyles: ['../file'] },
    ])
      expect(() => marklyraMenuState(bad)).toThrow();
    expect(menuStyles(['strong', 'unknown', 'strong', 1], 'inline')).toEqual(['strong']);
  });
});
