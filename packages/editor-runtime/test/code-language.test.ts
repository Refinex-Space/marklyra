import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pendingCodeLanguage } from '../src/runtime/code-language.js';
import type { LegacyEditor } from '../src/runtime/legacy-types.js';

class Field {
  isContentEditable = true;
  isConnected = true;
  language = true;
  cid: string | null = 'code';
  matches() {
    return this.language;
  }
  closest() {
    return this;
  }
  getAttribute() {
    return this.cid;
  }
}
beforeEach(() => vi.stubGlobal('HTMLElement', Field));
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const field = new Field(),
    area = { ownerDocument: { activeElement: field }, contains: () => true },
    editor = {
      writingArea: area,
      sourceView: { inSourceMode: false },
      getNode: () => ({ get: () => 'fences' }),
    } as unknown as LegacyEditor;
  return { field, area, editor };
}
describe('passive language state ownership', () => {
  it('does not calculate editability for ordinary writing-area focus', () => {
    const f = fixture();
    f.field.language = false;
    const editable = vi.fn(() => {
      throw new Error('Ordinary body focus must not trigger computed editability');
    });
    Object.defineProperty(f.field, 'isContentEditable', { get: editable });
    expect(pendingCodeLanguage(f.editor)).toBe(false);
    expect(editable).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'still verifies computed editability for a language control: %s',
    (value) => {
      const f = fixture();
      const editable = vi.fn(() => value);
      Object.defineProperty(f.field, 'isContentEditable', { get: editable });
      expect(pendingCodeLanguage(f.editor)).toBe(value);
      expect(editable).toHaveBeenCalledOnce();
    },
  );
  it('recognizes the current editable language control independently of boolean attribute spelling', () => {
    const f = fixture();
    expect(pendingCodeLanguage(f.editor)).toBe(true);
  });
  it.each([
    'foreign',
    'readonly',
    'other-field',
    'detached',
    'missing-cid',
    'source',
    'wrong-model',
  ])('does not suppress an ordinary sync for %s', (change) => {
    const f = fixture();
    if (change === 'foreign') f.area.contains = () => false;
    if (change === 'readonly') f.field.isContentEditable = false;
    if (change === 'other-field') f.field.language = false;
    if (change === 'detached') f.field.isConnected = false;
    if (change === 'missing-cid') f.field.cid = null;
    if (change === 'source') f.editor.sourceView.inSourceMode = true;
    if (change === 'wrong-model')
      f.editor.getNode = () =>
        ({ get: () => 'paragraph' }) as unknown as ReturnType<LegacyEditor['getNode']>;
    expect(pendingCodeLanguage(f.editor)).toBe(false);
  });
});
