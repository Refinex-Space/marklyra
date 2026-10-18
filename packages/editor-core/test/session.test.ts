import { describe, expect, it, vi } from 'vitest';
import type { Patch, Selection } from '../src/index.js';
import { EditorSession, mapPosition, mapSelection, TransactionError } from '../src/index.js';

function cursor(session: EditorSession, position = session.state.source.length): void {
  session.setSelection({ anchor: position, head: position });
}

describe('lossless source transactions', () => {
  const source =
    '\uFEFF---\r\ntitle: Test\n---\r\n\r\n  007. item  \r\n| a | b |\n|---|---|\r\n```js\r\n const x = 1;\n```\r\n';

  it('preserves every character on load and no-op; exposes immutable state', () => {
    const session = new EditorSession(source);
    session.apply({ baseRevision: 0, patches: [] });
    expect(session.state.source).toBe(source);
    expect(session.state.revision).toBe(0);
    expect(Object.isFrozen(session.state)).toBe(true);
    expect(Object.isFrozen(session.state.selection)).toBe(true);
    expect(session.undo()).toBe(false);
  });

  it('applies multiple old-coordinate patches without reserializing untouched areas', () => {
    const session = new EditorSession(source);
    const start = source.indexOf('Test');
    const end = source.indexOf('item');
    const patches = [
      { from: start, to: start + 4, insert: '中文😀' },
      { from: end, to: end + 4, insert: 'changed' },
    ];
    session.apply({ baseRevision: 0, patches });
    expect(session.state.source).toBe(
      `${source.slice(0, start)}中文😀${source.slice(start + 4, end)}changed${source.slice(end + 4)}`,
    );
    expect(patches).toEqual([
      { from: start, to: start + 4, insert: '中文😀' },
      { from: end, to: end + 4, insert: 'changed' },
    ]);
    expect(session.undo()).toBe(true);
    expect(session.state.source).toBe(source);
    expect(session.redo()).toBe(true);
    expect(session.state.source).toContain('changed');
  });

  it.each([
    [{ from: -1, to: 0, insert: '' }],
    [{ from: 0, to: 100, insert: '' }],
    [{ from: 1, to: 0, insert: '' }],
    [{ from: 0.5, to: 1, insert: '' }],
    [
      { from: 0, to: 2, insert: 'X' },
      { from: 1, to: 3, insert: 'Y' },
    ],
    [
      { from: 2, to: 2, insert: 'X' },
      { from: 0, to: 0, insert: 'Y' },
    ],
    [
      { from: 1, to: 1, insert: 'X' },
      { from: 1, to: 1, insert: 'Y' },
    ],
    [{ from: 0, to: 0, insert: '\ud800' }],
    [{ from: 0, to: 0, insert: '\udc00' }],
  ])('rejects invalid patches atomically: %j', (...patches) => {
    const session = new EditorSession('abcdef');
    const before = session.state;
    const listener = vi.fn();
    session.subscribe(listener);
    expect(() => session.apply({ baseRevision: 0, patches: patches as Patch[] })).toThrow(
      TransactionError,
    );
    expect(session.state).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(session.undo()).toBe(false);
  });

  it('rejects stale revisions and invalid resulting selections before state/history mutation', () => {
    const session = new EditorSession('😀');
    session.execute({ type: 'insertText', text: 'a' });
    const state = session.state;
    expect(() => session.apply({ baseRevision: 0, patches: [] })).toThrow('Stale revision');
    expect(() =>
      session.apply({
        baseRevision: 1,
        patches: [{ from: 1, to: 1, insert: 'b' }],
        selection: { anchor: 100, head: 100 },
      }),
    ).toThrow();
    expect(() =>
      session.apply({ baseRevision: 1, patches: [{ from: 2, to: 2, insert: 'b' }] }),
    ).toThrow('surrogate');
    expect(() => session.setSelection({ anchor: 2, head: 2 })).toThrow('surrogate');
    expect(() => session.apply({ baseRevision: 1, patches: [], time: Number.NaN })).toThrow(
      'finite',
    );
    expect(session.state).toBe(state);
    session.undo();
    expect(session.state.source).toBe('😀');
  });

  it('delivers snapshots on content and selection changes and supports unsubscribe', () => {
    const session = new EditorSession('a');
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    cursor(session);
    expect(session.state.revision).toBe(0);
    session.execute({ type: 'insertText', text: 'b' });
    expect(listener.mock.calls.map((call) => call[0].source)).toEqual(['a', 'ab']);
    unsubscribe();
    session.load('c');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(session.state.revision).toBe(2);
    expect(session.state.selection).toEqual({ anchor: 0, head: 0 });
    expect(session.undo()).toBe(false);
  });
});

describe('selection mapping', () => {
  const patches = [
    { from: 2, to: 4, insert: 'abc' },
    { from: 6, to: 6, insert: 'xy' },
  ];

  it('supports explicit affinity and preserves backwards selections', () => {
    expect(mapPosition(0, patches)).toBe(0);
    expect(mapPosition(2, patches, 'left')).toBe(2);
    expect(mapPosition(2, patches)).toBe(5);
    expect(mapPosition(3, patches, 'left')).toBe(2);
    expect(mapPosition(4, patches)).toBe(5);
    expect(mapPosition(6, patches)).toBe(9);
    expect(mapPosition(7, patches)).toBe(10);
    expect(mapSelection({ anchor: 6, head: 2 }, patches)).toEqual({ anchor: 9, head: 2 });
    expect(mapSelection({ anchor: 2, head: 6 }, patches)).toEqual({ anchor: 2, head: 9 });
    expect(mapSelection({ anchor: 6, head: 6 }, patches)).toEqual({ anchor: 9, head: 9 });
  });

  it('maps at a shared boundary through both adjacent edits', () => {
    const adjacent = [
      { from: 0, to: 2, insert: 'x' },
      { from: 2, to: 2, insert: 'Y' },
    ];
    expect(mapPosition(2, adjacent)).toBe(2);
    expect(mapPosition(2, adjacent, 'left')).toBe(1);
  });
});

describe('history', () => {
  function typeAtTime(session: EditorSession, insert: string, time: number): void {
    const from = session.state.selection.head;
    session.apply({
      baseRevision: session.state.revision,
      patches: [{ from, to: from, insert }],
      group: 'typing',
      time,
    });
  }

  it('merges adjacent typing and restores the pre-edit caret', () => {
    const session = new EditorSession('a');
    cursor(session);
    typeAtTime(session, '中', 1_000);
    typeAtTime(session, '😀', 1_500);
    expect(session.state.source).toBe('a中😀');
    session.undo();
    expect(session.state.source).toBe('a');
    expect(session.state.selection).toEqual({ anchor: 1, head: 1 });
    expect(session.undo()).toBe(false);
    session.redo();
    expect(session.state.source).toBe('a中😀');
    expect(session.state.selection).toEqual({ anchor: 4, head: 4 });
  });

  it('separates distant typing, navigation, replacement, and composition groups', () => {
    const session = new EditorSession('');
    typeAtTime(session, 'a', 1);
    typeAtTime(session, 'b', 2_000);
    cursor(session, 0);
    cursor(session, 2);
    typeAtTime(session, 'c', 2_001);
    session.apply({
      baseRevision: session.state.revision,
      patches: [{ from: 3, to: 3, insert: '中文' }],
      group: 'composition',
      time: 2_002,
    });
    typeAtTime(session, 'd', 2_003);
    for (const expected of ['abc中文', 'abc', 'ab', 'a', '']) {
      expect(session.undo()).toBe(true);
      expect(session.state.source).toBe(expected);
    }
    expect(session.undo()).toBe(false);
  });

  it('restores reversed selections, rejects old revisions after history and clears redo on edits', () => {
    const session = new EditorSession('one\r\ntwo');
    const selected: Selection = { anchor: 7, head: 1 };
    session.setSelection(selected);
    session.execute({ type: 'insertText', text: 'X' });
    expect(session.state.source).toBe('oXo');
    session.undo();
    expect(session.state.selection).toEqual(selected);
    expect(session.state.source).toBe('one\r\ntwo');
    expect(session.state.revision).toBe(2);
    session.redo();
    expect(session.state.selection).toEqual({ anchor: 2, head: 2 });
    session.undo();
    session.execute({ type: 'insertText', text: 'Y' });
    expect(session.redo()).toBe(false);
    expect(session.state.source).toBe('oYo');
  });

  it('undoes adjacent deletion/replacement patches with colliding inverse insertion positions', () => {
    const session = new EditorSession('abcdef😀');
    session.setSelection({ anchor: 8, head: 0 });
    session.apply({
      baseRevision: 0,
      patches: [
        { from: 0, to: 1, insert: '' },
        { from: 1, to: 3, insert: '' },
        { from: 3, to: 5, insert: '中文' },
        { from: 6, to: 8, insert: 'X' },
      ],
    });
    expect(session.state.source).toBe('中文fX');
    expect(session.undo()).toBe(true);
    expect(session.state.source).toBe('abcdef😀');
    expect(session.state.selection).toEqual({ anchor: 8, head: 0 });
    expect(session.redo()).toBe(true);
    expect(session.state.source).toBe('中文fX');
    expect(session.state.revision).toBe(3);
  });

  it('owns history patches even if callers mutate the original transaction objects', () => {
    const session = new EditorSession('original');
    const patch = { from: 0, to: 8, insert: 'new' };
    const patches = [patch];
    session.apply({ baseRevision: 0, patches });
    patch.insert = 'tampered';
    patches.length = 0;
    session.undo();
    expect(session.state.source).toBe('original');
    session.redo();
    expect(session.state.source).toBe('new');
  });

  it('retains change text rather than 100 full copies of a 1 MiB document', () => {
    const source = 'a'.repeat(1024 * 1024);
    const session = new EditorSession(source);
    for (let index = 0; index < 100; index++) {
      const from = session.state.source.length;
      session.apply({
        baseRevision: session.state.revision,
        patches: [{ from, to: from, insert: 'x' }],
      });
    }
    expect(session.historyStats).toEqual({
      undoDepth: 100,
      redoDepth: 0,
      storedTextCodeUnits: 100,
    });
    expect(Object.isFrozen(session.historyStats)).toBe(true);
    for (let index = 0; index < 100; index++) expect(session.undo()).toBe(true);
    expect(session.state.source).toBe(source);
    expect(session.historyStats).toEqual({
      undoDepth: 0,
      redoDepth: 100,
      storedTextCodeUnits: 100,
    });
    for (let index = 0; index < 100; index++) expect(session.redo()).toBe(true);
    expect(session.state.source).toBe(source + 'x'.repeat(100));
    expect(session.state.revision).toBe(300);
    session.load('fresh');
    expect(session.historyStats).toEqual({ undoDepth: 0, redoDepth: 0, storedTextCodeUnits: 0 });
  });

  it('counts merged typing once and accounts for replaced text in inverse patches', () => {
    const session = new EditorSession('before');
    cursor(session);
    typeAtTime(session, '中', 1);
    typeAtTime(session, '😀', 2);
    expect(session.historyStats).toEqual({ undoDepth: 1, redoDepth: 0, storedTextCodeUnits: 3 });
    session.setSelection({ anchor: 6, head: 0 });
    session.execute({ type: 'insertText', text: 'after' });
    expect(session.historyStats).toEqual({ undoDepth: 2, redoDepth: 0, storedTextCodeUnits: 14 });
    session.undo();
    session.undo();
    expect(session.state.source).toBe('before');
    session.redo();
    session.redo();
    expect(session.state.source).toBe('after中😀');
  });
});

describe('editing commands', () => {
  it.each(['😀', '👨‍👩‍👧‍👦', '🇨🇳', '👍🏽', 'e\u0301', '\r\n', '가', '中'])(
    'deletes graphemes atomically: %j',
    (text) => {
      const backward = new EditorSession(`a${text}b`);
      cursor(backward, 1 + text.length);
      backward.execute({ type: 'deleteBackward' });
      expect(backward.state.source).toBe('ab');
      expect(backward.state.selection.head).toBe(1);
      backward.undo();
      expect(backward.state.source).toBe(`a${text}b`);
      const forward = new EditorSession(`a${text}b`);
      cursor(forward, 1);
      forward.execute({ type: 'deleteForward' });
      expect(forward.state.source).toBe('ab');
    },
  );

  it('handles caret inside a combining sequence and document boundaries', () => {
    const session = new EditorSession('e\u0301');
    cursor(session, 1);
    session.execute({ type: 'deleteBackward' });
    expect(session.state.source).toBe('');
    session.execute({ type: 'deleteBackward' });
    session.execute({ type: 'deleteForward' });
    expect(session.state.source).toBe('');
    expect(session.state.revision).toBe(1);
  });

  it.each([
    ['- item', '- item\n- '],
    ['009. item', '009. item\n010. '],
    ['2) item', '2) item\n3) '],
    ['  - [x] item', '  - [x] item\n  - [ ] '],
    ['> > quoted', '> > quoted\n> > '],
    ['> - item', '> - item\n> - '],
    ['- ', ''],
    ['  - ', '  '],
    ['> - ', '> '],
    ['> > ', '> '],
    ['> ', ''],
    ['plain\r\n- item', 'plain\r\n- item\r\n- '],
    ['plain\r- item', 'plain\r- item\r- '],
    ['```md\n- literal', '```md\n- literal\n'],
    ['---\ntitle: t\n- literal', '---\ntitle: t\n- literal\n'],
    ['---\ntitle: t\n---\n- list', '---\ntitle: t\n---\n- list\n- '],
  ])('continues or exits a bounded prefix: %j', (input, expected) => {
    const session = new EditorSession(input);
    cursor(session);
    session.execute({ type: 'insertParagraph' });
    expect(session.state.source).toBe(expected);
    expect(session.state.selection.head).toBe(expected.length);
    session.undo();
    expect(session.state.source).toBe(input);
  });

  it('splits a list within the text and selects local mixed EOL', () => {
    const session = new EditorSession('- one two\r\nlast\n');
    cursor(session, 6);
    session.execute({ type: 'insertParagraph' });
    expect(session.state.source).toBe('- one \r\n- two\r\nlast\n');
    expect(session.state.selection.head).toBe(10);
    session.execute({ type: 'insertLineBreak' });
    expect(session.state.source).toBe('- one \r\n- \r\ntwo\r\nlast\n');
  });

  it('wraps/unwraps inline ranges preserving backwards selections', () => {
    const session = new EditorSession('hello world');
    session.setSelection({ anchor: 5, head: 0 });
    session.execute({ type: 'toggleMark', marker: '**' });
    expect(session.state.source).toBe('**hello** world');
    expect(session.state.selection).toEqual({ anchor: 7, head: 2 });
    session.execute({ type: 'toggleMark', marker: '**' });
    expect(session.state.source).toBe('hello world');
    expect(session.state.selection).toEqual({ anchor: 5, head: 0 });
    cursor(session, 5);
    session.execute({ type: 'toggleMark', marker: '`' });
    expect(session.state.source).toBe('hello`` world');
    expect(session.state.selection).toEqual({ anchor: 6, head: 6 });
    session.execute({ type: 'toggleMark', marker: '`' });
    expect(session.state.source).toBe('hello world');
    expect(() => session.execute({ type: 'toggleMark', marker: '' })).toThrow();
  });

  it('unwraps a selection containing the markers', () => {
    const session = new EditorSession('**hello**');
    session.setSelection({ anchor: 0, head: 9 });
    session.execute({ type: 'toggleMark', marker: '**' });
    expect(session.state.source).toBe('hello');
    expect(session.state.selection).toEqual({ anchor: 0, head: 5 });
  });

  it('converts selected heading lines with BOM, quote and EOL preservation', () => {
    const session = new EditorSession('\uFEFFone\r\n> ## two\nend');
    session.setSelection({ anchor: 0, head: 14 });
    session.execute({ type: 'heading', level: 3 });
    expect(session.state.source).toBe('\uFEFF### one\r\n> ### two\nend');
    session.undo();
    expect(session.state.source).toBe('\uFEFFone\r\n> ## two\nend');
    cursor(session, 12);
    session.execute({ type: 'heading', level: 0 });
    expect(session.state.source).toBe('\uFEFFone\r\n> two\nend');
  });

  it('does not format fenced code or selected lines after an exclusive line-start endpoint', () => {
    const session = new EditorSession('one\ntwo\n```\n# literal\n```');
    session.setSelection({ anchor: 0, head: 4 });
    session.execute({ type: 'heading', level: 1 });
    expect(session.state.source).toBe('# one\ntwo\n```\n# literal\n```');
    cursor(session, session.state.source.indexOf('literal'));
    session.execute({ type: 'heading', level: 3 });
    expect(session.state.source).toBe('# one\ntwo\n```\n# literal\n```');
  });

  it('indents selected lines and outdents without replacing selected text or normalizing EOL', () => {
    const source = '\uFEFFone\r\n  two\nthree';
    const session = new EditorSession(source);
    session.setSelection({ anchor: 11, head: 1 });
    session.execute({ type: 'indent' });
    expect(session.state.source).toBe('\uFEFF\tone\r\n\t  two\nthree');
    expect(session.state.selection.anchor).toBeGreaterThan(session.state.selection.head);
    session.execute({ type: 'outdent' });
    expect(session.state.source).toBe(source);
    session.execute({ type: 'outdent' });
    expect(session.state.source).toBe('\uFEFFone\r\ntwo\nthree');
    session.undo();
    expect(session.state.source).toBe(source);
  });

  it('outdent leaves unindented selections unchanged; line-start endpoint is exclusive', () => {
    const session = new EditorSession('one\ntwo');
    session.setSelection({ anchor: 0, head: 4 });
    session.execute({ type: 'outdent' });
    expect(session.state.source).toBe('one\ntwo');
    session.execute({ type: 'indent' });
    expect(session.state.source).toBe('\tone\ntwo');
    expect(session.state.selection).toEqual({ anchor: 0, head: 5 });
  });

  it('keeps adjacent composition transactions in separate undo groups', () => {
    const session = new EditorSession();
    session.apply({
      baseRevision: 0,
      patches: [{ from: 0, to: 0, insert: '中' }],
      group: 'composition',
      time: 1,
    });
    session.apply({
      baseRevision: 1,
      patches: [{ from: 1, to: 1, insert: '文' }],
      group: 'composition',
      time: 2,
    });
    session.undo();
    expect(session.state.source).toBe('中');
    session.undo();
    expect(session.state.source).toBe('');
  });
});
