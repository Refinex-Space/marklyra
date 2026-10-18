import { SourceMirror } from '@marklyra/editor-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type CodeLineRange, captureCodeLineCut } from '../src/runtime/code-line-source.js';
import type { LegacyEditor } from '../src/runtime/legacy-types.js';

function fixture(lines = ['Alpha', 'Bravo', 'Charlie'], marker = '```') {
  let value = lines.join('\r\n');
  const doc = {};
  const cm = {
    doc,
    getValue: () => value,
    getLine: (line: number) => lines[line],
    indexFromPos: (pos: { line: number; ch: number }) =>
      lines.slice(0, pos.line).reduce((sum, line) => sum + line.length + 2, 0) + pos.ch,
  };
  let parent: string | undefined;
  const node = { get: (key: string) => (key === 'type' ? 'fences' : parent) };
  const editor = {
    sourceView: { inSourceMode: false },
    fences: { queue: { fence: cm } },
    getNode: () => node,
  };
  const text = `${marker}text\r\n${value}\r\n${marker}\r\n\r\n`,
    prefix = 'Before\r\n\r\n',
    canonical = `${prefix}${text}Tail`,
    block = { id: 'fence', from: prefix.length, to: prefix.length + text.length, text };
  return {
    cm,
    editor,
    node,
    block,
    canonical,
    setValue: (next: string) => {
      value = next;
    },
    setParent: () => {
      parent = 'container';
    },
    capture: (ranges: readonly CodeLineRange[], base = canonical, blocks = [block]) =>
      captureCodeLineCut(
        editor as unknown as LegacyEditor,
        base,
        blocks,
        'fence',
        cm as unknown as NonNullable<LegacyEditor['sourceView']['cm']>,
        ranges,
      ),
  };
}
const line = (index: number): CodeLineRange => ({
  from: { line: index, ch: 0 },
  to: { line: index + 1, ch: 0 },
});

describe('receipt-backed code line deletion proof', () => {
  it('projects only the actual line deletion, preserving BOM and mixed endings through history', () => {
    const f = fixture(),
      complete = f.capture([line(1)]);
    expect(complete).toBeTypeOf('function');
    f.setValue('Alpha\r\nCharlie');
    const next = f.canonical.replace('Bravo\r\n', ''),
      proof = complete?.(next);
    expect(proof).toEqual({
      base: f.canonical,
      patches: [{ from: f.block.from + 16, to: f.block.from + 23, insert: '' }],
    });
    if (!proof) throw Error('Missing exact proof');
    const raw = `\uFEFF${f.canonical.replace('Bravo\r\n', 'Bravo\n')}`,
      mirror = new SourceMirror(raw, f.canonical),
      initial = mirror.stateId;
    expect(
      mirror.update(next, {
        kind: 'edit',
        baseStateId: initial,
        baseCanonical: proof.base,
        patches: proof.patches,
      }).source,
    ).toBe(raw.replace('Bravo\n', ''));
    const edited = mirror.stateId;
    expect(
      mirror.update(f.canonical, {
        kind: 'history',
        baseStateId: edited,
        targetStateId: initial,
      }).source,
    ).toBe(raw);
    expect(
      mirror.update(next, {
        kind: 'history',
        baseStateId: mirror.stateId,
        targetStateId: edited,
      }).source,
    ).toBe(raw.replace('Bravo\n', ''));
  });
  it.each(['```', '~~~~'])(
    'uses the actual fence envelope %s with descending disjoint ranges',
    (marker) => {
      const f = fixture(['same', 'same', 'same', 'Tail'], marker),
        complete = f.capture([line(2), line(0)]);
      f.setValue('same\r\nTail');
      const next = `${f.canonical.slice(0, f.block.from)}${marker}text\r\nsame\r\nTail\r\n${marker}\r\n\r\nTail`;
      expect(complete?.(next)?.patches).toHaveLength(2);
    },
  );
  it('accepts the clipped last line without consuming the fence separator', () => {
    const f = fixture(),
      complete = f.capture([{ from: { line: 2, ch: 0 }, to: { line: 2, ch: 7 } }]);
    f.setValue('Alpha\r\nBravo\r\n');
    expect(complete?.(f.canonical.replace('Charlie', ''))?.patches).toEqual([
      { from: f.block.from + 23, to: f.block.from + 30, insert: '' },
    ]);
  });
  it('rejects unknown, nested, mismatched or unclosed block receipts', () => {
    const f = fixture();
    expect(f.capture([line(1)], f.canonical, [])).toBeUndefined();
    expect(f.capture([line(1)], `X${f.canonical}`)).toBeUndefined();
    expect(
      f.capture([line(1)], f.canonical, [
        { ...f.block, text: f.block.text.replace('```\r\n\r\n', '~~\r\n\r\n') },
      ]),
    ).toBeUndefined();
    f.setParent();
    expect(f.capture([line(1)])).toBeUndefined();
  });
  it('rejects partial lines, duplicate/ascending/overlapping ranges and invalid CM indices', () => {
    const f = fixture();
    for (const ranges of [
      [],
      [line(0), line(2)],
      [line(1), line(1)],
      [{ from: { line: 1, ch: 1 }, to: { line: 2, ch: 0 } }],
      [{ from: { line: 1, ch: 0 }, to: { line: 2, ch: 1 } }],
      [{ from: { line: 1.1, ch: 0 }, to: { line: 2, ch: 0 } }],
      [line(99)],
    ])
      expect(f.capture(ranges)).toBeUndefined();
    f.cm.indexFromPos = () => Number.NaN;
    expect(f.capture([line(1)])).toBeUndefined();
  });
  it.each(['document', 'node', 'queue', 'mode', 'parent', 'value', 'unrelated canonical'])(
    'discards a proof after %s changes',
    (changed) => {
      const f = fixture(),
        complete = f.capture([line(1)]);
      f.setValue('Alpha\r\nCharlie');
      let next = f.canonical.replace('Bravo\r\n', '');
      if (changed === 'document') f.cm.doc = {};
      if (changed === 'node') f.editor.getNode = () => ({ ...f.node });
      if (changed === 'queue') f.editor.fences.queue.fence = { ...f.cm };
      if (changed === 'mode') f.editor.sourceView.inSourceMode = true;
      if (changed === 'parent') f.setParent();
      if (changed === 'value') f.setValue('Alpha\r\nCharlieX');
      if (changed === 'unrelated canonical') next += 'X';
      expect(complete?.(next)).toBeUndefined();
    },
  );
  it('keeps every untouched byte for arbitrary repeated Unicode lines and mixed raw endings', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('same', '中😀', 'different'), { minLength: 2, maxLength: 20 }),
        fc.nat(),
        (lines, pick) => {
          const index = pick % (lines.length - 1),
            f = fixture(lines),
            complete = f.capture([line(index)]);
          const bodyStart = f.block.from + 9,
            from = bodyStart + f.cm.indexFromPos({ line: index, ch: 0 }),
            to = bodyStart + f.cm.indexFromPos({ line: index + 1, ch: 0 }),
            next = f.canonical.slice(0, from) + f.canonical.slice(to);
          f.setValue(lines.filter((_, i) => i !== index).join('\r\n'));
          const proof = complete?.(next);
          expect(proof).toBeDefined();
          if (!proof) return;
          const endings = lines.map((_, i) => (i % 2 ? '\n' : '\r\n')),
            rawBody = lines
              .map((value, i) => value + (i + 1 < lines.length ? endings[i] : ''))
              .join(''),
            raw = `\uFEFFBefore\r\n\r\n\x60\x60\x60text\r\n${rawBody}\r\n\x60\x60\x60\r\n\r\nTail`,
            expectedBody = lines
              .map((value, i) =>
                i === index ? '' : value + (i + 1 < lines.length ? endings[i] : ''),
              )
              .join(''),
            mirror = new SourceMirror(raw, f.canonical);
          expect(
            mirror.update(next, {
              kind: 'edit',
              baseStateId: mirror.stateId,
              baseCanonical: proof.base,
              patches: proof.patches,
            }).source,
          ).toBe(
            `\uFEFFBefore\r\n\r\n\x60\x60\x60text\r\n${expectedBody}\r\n\x60\x60\x60\r\n\r\nTail`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
