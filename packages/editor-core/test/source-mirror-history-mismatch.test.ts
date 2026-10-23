import { describe, expect, it } from 'vitest';
import { SourceMirror } from '../src/index.js';

describe('history checkpoint mismatch report', () => {
  it('keeps the guard and describes only the shape of the disagreement', () => {
    const original = 'Alpha first\r\n\r\nGamma delta\r\n';
    const mirror = new SourceMirror(original, original);
    const initial = mirror.stateId;
    mirror.update('Alpha first\r\n\r\nGamma changed\r\n');
    const edited = mirror.stateId;
    const attempt = () =>
      mirror.update('Alpha first\n\nGamma delta\n', {
        kind: 'history',
        baseStateId: edited,
        targetStateId: initial,
      });
    expect(attempt).toThrow(
      /^History checkpoint does not match canonical \(journal 28 chars \(CRLF 3\/LF 0\/CR 0\), editor 25 chars \(CRLF 0\/LF 3\/CR 0\), first difference at 11\)$/,
    );
    expect(attempt).not.toThrow(/Gamma|Alpha/);
    expect(mirror.source).toBe('Alpha first\r\n\r\nGamma changed\r\n');
  });

  for (const eol of ['\n', '\r\n'])
    describe(`History across a serializer blank-line difference (${JSON.stringify(eol)})`, () => {
      const lines = (...text: string[]) => text.join(eol);
      const original = lines('Alpha', '', 'Tail', '');
      const tight = lines('Alpha', '```', '```', '', 'Tail', '');
      const loose = lines('Alpha', '', '```', '```', '', 'Tail', '');
      const trailing = lines('Alpha', '', 'Tail', '', '', '');
      const history = (mirror: SourceMirror, targetStateId: number) => ({
        kind: 'history' as const,
        baseStateId: mirror.stateId,
        targetStateId,
      });
      function undone() {
        const mirror = new SourceMirror(original, original);
        const initial = mirror.stateId;
        mirror.update(tight);
        const edited = mirror.stateId;
        mirror.update(original, history(mirror, initial));
        return { mirror, initial, edited };
      }

      it('Redo keeps the journaled raw bytes and adopts the editor spelling', () => {
        const { mirror, initial, edited } = undone();
        mirror.update(loose, history(mirror, edited));
        expect(mirror.source).toBe(tight);
        expect(mirror.canonical).toBe(loose);
        mirror.update(original, history(mirror, initial));
        expect(mirror.source).toBe(original);
        expect(mirror.canonical).toBe(original);
      });

      it('Undo to a state the editor spells with more blank lines restores the exact original', () => {
        const mirror = new SourceMirror(original, original);
        const initial = mirror.stateId;
        mirror.update(tight);
        const edited = mirror.stateId;
        mirror.update(trailing, history(mirror, initial));
        expect(mirror.source).toBe(original);
        expect(mirror.canonical).toBe(trailing);
        // The checkpoint chain is intact: Redo still reaches the edit.
        mirror.update(tight, history(mirror, edited));
        expect(mirror.source).toBe(tight);
      });

      it('keeps mapping edits after the gap onto the right raw text', () => {
        const mirror = new SourceMirror(original, original);
        const initial = mirror.stateId;
        mirror.update(tight);
        mirror.update(trailing, history(mirror, initial));
        mirror.update(trailing.replace('Tail', 'Tail words'));
        expect(mirror.source).toBe(original.replace('Tail', 'Tail words'));
      });

      it('refuses indentation and trailing-space differences', () => {
        const list = lines('- a', '  - b', '');
        const nested = new SourceMirror(list, list);
        const start = nested.stateId;
        nested.update(list.replace('b', 'c'));
        for (const other of [lines('- a', '    - b', ''), lines('- a  ', '  - b', '')])
          expect(() => nested.update(other, history(nested, start))).toThrow(
            'History checkpoint does not match canonical',
          );
      });

      it('leaves projection-aware mirrors strict', () => {
        const mirror = new SourceMirror(original, original);
        const initial = mirror.stateId;
        mirror.update(tight);
        mirror.rebaseCanonical(tight.replace('Alpha', '  Alpha'), {
          baseStateId: mirror.stateId,
          baseProjectionEpoch: 0,
          baseCanonical: tight,
          patches: [{ from: 0, to: 0, insert: '  ' }],
        });
        expect(() =>
          mirror.update(trailing, { ...history(mirror, initial), baseProjectionEpoch: 1 }),
        ).toThrow('History checkpoint does not match canonical');
      });

      it('still refuses a difference in the words, and keeps the mirror intact', () => {
        const { mirror, edited } = undone();
        const stateId = mirror.stateId;
        expect(() =>
          mirror.update(loose.replace('Tail', 'Other'), history(mirror, edited)),
        ).toThrow('History checkpoint does not match canonical');
        expect(mirror.source).toBe(original);
        expect(mirror.stateId).toBe(stateId);
        mirror.update(tight, history(mirror, edited));
        expect(mirror.source).toBe(tight);
      });
    });

  for (const eol of ['\n', '\r\n'])
    describe(`History across serializer table padding (${JSON.stringify(eol)})`, () => {
      const lines = (...text: string[]) => text.join(eol);
      const history = (mirror: SourceMirror, targetStateId: number) => ({
        kind: 'history' as const,
        baseStateId: mirror.stateId,
        targetStateId,
      });
      const cases = {
        'spaced dashes': [
          lines('Intro', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', ''),
          lines('Intro', '', '| a    | b    |', '| ---- | ---- |', '| 1    | 2    |', ''),
        ],
        'single dashes': [
          lines('Intro', '', '| a | b |', '| - | - |', '| 1 | 2 |', ''),
          lines('Intro', '', '| a    | b    |', '| ---- | ---- |', '| 1    | 2    |', ''),
        ],
        'tight pipes': [
          lines('Intro', '', '|a|b|', '|---|---|', '|1|2|', ''),
          lines('Intro', '', '| a    | b    |', '| ---- | ---- |', '| 1    | 2    |', ''),
        ],
      } as const;
      for (const [name, [table, padded]] of Object.entries(cases))
        it(`Undo to an unpadded table (${name}) keeps the exact original bytes`, () => {
          const mirror = new SourceMirror(table, table);
          const initial = mirror.stateId;
          const edited = mirror.update(padded.replace('2   ', '3   ')).source;
          const editedId = mirror.stateId;
          mirror.update(padded, history(mirror, initial));
          expect(mirror.source).toBe(table);
          expect(mirror.canonical).toBe(padded);
          // Redo reaches the edit again, and a later edit lands in the right cell.
          mirror.update(padded.replace('2   ', '3   '), history(mirror, editedId));
          expect(mirror.source).toBe(edited);
        });

      it('also applies once serializer projections are in play, but never to a changed cell', () => {
        const [table, padded] = cases['spaced dashes'];
        const mirror = new SourceMirror(table, table);
        const initial = mirror.stateId;
        mirror.update(padded.replace('2   ', '3   '));
        mirror.rebaseCanonical(padded.replace('2   ', '3   ').replace('Intro', 'Intro '), {
          baseStateId: mirror.stateId,
          baseProjectionEpoch: 0,
          baseCanonical: padded.replace('2   ', '3   '),
          patches: [{ from: 5, to: 5, insert: ' ' }],
        });
        expect(() =>
          mirror.update(padded.replace('2   ', '9   '), {
            ...history(mirror, initial),
            baseProjectionEpoch: 1,
          }),
        ).toThrow('History checkpoint does not match canonical');
        mirror.update(padded, { ...history(mirror, initial), baseProjectionEpoch: 1 });
        expect(mirror.source).toBe(table);
      });
    });

  describe('edits inside the closing blank lines', () => {
    it('resolves a delete in extra raw trailing line breaks instead of reporting ambiguity', () => {
      for (const eol of ['\n', '\r\n', '\r']) {
        const mirror = new SourceMirror(`Intro${eol}${eol}${eol}`, `Intro${eol}${eol}`);
        expect(mirror.update(`Intro${eol}`).source).toBe(`Intro${eol}`);
      }
    });

    it('still refuses ambiguity elsewhere in the document', () => {
      const mirror = new SourceMirror('same\r\n\r\nsame\n\n', 'same\n\nsame\n\n');
      expect(() => mirror.update('same\n\n')).toThrow(
        expect.objectContaining({ code: 'AMBIGUOUS_EDIT' }),
      );
    });
  });
});
