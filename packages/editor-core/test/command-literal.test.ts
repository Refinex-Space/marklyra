import { describe, expect, it } from 'vitest';
import { EditorSession } from '../src/index.js';

describe('literal block boundaries during heading commands', () => {
  it('preserves frontmatter and both fence boundaries when formatting a mixed selection', () => {
    const source =
      '\uFEFF---\r\ntitle: 中文\n---\r\nplain\n```md\r\n# literal\n```\r\nafter\n~~~\n- raw\n~~~';
    const session = new EditorSession(source);
    session.setSelection({ anchor: source.length, head: 0 });
    session.execute({ type: 'heading', level: 2 });
    const expected = source.replace('plain', '## plain').replace('after', '## after');
    expect(session.state.source).toBe(expected);
    expect(session.state.selection.anchor).toBeGreaterThan(session.state.selection.head);
    expect(session.undo()).toBe(true);
    expect(session.state.source).toBe(source);
    expect(session.state.selection).toEqual({ anchor: source.length, head: 0 });
    expect(session.redo()).toBe(true);
    expect(session.state.source).toBe(expected);
  });

  it.each(['---\nkey: value\n---', '```md\n# literal\n```', '~~~\nraw\n~~~'])(
    'does not turn an opening literal delimiter into a heading: %j',
    (source) => {
      const session = new EditorSession(source);
      session.execute({ type: 'heading', level: 1 });
      expect(session.state.source).toBe(source);
      expect(session.undo()).toBe(false);
    },
  );

  it('keeps the original blank-line and exclusive trailing-line behavior', () => {
    const session = new EditorSession('one\r\n\r\nthree\r\n');
    session.setSelection({ anchor: 0, head: session.state.source.length });
    session.execute({ type: 'heading', level: 1 });
    expect(session.state.source).toBe('# one\r\n# \r\n# three\r\n');
    const empty = new EditorSession();
    empty.execute({ type: 'heading', level: 1 });
    expect(empty.state.source).toBe('# ');
  });

  it('requires a matching fence kind/length and permits ordinary text after the closer', () => {
    const source = '   ````md\nraw\n```\n~~~\n  `````  \nplain\n```not`a`fence\nend';
    const session = new EditorSession(source);
    session.setSelection({ anchor: 0, head: source.length });
    session.execute({ type: 'heading', level: 2 });
    expect(session.state.source).toBe(
      '   ````md\nraw\n```\n~~~\n  `````  \n## plain\n## ```not`a`fence\n## end',
    );
  });

  it('scans preceding literal context once when the selection begins inside the block', () => {
    const source = '\uFEFF---\nkey: value\n...\n~~~\ninside\n~~~\nafter';
    const session = new EditorSession(source);
    session.setSelection({ anchor: source.indexOf('inside'), head: source.length });
    session.execute({ type: 'heading', level: 3 });
    expect(session.state.source).toBe(source.replace('after', '### after'));
  });

  it('scans a large multiline heading selection once while retaining exact EOL and history', () => {
    const source = 'paragraph\r\n'.repeat(12_000);
    const session = new EditorSession(source);
    session.setSelection({ anchor: 0, head: source.length });
    const start = performance.now();
    session.execute({ type: 'heading', level: 2 });
    const elapsed = performance.now() - start;
    expect(session.state.source).toBe('## paragraph\r\n'.repeat(12_000));
    expect(elapsed).toBeLessThan(1000);
    expect(session.undo()).toBe(true);
    expect(session.state.source).toBe(source);
    expect(session.redo()).toBe(true);
    expect(session.state.source).toBe('## paragraph\r\n'.repeat(12_000));
  });
});
