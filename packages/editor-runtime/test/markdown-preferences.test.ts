import { describe, expect, it } from 'vitest';
import {
  defaultMarkLyraMarkdownPreferences,
  markdownSerializationPolicy,
  marklyraMarkdownPreferences,
  sameMarkdownPolicy,
} from '../src/markdown-preferences.js';

describe('Markdown serialization preference contract', () => {
  it('preserves Auto separately from its effective two-space policy', () => {
    const auto = marklyraMarkdownPreferences({ indentSize: 0 });
    expect(auto.indentSize).toBe(0);
    expect(markdownSerializationPolicy(auto)).toEqual({
      headingStyle: 0,
      ulStyle: 0,
      olStyle: 0,
      indentSize: 2,
      indentByTab: false,
      prettyIndent: false,
    });
    expect(defaultMarkLyraMarkdownPreferences).toEqual({
      indentSize: 2,
      prettyIndent: false,
      headingStyle: 0,
      ulStyle: 0,
      olStyle: 0,
    });
  });
  it.each([-1, 0, 2, 3, 4, 5] as const)(
    'normalizes supported size %s only at the runtime boundary',
    (indentSize) => {
      const input = marklyraMarkdownPreferences({ indentSize, prettyIndent: true });
      expect(input).toEqual({
        indentSize,
        prettyIndent: true,
        headingStyle: 0,
        ulStyle: 0,
        olStyle: 0,
      });
      expect(markdownSerializationPolicy(input)).toEqual({
        headingStyle: 0,
        ulStyle: 0,
        olStyle: 0,
        indentSize: indentSize <= 0 ? 2 : indentSize,
        indentByTab: indentSize === -1,
        prettyIndent: true,
      });
    },
  );
  it.each([
    null,
    [],
    '2',
    { indentSize: '2' },
    { indentSize: 1 },
    { indentSize: 6 },
    { indentSize: NaN },
    { indentSize: Infinity },
    { prettyIndent: 1 },
    { indentByTab: true },
    { headingStyle: '1' },
    { headingStyle: 4 },
    { headingStyle: null },
    { ulStyle: -1 },
    { ulStyle: 3 },
    { ulStyle: true },
    { olStyle: 2 },
    { olStyle: NaN },
  ])('rejects invalid or unknown configuration %j', (input) => {
    expect(() => marklyraMarkdownPreferences(input)).toThrow(TypeError);
  });
  it('merges a copied patch and compares every effective policy field', () => {
    const base = { indentSize: 3 as const, prettyIndent: false };
    const next = marklyraMarkdownPreferences({ prettyIndent: true }, base);
    expect(base).toEqual({ indentSize: 3, prettyIndent: false });
    const policy = markdownSerializationPolicy(next);
    expect(sameMarkdownPolicy(policy, { ...policy })).toBe(true);
    for (const other of [
      { ...policy, indentSize: 4 as const },
      { ...policy, indentByTab: true },
      { ...policy, prettyIndent: false },
      { ...policy, headingStyle: 3 as const },
      { ...policy, ulStyle: 2 as const },
      { ...policy, olStyle: 1 as const },
    ])
      expect(sameMarkdownPolicy(policy, other)).toBe(false);
  });
});
