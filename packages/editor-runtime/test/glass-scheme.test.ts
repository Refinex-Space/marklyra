import { describe, expect, it } from 'vitest';
import { glassTheme } from '../src/runtime/glass-scheme.js';

describe('Liquid Glass scheme of the runtime page', () => {
  it('follows the document background like the shell', () => {
    expect(glassTheme('rgb(255, 255, 255)', 'normal', true)).toBe('light');
    expect(glassTheme('rgb(13, 17, 23)', 'normal', false)).toBe('dark');
    expect(glassTheme('rgba(30, 30, 30, 0.9)', 'light', false)).toBe('dark');
  });
  it('falls back to the theme color-scheme when the background cannot be read', () => {
    expect(glassTheme('rgba(0, 0, 0, 0)', 'dark', false)).toBe('dark');
    expect(glassTheme(undefined, 'light', true)).toBe('light');
    expect(glassTheme('color(srgb 0 0 0)', 'light dark', true)).toBe('dark');
    expect(glassTheme('color(srgb 0 0 0)', 'light dark', false)).toBe('light');
    expect(glassTheme(undefined, 'normal', true)).toBe('light');
  });
});
