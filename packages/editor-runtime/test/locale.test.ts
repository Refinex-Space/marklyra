import { describe, expect, it } from 'vitest';
import { marklyraLocale, marklyraLocaleDirectory, marklyraLocales } from '../src/locale.js';

describe('bundled interface languages', () => {
  it('offers only English and Simplified Chinese', () => {
    expect(marklyraLocales).toEqual(['en', 'zh-Hans']);
  });
  it.each(['en', 'en-US', 'en-GB', 'Base', 'EN'])('normalizes English input %s', (value) => {
    expect(marklyraLocale(value)).toBe('en');
    expect(marklyraLocaleDirectory(value)).toBe('Base');
  });
  it.each(['zh-Hans', 'zh-CN', 'zh-Hans-CN', 'ZH-HANS'])(
    'normalizes Simplified Chinese input %s',
    (value) => {
      expect(marklyraLocale(value)).toBe('zh-Hans');
      expect(marklyraLocaleDirectory(value)).toBe('zh-Hans');
    },
  );
  it.each(['ja-JP', 'zh-Hant', '../outside', 'en/../../outside', 'Base.lproj', '', null, 1, {}])(
    'falls back for an unsupported persisted or injected value %s',
    (value) => {
      expect(marklyraLocale(value)).toBe('en');
      expect(marklyraLocaleDirectory(value)).toBe('Base');
      expect(marklyraLocale(value, 'zh-Hans')).toBe('zh-Hans');
      expect(marklyraLocaleDirectory(value, 'zh-Hans')).toBe('zh-Hans');
    },
  );
});
