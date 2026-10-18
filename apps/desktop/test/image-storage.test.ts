import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeImageStorageFolder,
  previewImageStorageFolder,
  validateImageStorageFolder,
} from '../src/features/settings/image-storage.js';
import {
  defaultPreferences,
  normalizePreferences,
  preferencesKey,
  readPreferences,
  savePreferences,
} from '../src/features/settings/preferences.js';

describe('native-scoped image directory requests', () => {
  it.each([
    ['', ''],
    ['/', '/'],
    ['/tmp/images', '/tmp/images'],
    ['./images', './images'],
    ['../images', '../images'],
    ['images/..', 'images/..'],
    ['images/../outside', 'images/../outside'],
    ['images/./nested', 'images/./nested'],
    ['images/.', 'images/.'],
    ['.', '.'],
    ['assets', 'assets'],
    ['assets/', 'assets'],
    ['${filename}.assets/', '${filename}.assets'],
    ['images/${filename}', 'images/${filename}'],
    ['中文 资料/图片', '中文 资料/图片'],
    ['assets.v2/screenshots', 'assets.v2/screenshots'],
  ])('accepts %s without authorizing any filesystem path', (value, folder) => {
    expect(validateImageStorageFolder(value)).toEqual({ valid: true, folder });
    expect(normalizeImageStorageFolder(value)).toBe(folder);
  });

  it.each([
    '\\server\\images',
    'C:\\images',
    'C:images',
    'https://example.test/images',
    'file:///tmp/images',
    'images//nested',
    'images//',
    ' images',
    'images ',
    'images.',
    'images\\nested',
    'images\u0000',
    'images\n',
    'images\t',
    'images\u0085',
    'images\ud800',
    'images?query',
    'images*',
    'images|other',
    'images<other',
    'CON',
    'con.txt',
    'NUL/screenshots',
    'images/COM1',
    'LPT9.foo',
    '${document}.assets',
    'images/${unknown}',
  ])('rejects nonportable or escaping template %j', (value) => {
    expect(validateImageStorageFolder(value).valid).toBe(false);
    expect(normalizeImageStorageFolder(value)).toBe('assets');
  });

  it('bounds UTF-8 bytes and ignores malformed stored types', () => {
    expect(validateImageStorageFolder('图'.repeat(80)).valid).toBe(true);
    expect(validateImageStorageFolder('图'.repeat(81)).valid).toBe(false);
    for (const value of [null, 3, {}, [], true])
      expect(normalizeImageStorageFolder(value)).toBe('assets');
  });

  it('previews only valid templates using an explicit example filename', () => {
    expect(previewImageStorageFolder('.')).toBe('文档所在目录/');
    expect(previewImageStorageFolder('assets/')).toBe('assets/');
    expect(previewImageStorageFolder('${filename}.assets')).toBe('笔记.assets/');
    expect(previewImageStorageFolder('images/${filename}', '旅途.notes.md')).toBe(
      'images/旅途.notes/',
    );
    expect(previewImageStorageFolder('../images')).toBe('../images/');
    expect(previewImageStorageFolder('')).toContain('不复制');
  });
});

describe('image directory preference persistence', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('migrates old preference records without changing supported settings', () => {
    expect(normalizePreferences({ formatToolbar: true, wordsPerMinute: 300 })).toEqual({
      ...defaultPreferences,
      formatToolbar: true,
      wordsPerMinute: 300,
      imageStorageFolder: 'assets',
    });
    expect(normalizePreferences({ imageStorageFolder: '../outside' }).imageStorageFolder).toBe(
      '../outside',
    );
    expect(normalizePreferences({ imageStorageFolder: '.' }).imageStorageFolder).toBe('.');
  });
  it('persists the canonical template and reads it back without expanding a document name', () => {
    const records = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => records.set(key, value),
    });
    savePreferences({ ...defaultPreferences, imageStorageFolder: '${filename}.assets/' });
    expect(JSON.parse(records.get(preferencesKey) ?? '{}').imageStorageFolder).toBe(
      '${filename}.assets',
    );
    expect(readPreferences().imageStorageFolder).toBe('${filename}.assets');
  });
  it('keeps the default usable when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage unavailable');
      },
      setItem: () => {
        throw new Error('storage unavailable');
      },
    });
    expect(readPreferences()).toEqual(defaultPreferences);
    expect(() => savePreferences({ ...defaultPreferences, imageStorageFolder: '.' })).not.toThrow();
  });
});
