import { describe, expect, it } from 'vitest';
import {
  defaultMarkLyraStartupPreferences,
  marklyraStartupPreferences,
} from '../src/startup-preferences.js';

describe('startup parser configuration', () => {
  it('copies the bounded bootstrap values and preserves current adapter defaults', () => {
    const input = { enableHighlight: true };
    const next = marklyraStartupPreferences(input);
    input.enableHighlight = false;
    expect(next.enableHighlight).toBe(true);
    expect(marklyraStartupPreferences({})).toEqual(defaultMarkLyraStartupPreferences);
    expect(next.enableDiagram).toBe(true);
  });
  it('supports true/false cold reversals for each known key without sharing state', () => {
    for (const key of Object.keys(defaultMarkLyraStartupPreferences)) {
      if (key === 'autoNumberingForMath') continue;
      const first = marklyraStartupPreferences({ [key]: true });
      const second = marklyraStartupPreferences({ [key]: false });
      expect(Reflect.get(first, key)).toBe(true);
      expect(Reflect.get(second, key)).toBe(false);
    }
  });
  it('rejects arbitrary options, non-booleans and malformed query payloads', () => {
    for (const value of [
      null,
      [],
      { enableHighlight: 'true' },
      { keys: {} },
      { execCommand: 'void 0' },
      JSON.parse('{"__proto__":true}'),
    ])
      expect(() => marklyraStartupPreferences(value)).toThrow();
  });
});

it('accepts only the bounded MathJax numbering modes', () => {
  for (const mode of [false, 'ams', 'all'])
    expect(marklyraStartupPreferences({ autoNumberingForMath: mode }).autoNumberingForMath).toBe(
      mode,
    );
  for (const mode of [true, '', 1, 'custom', {}, null])
    expect(() => marklyraStartupPreferences({ autoNumberingForMath: mode })).toThrow();
});
