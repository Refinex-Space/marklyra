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
    describe(`Redo after a serializer blank-line difference (${JSON.stringify(eol)})`, () => {
      const lines = (...text: string[]) => text.join(eol);
      const original = lines('Alpha', '', 'Tail', '');
      const tight = lines('Alpha', '```', '```', '', 'Tail', '');
      const loose = lines('Alpha', '', '```', '```', '', 'Tail', '');
      function undone() {
        const mirror = new SourceMirror(original, original);
        const initial = mirror.stateId;
        mirror.update(tight);
        const edited = mirror.stateId;
        mirror.update(original, { kind: 'history', baseStateId: edited, targetStateId: initial });
        return { mirror, initial, edited };
      }

      it('adopts the editor blank line instead of faulting', () => {
        const { mirror, initial, edited } = undone();
        const result = mirror.update(loose, {
          kind: 'history',
          baseStateId: mirror.stateId,
          targetStateId: edited,
        });
        expect(mirror.source).toBe(loose);
        expect(mirror.canonical).toBe(loose);
        expect(result.source).toBe(loose);
        // The new state is an ordinary edit: Undo still reaches the original, byte for byte.
        mirror.update(original, {
          kind: 'history',
          baseStateId: mirror.stateId,
          targetStateId: initial,
        });
        expect(mirror.source).toBe(original);
      });

      it('still refuses Undo with the same difference', () => {
        const mirror = new SourceMirror(original, original);
        const initial = mirror.stateId;
        mirror.update(tight);
        expect(() =>
          mirror.update(lines('Alpha', '', '', 'Tail', ''), {
            kind: 'history',
            baseStateId: mirror.stateId,
            targetStateId: initial,
          }),
        ).toThrow('History checkpoint does not match canonical');
        expect(mirror.source).toBe(tight);
      });

      it('still refuses Redo when the words differ, and keeps the mirror intact', () => {
        const { mirror, edited } = undone();
        const stateId = mirror.stateId;
        expect(() =>
          mirror.update(loose.replace('Tail', 'Other'), {
            kind: 'history',
            baseStateId: stateId,
            targetStateId: edited,
          }),
        ).toThrow('History checkpoint does not match canonical');
        expect(mirror.source).toBe(original);
        expect(mirror.stateId).toBe(stateId);
        // The untouched redo edge remains usable.
        mirror.update(tight, { kind: 'history', baseStateId: stateId, targetStateId: edited });
        expect(mirror.source).toBe(tight);
      });
    });
});
