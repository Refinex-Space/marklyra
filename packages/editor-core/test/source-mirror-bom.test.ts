import { expect, test } from 'vitest';
import { SourceMirror } from '../src/source-mirror.js';

const metadata = { sourceBOM: 'metadata', canonicalBOM: 'text' } as const;
const literal = { sourceBOM: 'text', canonicalBOM: 'text' } as const;
function replace(mirror: SourceMirror, from: number, to: number, insert: string) {
  return mirror.update(mirror.canonical.slice(0, from) + insert + mirror.canonical.slice(to), {
    kind: 'edit',
    baseStateId: mirror.stateId,
    baseCanonical: mirror.canonical,
    patches: [{ from, to, insert }],
  });
}

test('a stripped file prefix is distinct from the next literal FEFF in canonical text', () => {
  const source = '\uFEFF\uFEFFAlpha\r\n';
  const mirror = new SourceMirror(source, '\uFEFFAlpha\n', metadata);
  const initial = mirror.stateId;
  expect(mirror.canonicalToSource(0)).toBe(1);
  expect(mirror.canonicalToSource(1)).toBe(2);
  expect(mirror.sourceToCanonical(0)).toBe(0);
  expect(mirror.sourceToCanonical(2)).toBe(1);
  expect(replace(mirror, 0, 1, '').source).toBe('\uFEFFAlpha\r\n');
  const changed = mirror.stateId;
  mirror.update('\uFEFFAlpha\n', { kind: 'history', baseStateId: changed, targetStateId: initial });
  expect(mirror.source).toBe(source);
  mirror.update('Alpha\n', { kind: 'history', baseStateId: initial, targetStateId: changed });
  expect(mirror.source).toBe('\uFEFFAlpha\r\n');
});

test('a host-decoded FEFF is editable text, including when it is the first character', () => {
  const mirror = new SourceMirror('\uFEFFAlpha\r\n', '\uFEFFAlpha\n', literal);
  const initial = mirror.stateId;
  expect(mirror.canonicalToSource(0)).toBe(0);
  expect(replace(mirror, 0, 1, '').source).toBe('Alpha\r\n');
  mirror.update('\uFEFFAlpha\n', {
    kind: 'history',
    baseStateId: mirror.stateId,
    targetStateId: initial,
  });
  expect(mirror.source).toBe('\uFEFFAlpha\r\n');
});

for (const before of ['', 'Alpha\r\n']) {
  test(`external BOM-only changes have distinct raw history with identical canonical: ${JSON.stringify(before)}`, () => {
    const canonical = before.replaceAll('\r\n', '\n');
    const mirror = new SourceMirror(before, canonical, metadata);
    const initial = mirror.stateId;
    mirror.adoptExternal(`\uFEFF${before}`, canonical);
    const added = mirror.stateId;
    expect(added).not.toBe(initial);
    expect(mirror.source).toBe(`\uFEFF${before}`);
    mirror.update(canonical, { kind: 'history', baseStateId: added, targetStateId: initial });
    expect(mirror.source).toBe(before);
    mirror.update(canonical, { kind: 'history', baseStateId: initial, targetStateId: added });
    expect(mirror.source).toBe(`\uFEFF${before}`);
    mirror.adoptExternal(before, canonical);
    expect(mirror.source).toBe(before);
  });
}

test('reset and external adoption retain literal prefix policies instead of silently consuming content', () => {
  const mirror = new SourceMirror('old', 'old', literal);
  mirror.reset('\uFEFFmiddle\n\uFEFFend', '\uFEFFmiddle\n\uFEFFend');
  expect(replace(mirror, 1, 7, 'next').source).toBe('\uFEFFnext\n\uFEFFend');
  mirror.adoptExternal('\uFEFF\uFEFFnew', '\uFEFF\uFEFFnew');
  expect(replace(mirror, 0, 1, '').source).toBe('\uFEFFnew');
});

test('invalid BOM policies fail explicitly', () => {
  expect(() => new SourceMirror('x', 'x', { sourceBOM: 'bad' as 'text' })).toThrow(/BOM policies/);
  expect(() => new SourceMirror('x', 'x', { canonicalBOM: 'bad' as 'text' })).toThrow(
    /BOM policies/,
  );
});

test('an ambiguous new leading literal FEFF is rejected atomically under metadata policy', () => {
  const mirror = new SourceMirror('Alpha', 'Alpha', metadata);
  const initial = mirror.stateId;
  expect(() => replace(mirror, 0, 0, '\uFEFF')).toThrow();
  expect(mirror.source).toBe('Alpha');
  expect(mirror.canonical).toBe('Alpha');
  expect(mirror.stateId).toBe(initial);
  const text = new SourceMirror('Alpha', 'Alpha', literal);
  expect(replace(text, 0, 0, '\uFEFF').source).toBe('\uFEFFAlpha');
});
