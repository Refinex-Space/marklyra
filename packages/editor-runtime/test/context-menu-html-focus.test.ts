import { describe, expect, it, vi } from 'vitest';
import {
  type ContextSelection,
  restoreContextSelection,
} from '../src/runtime/context-menu-selection.js';
import type { LegacyEditor } from '../src/runtime/legacy-types.js';

function fixture() {
  const preview = { isConnected: true, focus: vi.fn() },
    block = { getAttribute: () => 'html', querySelector: () => preview },
    replay = vi.fn(),
    endpoints = { anchor: { node: {} as Node, offset: 2 }, head: { node: {} as Node, offset: 1 } },
    selection = { setBaseAndExtent: vi.fn() },
    area = {
      querySelectorAll: () => [block],
      contains: () => true,
      ownerDocument: { getSelection: () => selection },
    },
    editor = {
      writingArea: area,
      getNode: () => ({ get: () => 'html_block' }),
      undo: { exeCommand: replay },
    } as unknown as LegacyEditor,
    saved: ContextSelection = {
      bookmark: { type: 'cursor', id: 'html', focus: 'html_block' },
      focusCid: null,
      selected: true,
      ...endpoints,
    };
  return { preview, block, replay, selection, editor, saved, area };
}
describe('HTML menu receipt restores focus without a retired 100ms native replay', () => {
  it('focuses the unique current preview once and preserves directed DOM endpoints', () => {
    const f = fixture();
    restoreContextSelection(f.editor, f.saved);
    expect(f.preview.focus).toHaveBeenCalledOnce();
    expect(f.replay).not.toHaveBeenCalled();
    expect(f.selection.setBaseAndExtent).toHaveBeenCalledExactlyOnceWith(
      f.saved.anchor?.node,
      2,
      f.saved.head?.node,
      1,
    );
  });
  it.each(['different-cid', 'disconnected', 'ambiguous', 'other-receipt'])(
    'keeps original replay for %s instead of guessing a preview',
    (change) => {
      const f = fixture();
      if (change === 'different-cid') f.block.getAttribute = () => 'other';
      if (change === 'disconnected') f.preview.isConnected = false;
      if (change === 'ambiguous') f.area.querySelectorAll = () => [f.block, f.block];
      if (change === 'other-receipt')
        f.saved.bookmark = { type: 'cursor', id: 'html', start: 0, end: 0 };
      restoreContextSelection(f.editor, f.saved);
      expect(f.preview.focus).not.toHaveBeenCalled();
      expect(f.replay).toHaveBeenCalledExactlyOnceWith(f.saved.bookmark);
    },
  );
});
