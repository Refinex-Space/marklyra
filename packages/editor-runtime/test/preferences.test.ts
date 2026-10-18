import { describe, expect, it } from 'vitest';
import {
  defaultMarkLyraEditorPreferences,
  type MarkLyraEditorPreferences,
  marklyraEditorPreferences,
} from '../src/preferences.js';

const codeBooleanKeys = ['showLineNumbersForFence', 'noLineWrapping', 'lineWiseCopyCut'] as const;

describe('browser editor preference contract', () => {
  it('validates partial updates and preserves supported fractional font sizes', () => {
    expect(marklyraEditorPreferences({ useCustomFontSize: true, customFontSize: 14.5 })).toEqual({
      ...defaultMarkLyraEditorPreferences,
      useCustomFontSize: true,
      customFontSize: 14.5,
    });
    expect(
      marklyraEditorPreferences(
        { noEmojiAutoComplete: true },
        marklyraEditorPreferences({ noPairingMatch: true }),
      ),
    ).toMatchObject({ noEmojiAutoComplete: true, noPairingMatch: true });
    for (const codeIndentSize of [2, 3, 4, 5])
      expect(marklyraEditorPreferences({ codeIndentSize, shiftTabAutoIndent: true })).toMatchObject(
        {
          codeIndentSize,
          shiftTabAutoIndent: true,
        },
      );
  });

  it('defaults new code preferences while retaining an older persisted partial object', () => {
    const legacy = { codeIndentSize: 2, shiftTabAutoIndent: true, customFontSize: 18 };
    const expected: MarkLyraEditorPreferences = {
      ...defaultMarkLyraEditorPreferences,
      codeIndentSize: 2,
      shiftTabAutoIndent: true,
      customFontSize: 18,
      showLineNumbersForFence: false,
      noLineWrapping: false,
      lineWiseCopyCut: false,
    };
    expect(marklyraEditorPreferences(legacy)).toEqual(expected);
    expect(legacy).toEqual({ codeIndentSize: 2, shiftTabAutoIndent: true, customFontSize: 18 });
    expect(Object.isFrozen(defaultMarkLyraEditorPreferences)).toBe(true);
  });

  it.each(codeBooleanKeys)(
    'accepts only boolean updates to %s and keeps other confirmed values',
    (key) => {
      const base = marklyraEditorPreferences({ codeIndentSize: 3, shiftTabAutoIndent: true });
      const enabled = marklyraEditorPreferences({ [key]: true }, base);
      expect(enabled).toEqual({ ...base, [key]: true });
      expect(base).toEqual({
        ...defaultMarkLyraEditorPreferences,
        codeIndentSize: 3,
        shiftTabAutoIndent: true,
      });
      expect(marklyraEditorPreferences({ [key]: false }, enabled)).toEqual(base);
    },
  );

  it.each(codeBooleanKeys)('rejects non-boolean %s without mutating the confirmed base', (key) => {
    const base = marklyraEditorPreferences({ codeIndentSize: 5, noEmojiAutoComplete: true });
    const before = { ...base };
    for (const invalid of [undefined, null, 'true', 'false', 0, 1, {}, [], new Boolean(false)]) {
      expect(() =>
        marklyraEditorPreferences({ noPairingMatch: true, [key]: invalid }, base),
      ).toThrow(`${key} must be boolean`);
      expect(base).toEqual(before);
    }
    expect(defaultMarkLyraEditorPreferences[key]).toBe(false);
  });
  it.each([
    null,
    [],
    1,
    { customFontSize: 8 },
    { customFontSize: 25 },
    { customFontSize: NaN },
    { noPairingMatch: 'true' },
    { noEmojiAutoComplete: 1 },
    { codeIndentSize: '2' },
    { codeIndentSize: 0 },
    { codeIndentSize: -1 },
    { codeIndentSize: 2.5 },
    { codeIndentSize: 6 },
    { codeIndentSize: Number.NaN },
    { shiftTabAutoIndent: 'true' },
    { unknown: true },
    JSON.parse('{"__proto__":true}'),
    { constructor: true },
    { toString: true },
  ])('rejects invalid settings atomically %j', (input) => {
    expect(() => marklyraEditorPreferences(input)).toThrow();
    expect(defaultMarkLyraEditorPreferences.customFontSize).toBe(14);
  });
});

describe('additive preference compatibility', () => {
  it('accepts the minimal complete preference shape and resolves new controls explicitly', () => {
    const previous: MarkLyraEditorPreferences = {
      useCustomFontSize: false,
      customFontSize: 14,
      noPairingMatch: false,
      autoPairExtendSymbol: false,
      noEmojiAutoComplete: false,
      expandSimpleBlock: false,
      codeIndentSize: 4,
      shiftTabAutoIndent: false,
      showLineNumbersForFence: false,
      noLineWrapping: false,
      lineWiseCopyCut: false,
    };
    expect(marklyraEditorPreferences({}, previous)).toEqual(defaultMarkLyraEditorPreferences);
    expect(
      marklyraEditorPreferences({ defaultCodeLang: 'python', defaultCodeLangOption: 3 }, previous),
    ).toMatchObject({ defaultCodeLang: 'python', defaultCodeLangOption: 3, preferCRLF: false });
  });
});
