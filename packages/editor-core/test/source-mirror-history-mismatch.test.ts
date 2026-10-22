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
});
