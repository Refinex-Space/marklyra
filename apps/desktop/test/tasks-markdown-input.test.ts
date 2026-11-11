import { describe, expect, it } from 'vitest';
import {
  checkboxOffsets,
  continueBlock,
  indentList,
  insertLink,
  pasteLink,
  type TextEdit,
  toggleCheckbox,
  toggleWrap,
} from '../src/features/tasks/model/markdown-input.js';

const run = (value: string, edit: TextEdit | null) =>
  edit ? value.slice(0, edit.from) + edit.text + value.slice(edit.to) : null;

describe('task Markdown typing', () => {
  it('wraps and unwraps a selection, keeping spaces outside the markers', () => {
    expect(run('a bc d', toggleWrap('a bc d', 2, 4, '**'))).toBe('a **bc** d');
    expect(run('a **bc** d', toggleWrap('a **bc** d', 4, 6, '**'))).toBe('a bc d');
    expect(run('a **bc** d', toggleWrap('a **bc** d', 2, 8, '**'))).toBe('a bc d');
    const spaced = toggleWrap('x bc y', 1, 5, '*');
    expect(run('x bc y', spaced)).toBe('x *bc* y');
    expect([spaced.selectionStart, spaced.selectionEnd]).toEqual([3, 5]);
    const empty = toggleWrap('ab', 1, 1, '`');
    expect(run('ab', empty)).toBe('a``b');
    expect(empty.selectionStart).toBe(2);
  });

  it('links words, or a selected URL, and pastes a URL over words as a link', () => {
    expect(run('go here', insertLink('go here', 3, 7))).toBe('go [here]()');
    expect(run('https://a.b', insertLink('https://a.b', 0, 11))).toBe('[](https://a.b)');
    expect(run('see docs', pasteLink('see docs', 4, 8, ' https://x.y/z '))).toBe(
      'see [docs](https://x.y/z)',
    );
    expect(pasteLink('see docs', 4, 8, 'plain text')).toBeNull();
    expect(pasteLink('see docs', 8, 8, 'https://x.y')).toBeNull();
  });

  it('continues bullets, numbers, checkboxes and quotes; an empty item ends the list', () => {
    const at = (value: string) => continueBlock(value, value.length, value.length);
    expect(run('- a', at('- a'))).toBe('- a\n- ');
    expect(run('  9) a', at('  9) a'))).toBe('  9) a\n  10) ');
    expect(run('- [x] done', at('- [x] done'))).toBe('- [x] done\n- [ ] ');
    expect(run('> said', at('> said'))).toBe('> said\n> ');
    expect(run('x\n- ', at('x\n- '))).toBe('x\n');
    expect(at('plain')).toBeNull();
    // Before the marker, Enter is an ordinary newline.
    expect(continueBlock('- a', 0, 0)).toBeNull();
  });

  it('nests and un-nests only list lines', () => {
    expect(run('- a\n- b', indentList('- a\n- b', 4, 7, false))).toBe('- a\n  - b');
    expect(run('- a\n  - b', indentList('- a\n  - b', 0, 9, true))).toBe('- a\n- b');
    expect(indentList('text', 0, 0, false)).toBeNull();
    expect(indentList('- a', 0, 0, true)).toBeNull();
  });

  it('finds checkboxes outside code and flips exactly one character', () => {
    const source = '- [ ] a\n```\n- [ ] code\n```\n  * [X] b\n';
    const offsets = checkboxOffsets(source);
    expect(offsets).toHaveLength(2);
    expect(toggleCheckbox(source, offsets[0] ?? -1)).toBe(source.replace('- [ ] a', '- [x] a'));
    expect(toggleCheckbox(source, offsets[1] ?? -1)).toBe(source.replace('[X] b', '[ ] b'));
    expect(toggleCheckbox(source, 0)).toBeNull();
  });
});
