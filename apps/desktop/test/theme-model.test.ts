import { describe, expect, it } from 'vitest';
import {
  builtinTheme,
  darkBackground,
  defaultThemeCatalog,
  normalizeThemeId,
  themeCatalog,
  validThemeId,
} from '../src/features/themes/model.js';

describe('portable theme identity', () => {
  it.each(['github', 'custom-night', '中文主题', 'a.b', 'x_2', '月影'])(
    'accepts an ordinary filename identity %s',
    (id) => {
      expect(validThemeId(id)).toBe(true);
    },
  );
  it.each([
    '',
    '.hidden',
    'trailing.',
    'base.user',
    'a b',
    'A',
    '../a',
    'x/y',
    'x\\y',
    'x:y',
    'x%2fy',
    'con',
    'lpt1.any',
    'a\n',
    'x'.repeat(121),
  ])('rejects ambiguous or unsafe identities %#', (id) => {
    expect(validThemeId(id)).toBe(false);
    expect(normalizeThemeId(id)).toBe('github');
  });
  it('keeps a custom filename distinct from the engine builtin fallback', () => {
    expect(normalizeThemeId('dark')).toBe('dark');
    expect(normalizeThemeId('中文主题')).toBe('中文主题');
    expect(builtinTheme('中文主题')).toBe('github');
    expect(builtinTheme('night')).toBe('night');
  });
  it('copies a bounded catalog and rejects unsafe or repeated native entries', () => {
    const result = themeCatalog(defaultThemeCatalog);
    expect(result).toEqual(defaultThemeCatalog);
    expect(result.themes).not.toBe(defaultThemeCatalog.themes);
    expect(() =>
      themeCatalog({ folderPath: '', themes: [{ id: '../a', name: 'A', builtin: false }] }),
    ).toThrow();
    expect(() =>
      themeCatalog({
        folderPath: '',
        themes: [defaultThemeCatalog.themes[0], defaultThemeCatalog.themes[0]],
      }),
    ).toThrow();
    expect(() => themeCatalog({ folderPath: 1, themes: [] })).toThrow();
  });
  it('derives native appearance from the loaded background instead of a custom filename', () => {
    expect(darkBackground('rgb(25, 30, 35)', false)).toBe(true);
    expect(darkBackground('rgb(240, 241, 242)', true)).toBe(false);
    expect(darkBackground(undefined, true)).toBe(true);
  });
});
