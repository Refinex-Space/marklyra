import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { EditorState } from '../src/index.js';
import { assertSelection, assertWellFormedText, EditorSession, mapPosition } from '../src/index.js';

const text = fc
  .array(
    fc.constantFrom(
      'a',
      ' ',
      '\t',
      '\n',
      '\r\n',
      '\uFEFF',
      '#',
      '*',
      '中',
      '😀',
      'e\u0301',
      '👨‍👩‍👧',
    ),
    { maxLength: 40 },
  )
  .map((parts) => parts.join(''));

function boundaries(source: string): number[] {
  const result = [0];
  let offset = 0;
  for (const character of source) {
    offset += character.length;
    result.push(offset);
  }
  return result;
}

describe('property-based source and history invariants', () => {
  it('inverts arbitrary two-patch transactions without changing untouched source', () => {
    fc.assert(
      fc.property(
        text,
        text,
        text,
        fc.array(fc.nat(), { minLength: 4, maxLength: 4 }),
        (source, first, second, offsets) => {
          const positions = boundaries(source);
          const indexes = [...new Set(offsets.map((value) => value % positions.length))].sort(
            (a, b) => a - b,
          );
          if (indexes.length !== 4) return;
          const ranges = indexes.map((index) => positions[index] ?? 0);
          const [a = 0, b = 0, c = 0, d = 0] = ranges;
          const session = new EditorSession(source);
          session.setSelection({ anchor: d, head: a });
          session.apply({
            baseRevision: 0,
            patches: [
              { from: a, to: b, insert: first },
              { from: c, to: d, insert: second },
            ],
          });
          const after = session.state.source;
          if (after === source) return;
          session.undo();
          expect(session.state.source).toBe(source);
          expect(session.state.selection).toEqual({ anchor: d, head: a });
          session.redo();
          expect(session.state.source).toBe(after);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('keeps every untouched prefix/suffix and valid directed selection for arbitrary local patches', () => {
    fc.assert(
      fc.property(
        text,
        text,
        fc.nat(),
        fc.nat(),
        fc.boolean(),
        (source, insert, left, right, reversed) => {
          const positions = boundaries(source);
          const a = positions[left % positions.length] ?? 0;
          const b = positions[right % positions.length] ?? 0;
          const from = Math.min(a, b);
          const to = Math.max(a, b);
          const session = new EditorSession(source);
          const selection = reversed ? { anchor: to, head: from } : { anchor: from, head: to };
          session.setSelection(selection);
          session.apply({ baseRevision: 0, patches: [{ from, to, insert }] });
          expect(session.state.source).toBe(source.slice(0, from) + insert + source.slice(to));
          assertWellFormedText(session.state.source);
          assertSelection(session.state.source, session.state.selection);
          if (session.state.source !== source) {
            expect(session.undo()).toBe(true);
            expect(session.state.source).toBe(source);
            expect(session.state.selection).toEqual(selection);
          }
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it('survives bounded randomized Unicode edit/undo/redo sequences without invalid positions', () => {
    const action = fc.record({
      kind: fc.constantFrom('insert', 'back', 'forward', 'replace'),
      at: fc.nat(),
      end: fc.nat(),
      text,
    });
    fc.assert(
      fc.property(text, fc.array(action, { minLength: 1, maxLength: 50 }), (source, actions) => {
        const session = new EditorSession(source);
        const edits: { before: EditorState; after: EditorState }[] = [];
        for (const action of actions) {
          const positions = boundaries(session.state.source);
          const anchor = positions[action.at % positions.length] ?? 0;
          const head =
            action.kind === 'replace' ? (positions[action.end % positions.length] ?? 0) : anchor;
          session.setSelection({ anchor, head });
          const before = session.state;
          if (action.kind === 'back') session.execute({ type: 'deleteBackward' });
          else if (action.kind === 'forward') session.execute({ type: 'deleteForward' });
          else
            session.apply({
              baseRevision: before.revision,
              patches: [
                { from: Math.min(anchor, head), to: Math.max(anchor, head), insert: action.text },
              ],
            });
          assertWellFormedText(session.state.source);
          assertSelection(session.state.source, session.state.selection);
          if (before.source !== session.state.source) edits.push({ before, after: session.state });
        }
        for (const edit of [...edits].reverse()) {
          expect(session.undo()).toBe(true);
          expect(session.state.source).toBe(edit.before.source);
          expect(session.state.selection).toEqual(edit.before.selection);
        }
        expect(session.state.source).toBe(source);
        expect(session.undo()).toBe(false);
        for (const edit of edits) {
          expect(session.redo()).toBe(true);
          expect(session.state.source).toBe(edit.after.source);
          expect(session.state.selection).toEqual(edit.after.selection);
        }
        expect(session.redo()).toBe(false);
      }),
      { numRuns: 250 },
    );
  });

  it('keeps position mapping monotonic for each affinity', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100 }),
        fc.nat({ max: 100 }),
        fc.nat({ max: 20 }),
        (a, b, length) => {
          const patch = { from: Math.min(a, b), to: Math.max(a, b), insert: 'x'.repeat(length) };
          for (const affinity of ['left', 'right'] as const) {
            let previous = -1;
            for (let position = 0; position <= 100; position += 1) {
              const mapped = mapPosition(position, [patch], affinity);
              expect(mapped).toBeGreaterThanOrEqual(previous);
              previous = mapped;
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
