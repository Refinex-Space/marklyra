import { describe, expect, it } from 'vitest';
import {
  exportPreferenceChange,
  exportPreferenceControlSupported,
  exportPreferencesOptions,
  exportPreferencesSnapshot,
} from '../src/features/settings/runtime-preferences/export-preferences.js';
import {
  initialPreferencesOptions,
  preferenceChange,
} from '../src/features/settings/runtime-preferences/policy.js';

describe('restricted original export preferences', () => {
  it('preserves absent defaults and complete original format objects', () => {
    const value = {
      schemaVersion: 1,
      revision: 3,
      html: { exportTheme: 'night' },
      pdf: {
        paper: 'custom',
        'paper.custom': [148, 210],
        'paper.margin': 'custom',
        'paper.marginLeft': 10,
        splitPages: true,
      },
    };
    expect(exportPreferencesSnapshot(value)).toEqual(value);
    expect(
      initialPreferencesOptions(exportPreferencesOptions(exportPreferencesSnapshot(value)))[
        'export.pdf'
      ],
    ).toEqual(value.pdf);
    expect(
      exportPreferencesSnapshot({ schemaVersion: 1, revision: 0, html: {}, pdf: {} }).pdf,
    ).toEqual({});
    expect(preferenceChange('export.html', { exportTheme: '' })).toEqual({
      key: 'export.html',
      value: { exportTheme: '' },
    });
  });
  it('rejects commands, raw append markup, unknown fields and inert headers', () => {
    for (const value of [
      { runCommand: true },
      { appendBody: '<script/>' },
      { sidebar: true },
      { exportTheme: 'other' },
      { exportTheme: '../night' },
    ])
      expect(() => exportPreferenceChange('export.html', value)).toThrow();
    for (const value of [
      { header: 'Hello' },
      { footer: '${pageNo}' },
      { author: 'x' },
      { 'paper.margin': 'default' },
      { paper: 'B5' },
    ])
      expect(() => exportPreferenceChange('export.pdf', value)).toThrow();
    expect(exportPreferenceControlSupported('pdf', 'header')).toBe(false);
    expect(exportPreferenceControlSupported('pdf', 'paper.marginTop')).toBe(true);
  });
  it('bounds paper values without coercion or malformed dimensions', () => {
    for (const value of [
      null,
      [],
      { paper: null },
      { 'paper.custom': [0, 297] },
      { 'paper.custom': [210, 297, 1] },
      { 'paper.custom': ['210', 297] },
      { 'paper.marginTop': -1 },
      { 'paper.marginTop': Number.NaN },
      { splitPages: 'true' },
    ])
      expect(() => exportPreferenceChange('export.pdf', value)).toThrow();
    for (const value of [
      { schemaVersion: 2, revision: 0, html: {}, pdf: {} },
      { schemaVersion: 1, revision: -1, html: {}, pdf: {} },
      { schemaVersion: 1, revision: 0, html: {}, pdf: {}, command: 'x' },
    ])
      expect(() => exportPreferencesSnapshot(value)).toThrow();
  });
});
