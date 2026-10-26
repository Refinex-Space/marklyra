import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  diffText,
  SourceMirror,
  type SourceMirrorCompletePrefix,
  type SourceMirrorHint,
} from '../src/index.js';
import type { Patch } from '../src/types.js';

// These receipts are explicit trusted-adapter inputs. Text/range checks in core
// cannot establish that a real Markdown node or command owns a prefix.
// Every expected raw range below is known from fixture construction, not inferred
// by searching equal text or by invoking SourceMirror's own mapping as an oracle.
type Role = SourceMirrorCompletePrefix['role'];
const roles: readonly Role[] = ['indent', 'quote', 'list-marker'];
const endings = ['\n', '\r\n', '\r'] as const;
function applied(text: string, patches: readonly Patch[]): string {
  for (const patch of [...patches].reverse())
    text = text.slice(0, patch.from) + patch.insert + text.slice(patch.to);
  return text;
}
function snapshot(mirror: SourceMirror) {
  return {
    source: mirror.source,
    canonical: mirror.canonical,
    id: mirror.stateId,
    epoch: mirror.projectionEpoch,
  };
}
function editHint(
  mirror: SourceMirror,
  patches: readonly Patch[],
  completePrefixes?: readonly SourceMirrorCompletePrefix[],
): Extract<SourceMirrorHint, { kind: 'edit' }> {
  return {
    kind: 'edit',
    baseStateId: mirror.stateId,
    baseProjectionEpoch: mirror.projectionEpoch,
    baseCanonical: mirror.canonical,
    patches,
    ...(completePrefixes === undefined ? {} : { completePrefixes }),
  };
}
function prefixHint(mirror: SourceMirror, from: number, to: number, insert: string, role: Role) {
  const patch = { from, to, insert };
  return editHint(mirror, [patch], [{ patchIndex: 0, canonical: { from, to }, role }]);
}
function rebase(mirror: SourceMirror, canonical: string) {
  const before = snapshot(mirror);
  const result = mirror.rebaseCanonical(canonical, {
    baseStateId: mirror.stateId,
    baseProjectionEpoch: mirror.projectionEpoch,
    baseCanonical: mirror.canonical,
    patches: diffText(mirror.canonical, canonical),
  });
  expect(result).toEqual({ source: before.source, patches: [] });
  expect(mirror.stateId).toBe(before.id);
}
function history(mirror: SourceMirror, target: number, canonical: string, journal = canonical) {
  return mirror.update(canonical, {
    kind: 'history',
    baseStateId: mirror.stateId,
    baseProjectionEpoch: mirror.projectionEpoch,
    targetStateId: target,
    ...(journal === canonical
      ? {}
      : {
          canonicalProjection: {
            baseProjectionEpoch: mirror.projectionEpoch,
            baseCanonical: journal,
            patches: diffText(journal, canonical),
          },
        }),
  });
}
function fixture(
  role: Role,
  rawPrefix: string,
  canonicalPrefix: string,
  options: { bom?: boolean; body?: string; outer?: boolean; eols?: readonly string[] } = {},
) {
  const body = options.body ?? 'Same😀中文';
  const eols = options.eols ?? ['\r\n', '\n', '\r', '\r\n', '\n', '\r\n', '\n'];
  const eol = (index: number) => eols[index % eols.length] ?? '\n';
  const outerRaw = options.outer ? '>   ' : '';
  const outerCanonical = options.outer ? '> ' : '';
  const content = `${role === 'indent' ? '- ' : ''}${body}`;
  // A preceding identical item and a later code occurrence are deliberate.
  const beforeRaw = `${options.bom === false ? '' : '\uFEFF'}## Head${eol(0)}${outerRaw}${rawPrefix}${content}${eol(1)}sep${eol(2)}${outerRaw}`;
  const beforeCanonical = `## Head\n${outerCanonical}${canonicalPrefix}${content}\nsep\n${outerCanonical}`;
  const afterRaw = `${content}  ${eol(3)}\`\`\`txt${eol(4)}    ${body}${eol(5)}\t code  ${eol(6)}\`\`\`${eol(0)}Tail${eol(1)}`;
  const afterCanonical = `${content}\n\`\`\`txt\n    ${body}\n\t code  \n\`\`\`\nTail\n`;
  const raw = beforeRaw + rawPrefix + afterRaw;
  const canonical = beforeCanonical + canonicalPrefix + afterCanonical;
  return {
    raw,
    canonical,
    beforeRaw,
    afterRaw,
    beforeCanonical,
    afterCanonical,
    from: beforeCanonical.length,
    to: beforeCanonical.length + canonicalPrefix.length,
    expected: (insert: string) => beforeRaw + insert + afterRaw,
  };
}

describe('explicit complete structural prefixes', () => {
  it.each(['  ', '   ', '    ', '\t'])(
    'removes the entire authorized raw indent %j without touching duplicate content, code, BOM or physical EOL',
    (rawPrefix) => {
      const f = fixture('indent', rawPrefix, '  '),
        mirror = new SourceMirror(f.raw, f.canonical);
      const hint = prefixHint(mirror, f.from, f.to, '', 'indent');
      const result = mirror.update(applied(f.canonical, hint.patches), hint);
      expect(result.source).toBe(f.expected(''));
      expect(result.patches).toEqual([
        { from: f.beforeRaw.length, to: f.beforeRaw.length + rawPrefix.length, insert: '' },
      ]);
      expect(applied(f.raw, result.patches)).toBe(result.source);
    },
  );

  it.each([
    ['quote', '>   ', '> '],
    ['list-marker', '007.   ', '7. '],
    ['list-marker', '*   ', '- '],
    ['list-marker', '- [x]   ', '- [x] '],
  ] as const)(
    'replaces the full %s prefix while preserving outer quote whitespace',
    (role, rawPrefix, canonicalPrefix) => {
      const f = fixture(role, rawPrefix, canonicalPrefix, { outer: true });
      const mirror = new SourceMirror(f.raw, f.canonical);
      const insert = role === 'quote' ? '> ' : '1. ';
      const hint = prefixHint(mirror, f.from, f.to, insert, role);
      expect(mirror.update(applied(f.canonical, hint.patches), hint).source).toBe(
        f.expected(insert),
      );
      expect(mirror.source.slice(0, f.beforeRaw.length)).toBe(f.beforeRaw);
      expect(mirror.source.slice(f.beforeRaw.length + insert.length)).toBe(f.afterRaw);
    },
  );

  it('keeps the metadata BOM at physical offset zero', () => {
    const raw = '\uFEFF   - Text\r\n',
      canonical = '  - Text\n';
    const mirror = new SourceMirror(raw, canonical),
      hint = prefixHint(mirror, 0, 2, '', 'indent');
    expect(mirror.update(applied(canonical, hint.patches), hint).source).toBe('\uFEFF- Text\r\n');
  });

  it('does not treat a literal content BOM as syntax context or consume it in an indent receipt', () => {
    const raw = '\uFEFF   - Text\r\n',
      canonical = '\uFEFF  - Text\n';
    const mirror = new SourceMirror(raw, canonical, { sourceBOM: 'text', canonicalBOM: 'text' });
    const before = snapshot(mirror),
      hint = prefixHint(mirror, 1, 3, '', 'indent');
    expect(() => mirror.update(applied(canonical, hint.patches), hint)).toThrow();
    expect(snapshot(mirror)).toEqual(before);
  });

  it('keeps ordinary narrow deletion behavior for every patch without an explicit prefix receipt', () => {
    const f = fixture('indent', '   ', '  '),
      mirror = new SourceMirror(f.raw, f.canonical);
    const hint = editHint(mirror, [{ from: f.from, to: f.to, insert: '' }]);
    expect(mirror.update(applied(f.canonical, hint.patches), hint).source).toBe(f.expected(' '));
  });

  it('binds authorization to its primary patch index and preserves independent ordinary code edits', () => {
    const f = fixture('indent', '    ', '  '),
      mirror = new SourceMirror(f.raw, f.canonical);
    const code = f.canonical.indexOf('    Same😀中文');
    const patches = [
      { from: f.from, to: f.to, insert: '' },
      { from: code, to: code + 1, insert: '' },
    ];
    const hint = editHint(mirror, patches, [
      { patchIndex: 0, canonical: { from: f.from, to: f.to }, role: 'indent' },
    ]);
    const expected = f.expected('').replace('    Same😀中文', '   Same😀中文');
    expect(mirror.update(applied(f.canonical, patches), hint).source).toBe(expected);
  });

  it('keeps an adjacent ordinary marker deletion narrow after the authorized indent deletion', () => {
    const raw = '   -  Text\r\n',
      canonical = '  - Text\n';
    const mirror = new SourceMirror(raw, canonical);
    const patches = [
      { from: 0, to: 2, insert: '' },
      { from: 2, to: 4, insert: '' },
    ];
    const hint = editHint(mirror, patches, [
      { patchIndex: 0, canonical: { from: 0, to: 2 }, role: 'indent' },
    ]);
    expect(mirror.update(applied(canonical, patches), hint).source).toBe(' Text\r\n');
  });

  it('does not consume a preceding ordinary quote deletion gap when the adjacent list marker is authorized', () => {
    const raw = '>   007.   Text\r\n',
      canonical = '> 7. Text\n';
    const mirror = new SourceMirror(raw, canonical);
    const patches = [
      { from: 0, to: 2, insert: '' },
      { from: 2, to: 5, insert: '' },
    ];
    const hint = editHint(mirror, patches, [
      { patchIndex: 1, canonical: { from: 2, to: 5 }, role: 'list-marker' },
    ]);
    expect(mirror.update(applied(canonical, patches), hint).source).toBe('  Text\r\n');
  });

  it('authorizes primary prefixes independently from serializer-only separator padding', () => {
    const raw = '\uFEFF   - Text\r\n\r\nTail\n',
      canonical = '  - Text\n\nTail\n';
    const mirror = new SourceMirror(raw, canonical),
      initial = mirror.stateId;
    const hint = prefixHint(mirror, 0, 2, '', 'indent');
    const primary = applied(canonical, hint.patches),
      next = primary.replace('\n\nTail', '\n\n\nTail');
    const result = mirror.update(next, {
      ...hint,
      canonicalProjection: {
        baseProjectionEpoch: mirror.projectionEpoch,
        baseCanonical: primary,
        patches: diffText(primary, next),
      },
    });
    expect(result.source).toBe('\uFEFF- Text\r\n\r\nTail\n');
    const edited = mirror.stateId;
    expect(history(mirror, initial, canonical).source).toBe(raw);
    expect(history(mirror, edited, next).source).toBe(result.source);
  });

  it('normalizes only an explicitly owned combined quote/indent prefix instead of inventing whitespace ownership', () => {
    const f = fixture('indent', '   ', '  ', { outer: true }),
      mirror = new SourceMirror(f.raw, f.canonical);
    // Quote padding and child indentation are a single whitespace run in the
    // correspondence. Authorize that whole combined prefix; do not invent a
    // separately recoverable allocation of three raw spaces to its ancestor.
    const from = f.from - '> '.length,
      insert = '>     ';
    const rawBefore = f.beforeRaw.slice(0, -'>   '.length);
    const hint = prefixHint(mirror, from, f.to, insert, 'quote');
    expect(mirror.update(applied(f.canonical, hint.patches), hint).source).toBe(
      rawBefore + insert + f.afterRaw,
    );
    expect(mirror.source.slice(0, rawBefore.length)).toBe(rawBefore);
    expect(mirror.source.slice(rawBefore.length + insert.length)).toBe(f.afterRaw);
  });
});

describe('complete-prefix receipt rejection is atomic', () => {
  const invalid = [
    {
      label: 'negative index',
      receipt: { patchIndex: -1, canonical: { from: 0, to: 2 }, role: 'indent' },
    },
    {
      label: 'fractional index',
      receipt: { patchIndex: 0.5, canonical: { from: 0, to: 2 }, role: 'indent' },
    },
    {
      label: 'NaN index',
      receipt: { patchIndex: Number.NaN, canonical: { from: 0, to: 2 }, role: 'indent' },
    },
    {
      label: 'missing patch',
      receipt: { patchIndex: 1, canonical: { from: 0, to: 2 }, role: 'indent' },
    },
    {
      label: 'partial prefix range',
      receipt: { patchIndex: 0, canonical: { from: 0, to: 1 }, role: 'indent' },
    },
    {
      label: 'empty range',
      receipt: { patchIndex: 0, canonical: { from: 0, to: 0 }, role: 'indent' },
    },
    {
      label: 'infinite bound',
      receipt: {
        patchIndex: 0,
        canonical: { from: 0, to: Number.POSITIVE_INFINITY },
        role: 'indent',
      },
    },
    {
      label: 'negative bound',
      receipt: { patchIndex: 0, canonical: { from: -1, to: 2 }, role: 'indent' },
    },
    {
      label: 'fractional bound',
      receipt: { patchIndex: 0, canonical: { from: 0, to: 1.5 }, role: 'indent' },
    },
    {
      label: 'wrong syntax role',
      receipt: { patchIndex: 0, canonical: { from: 0, to: 2 }, role: 'quote' },
    },
    {
      label: 'unknown role',
      receipt: { patchIndex: 0, canonical: { from: 0, to: 2 }, role: 'anything' },
    },
  ];
  it.each(invalid)(
    'rejects $label without publishing source/history/coordinates',
    ({ receipt }) => {
      const mirror = new SourceMirror('   - Text\r\n', '  - Text\n');
      const before = snapshot(mirror);
      const hint = editHint(
        mirror,
        [{ from: 0, to: 2, insert: '' }],
        [receipt as SourceMirrorCompletePrefix],
      );
      expect(() => mirror.update('- Text\n', hint)).toThrow();
      expect(snapshot(mirror)).toEqual(before);
    },
  );
  it('rejects duplicate authorization and overlapping primary spans', () => {
    for (const overlap of [false, true]) {
      const mirror = new SourceMirror('    - Text', '    - Text');
      const receipt: SourceMirrorCompletePrefix = {
        patchIndex: 0,
        canonical: { from: 0, to: 2 },
        role: 'indent',
      };
      const patches = overlap
        ? [
            { from: 0, to: 2, insert: '' },
            { from: 1, to: 4, insert: '' },
          ]
        : [{ from: 0, to: 2, insert: '' }];
      const complete = overlap
        ? [receipt, { patchIndex: 1, canonical: { from: 1, to: 4 }, role: 'indent' as const }]
        : [receipt, receipt];
      const before = snapshot(mirror);
      expect(() => mirror.update('  - Text', editHint(mirror, patches, complete))).toThrow();
      expect(snapshot(mirror)).toEqual(before);
    }
  });

  it('rejects nonoverlapping canonical edits whose prefix and ordinary mappings overlap the same raw Tab', () => {
    const mirror = new SourceMirror('\t- Text\r\n', '  - Text\n');
    const patches = [
      { from: 0, to: 1, insert: '' },
      { from: 1, to: 2, insert: '' },
    ];
    const before = snapshot(mirror);
    const hint = editHint(mirror, patches, [
      { patchIndex: 0, canonical: { from: 0, to: 1 }, role: 'indent' },
    ]);
    expect(() => mirror.update('- Text\n', hint)).toThrow();
    expect(snapshot(mirror)).toEqual(before);
  });

  it('rejects a non-array, missing receipt, budget overflow or inferred-placement mixture', () => {
    const receipt: SourceMirrorCompletePrefix = {
      patchIndex: 0,
      canonical: { from: 0, to: 2 },
      role: 'indent',
    };
    for (const complete of [
      {} as readonly SourceMirrorCompletePrefix[],
      [null] as unknown as readonly SourceMirrorCompletePrefix[],
      Array.from({ length: 16_385 }, () => receipt),
    ]) {
      const mirror = new SourceMirror('   - Text', '  - Text'),
        before = snapshot(mirror);
      expect(() =>
        mirror.update('- Text', editHint(mirror, [{ from: 0, to: 2, insert: '' }], complete)),
      ).toThrow();
      expect(snapshot(mirror)).toEqual(before);
    }
    const mirror = new SourceMirror('   - Text', '  - Text'),
      before = snapshot(mirror);
    expect(() =>
      mirror.update('- Text', {
        ...prefixHint(mirror, 0, 2, '', 'indent'),
        placementRanges: [{ from: 0, to: 2 }],
      }),
    ).toThrow();
    expect(snapshot(mirror)).toEqual(before);
  });
  it.each(['body', '\n', '\r', '\uFEFF', '\ud800', '😀'])(
    'rejects an insertion outside the declared prefix grammar: %j',
    (insert) => {
      const mirror = new SourceMirror('   - Text\r\n', '  - Text\n'),
        before = snapshot(mirror);
      const hint = prefixHint(mirror, 0, 2, insert, 'indent');
      expect(() => mirror.update(applied(mirror.canonical, hint.patches), hint)).toThrow();
      expect(snapshot(mirror)).toEqual(before);
    },
  );
  it.each([
    ['indent', '  - Text', '  - Text', 0, 3],
    ['quote', '> Text', '> Text', 0, 6],
    ['list-marker', '- Text', '- Text', 0, 6],
    ['indent', '  \n  Text', '  \n  Text', 0, 5],
    ['indent', '  \r\n  Text', '  \r\n  Text', 0, 3],
    ['indent', ' \n  - Text', '  - Text', 0, 2],
    ['indent', '\uFEFF  - Text', '\uFEFF  - Text', 0, 3],
    ['indent', '😀  Text', '😀  Text', 1, 4],
  ] as const)('rejects body/EOL/BOM/Unicode crossing for %s', (role, raw, canonical, from, to) => {
    const mirror = new SourceMirror(raw, canonical, { sourceBOM: 'text', canonicalBOM: 'text' });
    const before = snapshot(mirror),
      hint = prefixHint(mirror, from, to, '', role);
    expect(() => mirror.update(applied(canonical, hint.patches), hint)).toThrow();
    expect(snapshot(mirror)).toEqual(before);
  });

  it('refuses stale checkpoint, canonical and projection epoch while retaining an existing redo branch', () => {
    for (const field of ['baseStateId', 'baseCanonical', 'baseProjectionEpoch'] as const) {
      const f = fixture('indent', '   ', '  '),
        mirror = new SourceMirror(f.raw, f.canonical),
        initial = mirror.stateId;
      const normal = editHint(mirror, [
        { from: f.canonical.length - 1, to: f.canonical.length - 1, insert: '!' },
      ]);
      mirror.update(applied(f.canonical, normal.patches), normal);
      const edited = mirror.stateId,
        editedCanonical = mirror.canonical,
        editedSource = mirror.source;
      history(mirror, initial, f.canonical);
      const hint = prefixHint(mirror, f.from, f.to, '', 'indent');
      const bad = { ...hint, [field]: field === 'baseCanonical' ? 'wrong base' : -1 };
      const before = snapshot(mirror);
      expect(() =>
        mirror.update(applied(mirror.canonical, hint.patches), bad as SourceMirrorHint),
      ).toThrow();
      expect(snapshot(mirror)).toEqual(before);
      expect(history(mirror, edited, editedCanonical).source).toBe(editedSource);
    }
  });

  it('fails closed when unwrapping would turn preserved trailing whitespace into an unproved new list marker', () => {
    const f = fixture('list-marker', '007.   ', '7. ', { bom: false, body: '-', eols: ['\n'] });
    const mirror = new SourceMirror(f.raw, f.canonical);
    rebase(mirror, `${f.beforeCanonical}7.    ${f.afterCanonical}`);
    const before = snapshot(mirror),
      hint = prefixHint(mirror, f.from, f.from + '7.    '.length, '', 'list-marker');
    // The preserved raw line would be "-  \n", while its claimed canonical is
    // "-\n". The former is a fresh marker, so generic normalization is not proof
    // that the command/model has a corresponding unwrapped paragraph.
    expect(() => mirror.update(applied(mirror.canonical, hint.patches), hint)).toThrow(
      /normalization/,
    );
    expect(snapshot(mirror)).toEqual(before);
  });
});

describe('complete-prefix properties with independently known raw boundaries', () => {
  const body = fc
    .array(fc.constantFrom('A', '中', '文', '😀', 'Ω', '_', '-'), { minLength: 1, maxLength: 16 })
    .map((parts) => `Text ${parts.join('')}`);
  const configuration = fc.record({
    role: fc.constantFrom(...roles),
    rawIndent: fc.constantFrom('  ', '   ', '    ', '\t'),
    activeIndent: fc.constantFrom('  ', '   ', '    ', '\t'),
    bom: fc.boolean(),
    outer: fc.boolean(),
    body,
    eols: fc.array(fc.constantFrom(...endings), { minLength: 1, maxLength: 7 }),
    remove: fc.boolean(),
  });
  it('preserves exact non-prefix source across policy A→B, complete replacement, Undo and Redo', () => {
    fc.assert(
      fc.property(configuration, (c) => {
        const rawPrefix =
          c.role === 'indent' ? c.rawIndent : c.role === 'quote' ? '>   ' : '007.   ';
        const active = c.role === 'indent' ? c.activeIndent : c.role === 'quote' ? '> ' : '7. ';
        const projected = c.role === 'indent' ? '    ' : c.role === 'quote' ? '>    ' : '7.    ';
        const insert = c.remove
          ? ''
          : c.role === 'indent'
            ? '\t'
            : c.role === 'quote'
              ? '> '
              : '* ';
        const f = fixture(c.role, rawPrefix, active, c),
          mirror = new SourceMirror(f.raw, f.canonical);
        const initial = mirror.stateId;
        const policyB = f.beforeCanonical + projected + f.afterCanonical;
        rebase(mirror, policyB);
        const combined = c.role === 'indent' && c.outer;
        const from = combined ? f.from - '> '.length : f.from;
        const replacement = combined ? `> ${insert}` : insert;
        const rawBefore = combined ? f.beforeRaw.slice(0, -'>   '.length) : f.beforeRaw;
        const expected = rawBefore + replacement + f.afterRaw;
        const hint = prefixHint(
          mirror,
          from,
          f.from + projected.length,
          replacement,
          combined ? 'quote' : c.role,
        );
        const next = applied(policyB, hint.patches),
          result = mirror.update(next, hint);
        expect(result.source).toBe(expected);
        expect(applied(f.raw, result.patches)).toBe(expected);
        const edited = mirror.stateId;
        expect(history(mirror, initial, policyB, f.canonical).source).toBe(f.raw);
        rebase(mirror, f.canonical);
        expect(history(mirror, edited, next).source).toBe(expected);
        expect(mirror.source.slice(0, rawBefore.length)).toBe(rawBefore);
        expect(mirror.source.slice(rawBefore.length + replacement.length)).toBe(f.afterRaw);
      }),
      { numRuns: 100 },
    );
  });
});
