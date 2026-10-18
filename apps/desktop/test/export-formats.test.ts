import { describe, expect, it } from 'vitest';
import { conversionExportActions } from '../src/features/export/useDocumentExport.js';
import {
  exportPreferenceChange,
  exportPreferenceControlSupported,
  exportPreferencesOptions,
  exportPreferencesSnapshot,
  originalImageExportValue,
} from '../src/features/settings/runtime-preferences/export-preferences.js';

describe('finite formats and original image preferences', () => {
  it('keeps old records absent while new image fields round trip without enabling arbitrary commands', () => {
    const old = { schemaVersion: 1 as const, revision: 4, html: {}, pdf: {} };
    expect(exportPreferencesSnapshot(old)).toEqual(old);
    const image = {
      imageWidth: 640,
      quality: 2,
      useThemeFontSize: 0,
      imageFontSize: 24,
      exportTheme: 'night',
    };
    const record = { ...old, image, pandocPath: '/opt/homebrew/bin/pandoc' };
    expect(exportPreferencesSnapshot(record)).toEqual(record);
    expect(exportPreferencesOptions(record)['export.image']).toEqual(image);
    expect(exportPreferenceControlSupported('image', 'imageWidth')).toBe(true);
    expect(exportPreferenceControlSupported('pandoc', 'extraArguments')).toBe(false);
    expect(exportPreferenceControlSupported('image', 'command')).toBe(false);
  });
  it('rejects oversized, null, coerced and shell-shaped settings', () => {
    for (const image of [
      null,
      { imageWidth: 0 },
      { imageWidth: 4097 },
      { quality: 4 },
      { quality: '2' },
      { imageFontSize: 129 },
      { useThemeFontSize: true },
      { appendHead: '<script>' },
    ])
      expect(() => exportPreferenceChange('export.image', image)).toThrow();
    for (const path of ['pandoc', 'pandoc; touch /tmp/x', '/bin/pandoc\n--filter'])
      expect(() => exportPreferenceChange('pandocPath', path)).toThrow();
    expect(exportPreferenceChange('pandocPath', '')).toEqual({ key: 'pandocPath', value: '' });
    expect(() =>
      exportPreferencesSnapshot({ schemaVersion: 1, revision: 0, html: {}, pdf: {}, image: null }),
    ).toThrow();
  });
  it('only dispatches the original nine default converter formats', () => {
    expect([...conversionExportActions].sort()).toEqual(
      ['docx', 'odt', 'rtf', 'epub', 'latex', 'wiki', 'rst', 'textile', 'opml']
        .map((key) => `export-${key}`)
        .sort(),
    );
    expect(conversionExportActions.has('export-image')).toBe(false);
  });
  it('normalizes only the shipped image select numeric choices before the strict bridge', () => {
    expect(
      originalImageExportValue({ quality: '2', useThemeFontSize: '1', imageWidth: 640 }),
    ).toEqual({ quality: 2, useThemeFontSize: 1, imageWidth: 640 });
    expect(() =>
      exportPreferenceChange('export.image', originalImageExportValue({ quality: '02' })),
    ).toThrow();
    expect(() => exportPreferenceChange('export.image', { quality: '2' })).toThrow();
  });
});
