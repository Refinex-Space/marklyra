import { describe, expect, it } from 'vitest';
import { documentExportOptions } from '../src/features/export/options.js';
import type { ExportPreferencesSnapshot } from '../src/services/export-preferences.js';

describe('confirmed export settings consumption', () => {
  const settings: ExportPreferencesSnapshot = {
    schemaVersion: 1,
    revision: 4,
    html: { exportTheme: 'night' },
    pdf: {
      exportTheme: 'gothic',
      paper: 'custom',
      'paper.custom': [148, 210],
      'paper.margin': 'custom',
      'paper.marginTop': 12,
      'paper.marginBottom': 14,
      'paper.marginLeft': 10,
      'paper.marginRight': 11,
      splitPages: true,
    },
  };
  it('isolates HTML and PDF themes and applies the captured paper geometry', () => {
    expect(documentExportOptions(settings, false, '稿')).toMatchObject({
      html: { title: '稿', theme: 'night' },
    });
    expect(documentExportOptions(settings, false, '稿').html).not.toHaveProperty('print');
    expect(documentExportOptions(settings, true, '稿')).toEqual({
      html: { title: '稿', theme: 'gothic', print: { splitPages: true } },
      print: {
        paperSize: 'custom',
        customPaperSizeMm: [148, 210],
        marginsMm: { top: 12, bottom: 14, left: 10, right: 11 },
      },
    });
  });
  it('keeps system paper/margins when unset and ignores inactive custom values', () => {
    expect(documentExportOptions({ ...settings, pdf: {} }, true, '稿')).toEqual({
      html: { title: '稿', print: { splitPages: false } },
      print: {},
    });
    const next = documentExportOptions(
      { ...settings, pdf: { paper: 'A4', 'paper.custom': [100, 100], 'paper.marginTop': 50 } },
      true,
      '稿',
    );
    expect(next.print).toEqual({ paperSize: 'A4' });
  });
});
