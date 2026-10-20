import { describe, expect, it } from 'vitest';
import {
  customExportProblems,
  defaultExportPreferences,
  exportPreferenceChange,
  exportPreferencesSnapshot,
  isExportPreferenceKey,
  pandocOptionsFor,
} from '../src/features/export/preferences.js';

const ID = '0b1f6c1e-6a4e-4f0a-9d53-0f2f7a8f6b11';
const record = (extra: Record<string, unknown> = {}) => ({
  ...defaultExportPreferences(),
  revision: 3,
  ...extra,
});
const item = (change: Record<string, unknown> = {}) => ({
  id: ID,
  name: 'AsciiDoc',
  writer: 'asciidoc',
  extension: 'adoc',
  options: {},
  ...change,
});

describe('export preference model', () => {
  it('round trips complete records and fills every absent group', () => {
    const value = record({
      general: { folderMode: 'custom', folder: '/Users/me/Exports', openLocation: true },
      html: { exportTheme: 'marklyra-dark', extraCss: '#write{max-width:900px}' },
      pdf: {
        paper: 'custom',
        'paper.custom': [148, 210],
        'paper.margin': 'custom',
        'paper.marginLeft': 10,
        landscape: true,
        splitPages: true,
        bookmarks: false,
        header: '${title}',
        footerRight: '第 ${pageNo} / ${totalPages} 页',
      },
      image: { imageWidth: 800, quality: 2, useThemeFontSize: 0, imageFontSize: 20 },
      formats: { docx: { toc: true, tocDepth: 2, referenceDoc: '/Users/me/ref.docx' } },
      custom: [item({ options: { extraArguments: '--toc' } })],
      pandocPath: 'C:\\Program Files\\Pandoc\\pandoc.exe',
    });
    expect(exportPreferencesSnapshot(value)).toEqual(value);
    const old = { schemaVersion: 1, revision: 7, html: { exportTheme: 'marklyra-dark' }, pdf: {} };
    expect(exportPreferencesSnapshot(old)).toEqual({
      ...defaultExportPreferences(),
      revision: 7,
      html: { exportTheme: 'marklyra-dark' },
    });
  });

  it('knows its keys and rejects everything else', () => {
    for (const key of [
      'export.general',
      'export.html',
      'export.pdf',
      'export.image',
      'export.formats',
      'export.custom',
      'pandocPath',
    ])
      expect(isExportPreferenceKey(key)).toBe(true);
    expect(isExportPreferenceKey('export.docx')).toBe(false);
    expect(() => exportPreferenceChange('export.docx', {})).toThrow();
    expect(() => exportPreferenceChange(undefined, {})).toThrow();
  });

  it('rejects commands, markup, unknown fields and out-of-range values', () => {
    const bad: [string, unknown][] = [
      ['export.html', { runCommand: true }],
      ['export.html', { exportTheme: '../night' }],
      ['export.html', { extraCss: '</style><script>x</script>' }],
      ['export.html', { extraCss: 'a'.repeat(16 * 1024 + 1) }],
      ['export.pdf', { paper: 'B5' }],
      ['export.pdf', { paper: null }],
      ['export.pdf', { 'paper.custom': [0, 297] }],
      ['export.pdf', { 'paper.custom': [210, 297, 1] }],
      ['export.pdf', { 'paper.marginTop': -1 }],
      ['export.pdf', { 'paper.marginTop': Number.NaN }],
      ['export.pdf', { splitPages: 'true' }],
      ['export.pdf', { header: 'line\nbreak' }],
      ['export.pdf', { footer: 'x'.repeat(201) }],
      ['export.pdf', { author: 'x'.repeat(101) }],
      ['export.image', { imageWidth: 0 }],
      ['export.image', { imageWidth: 4097 }],
      ['export.image', { quality: '2' }],
      ['export.image', { quality: 4 }],
      ['export.image', { useThemeFontSize: true }],
      ['export.image', { imageFontSize: 129 }],
      ['export.image', null],
      ['export.general', { folderMode: 'anywhere' }],
      ['export.general', { folder: 'relative/path' }],
      ['export.general', { command: 'x' }],
      ['export.formats', { pdf: {} }],
      ['export.formats', { docx: { filter: 'x.lua' } }],
      ['export.formats', { docx: { tocDepth: 7 } }],
      ['export.formats', { docx: { extraArguments: 'a'.repeat(1025) } }],
      ['pandocPath', 'pandoc'],
      ['pandocPath', 'pandoc; touch /tmp/x'],
      ['pandocPath', '/bin/pandoc\n--filter'],
    ];
    for (const [key, value] of bad)
      expect(() => exportPreferenceChange(key, value), `${key} ${JSON.stringify(value)}`).toThrow();
    expect(exportPreferenceChange('pandocPath', '')).toEqual({ key: 'pandocPath', value: '' });
    expect(exportPreferenceChange('pandocPath', 'D:\\tools\\pandoc.exe').value).toBe(
      'D:\\tools\\pandoc.exe',
    );
    for (const value of [
      { schemaVersion: 2, revision: 0, html: {}, pdf: {} },
      { schemaVersion: 1, revision: -1, html: {}, pdf: {} },
      { schemaVersion: 1, revision: 0, html: {}, pdf: {}, command: 'x' },
      { ...record(), image: null },
      { ...record(), formats: { docx: { header: 'x' } } },
    ])
      expect(() => exportPreferencesSnapshot(value)).toThrow();
  });

  it('validates custom exports like the host does', () => {
    expect(exportPreferenceChange('export.custom', [item()]).value).toHaveLength(1);
    expect(
      exportPreferenceChange('export.custom', [item({ writer: 'markdown+pipe_tables-smart' })]),
    ).toBeTruthy();
    for (const change of [
      { id: 'nope' },
      { name: '   ' },
      { name: 'x'.repeat(41) },
      { writer: 'pdf' },
      { writer: 'chunkedhtml' },
      { writer: 'my.lua' },
      { writer: 'Asciidoc' },
      { extension: 'exe' },
      { extension: 'a.b' },
      { extension: '' },
      { options: { template: 'relative' } },
    ])
      expect(
        () => exportPreferenceChange('export.custom', [item(change)]),
        JSON.stringify(change),
      ).toThrow();
    expect(() => exportPreferenceChange('export.custom', [item(), item()])).toThrow();
    const ids = Array.from(
      { length: 13 },
      (_, index) => `0b1f6c1e-6a4e-4f0a-9d53-${String(index).padStart(12, '0')}`,
    );
    expect(() =>
      exportPreferenceChange(
        'export.custom',
        ids.map((id) => item({ id })),
      ),
    ).toThrow();
    expect(customExportProblems({ name: '', writer: 'pdf', extension: 'EXE' })).toEqual({
      name: expect.any(String),
      writer: expect.any(String),
      extension: expect.any(String),
    });
    expect(customExportProblems({ name: 'Slides', writer: 'pptx', extension: 'pptx' })).toEqual({});
  });

  it('resolves options of built-in and custom targets', () => {
    const value = exportPreferencesSnapshot(
      record({
        formats: { docx: { toc: true } },
        custom: [item({ writer: 'gfm', extension: 'md', options: { numberSections: true } })],
      }),
    );
    expect(pandocOptionsFor(value, 'docx')).toEqual({ toc: true });
    expect(pandocOptionsFor(value, 'epub')).toEqual({});
    expect(pandocOptionsFor(value, `custom:${ID}`)).toEqual({ numberSections: true });
    expect(pandocOptionsFor(value, 'custom:missing')).toEqual({});
    expect(pandocOptionsFor(value, 'pdf')).toEqual({});
  });
});
