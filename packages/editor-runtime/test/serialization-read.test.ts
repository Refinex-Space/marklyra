import { describe, expect, it } from 'vitest';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';
import { RuntimeSerializationRead } from '../src/runtime/serialization-read.js';

class Node {
  calls = 0;
  attributes: Record<string, unknown>;
  constructor(
    readonly cid: string,
    text: string,
  ) {
    this.attributes = { type: 'paragraph', text, children: { toArray: () => [] } };
  }
  getFirstBrother() {
    return this;
  }
  toMark() {
    this.calls++;
    // A deliberately stateful serializer: serializing twice is observably wrong.
    const text = String(this.attributes.text);
    this.attributes.serialized = this.calls;
    return text;
  }
}
function fixture(crlf = false, finalNewline = false) {
  const first = new Node('a', '中文😀');
  const second = new Node('b', 'second');
  let nodes = [first, second];
  first.attributes.after = second;
  let fallbacks = 0;
  const map = {
    blocks: { sortedFirst: () => nodes[0] },
    toMark: () => {
      fallbacks++;
      return nodes.map((n) => n.toMark()).join(crlf ? '\r\n' : '\n');
    },
  };
  const editor = {
    nodeMap: map,
    sourceView: { inSourceMode: false },
    warpContentWithOption: (source: string) =>
      source + (finalNewline ? (crlf ? '\r\n' : '\n') : ''),
    getMarkdown: () => editor.warpContentWithOption(editor.nodeMap.toMark()),
  };
  const runtime = { editor, File: { useCRLF: crlf } } as unknown as LegacyGlobals;
  const reader = new RuntimeSerializationRead(runtime);
  return {
    reader,
    editor,
    runtime,
    get nodes() {
      return nodes;
    },
    get fallbacks() {
      return fallbacks;
    },
    replace() {
      nodes = [new Node('new', '中文😀\nsecond')];
    },
  };
}

describe('synchronous native serializer handoff', () => {
  it.each([false, true])(
    'preserves UTF16 ranges and final newline (CRLF=%s) with one model effect',
    (crlf) => {
      const f = fixture(crlf, true);
      const result = f.reader.read(f.editor.getMarkdown);
      expect(result.blocks?.map((b) => b.text).join('')).toBe(result.canonical);
      expect(result.blocks?.[1]?.from).toBe('中文😀'.length + (crlf ? 2 : 1));
      expect(result.blocks?.at(-1)?.to).toBe(result.canonical.length);
      expect(f.nodes.map((n) => n.calls)).toEqual([1, 1]);
      expect(f.nodes.map((n) => n.attributes.serialized)).toEqual([1, 1]);
      expect(f.fallbacks).toBe(0);
    },
  );
  it('serializes again and uses new identities even when canonical text is unchanged', () => {
    const f = fixture();
    const before = f.reader.read(f.editor.getMarkdown);
    f.replace();
    const after = f.reader.read(f.editor.getMarkdown);
    expect(after.canonical).toBe(before.canonical);
    expect(after.blocks?.map((b) => b.id)).toEqual(['new']);
    expect(f.nodes[0]?.calls).toBe(1);
  });
  it('never reuses a previous receipt when a read does not serialize', () => {
    const f = fixture();
    const before = f.reader.read(f.editor.getMarkdown);
    expect(f.reader.read(() => before.canonical).blocks).toBeNull();
  });
  it('rejects multiple serializer invocations even if they yield the same string', () => {
    const f = fixture();
    expect(
      f.reader.read(() => {
        f.editor.getMarkdown();
        return f.editor.getMarkdown();
      }).blocks,
    ).toBeNull();
    expect(f.nodes.map((n) => n.calls)).toEqual([2, 2]);
  });
  it('uses the original fallback without manufacturing block contributions', () => {
    const f = fixture();
    const last = f.nodes.at(-1);
    if (!last) throw Error('Missing fixture node');
    last.attributes.text = '';
    expect(f.reader.read(f.editor.getMarkdown).blocks).toBeNull();
    expect(f.fallbacks).toBe(1);
    expect(f.nodes.map((n) => n.calls)).toEqual([1, 1]);
  });
  it('rejects source mode and differently transformed text', () => {
    const f = fixture();
    f.editor.sourceView.inSourceMode = true;
    expect(f.reader.read(f.editor.getMarkdown).blocks).toBeNull();
    f.editor.sourceView.inSourceMode = false;
    expect(f.reader.read(() => f.editor.getMarkdown() + 'different').blocks).toBeNull();
  });
  it('clears failed scopes, with no receipt leaking into the next read', () => {
    const f = fixture();
    expect(() =>
      f.reader.read(() => {
        f.editor.getMarkdown();
        throw Error('failed');
      }),
    ).toThrow('failed');
    expect(f.reader.read(() => '中文😀\nsecond').blocks).toBeNull();
    expect(f.reader.read(f.editor.getMarkdown).blocks).toHaveLength(2);
  });
  it('isolates nested reads and invalidates the outer scope', () => {
    const f = fixture();
    const outer = f.reader.read(() => {
      expect(f.reader.read(f.editor.getMarkdown).blocks).toHaveLength(2);
      return f.editor.getMarkdown();
    });
    expect(outer.blocks).toBeNull();
    expect(f.reader.read(f.editor.getMarkdown).blocks).toHaveLength(2);
  });
  it('rejects an editor replacement after serialization', () => {
    const f = fixture();
    expect(
      f.reader.read(() => {
        const text = f.editor.getMarkdown();
        delete f.runtime.editor;
        return text;
      }).blocks,
    ).toBeNull();
  });
  it('does not grant precise ranges to distinct nodes sharing one identity', () => {
    const f = fixture();
    const first = f.nodes[0];
    if (!first) throw Error('Missing fixture node');
    first.attributes.after = new Node(first.cid, 'second');
    expect(f.reader.read(f.editor.getMarkdown).blocks).toBeNull();
  });
});
