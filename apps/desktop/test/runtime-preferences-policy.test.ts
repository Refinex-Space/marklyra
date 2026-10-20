import { defaultMarkLyraEditorPreferences } from '@marklyra/editor-runtime';
import { describe, expect, it } from 'vitest';
import {
  editorPreferencesOptions,
  isEditorPreferenceKey,
  updateEditorPreference,
} from '../src/features/settings/runtime-preferences/editor-preferences.js';
import {
  initialPreferencesOptions,
  preferenceChange,
  preferenceThemeFiles,
  runtimePreferencesUrl,
} from '../src/features/settings/runtime-preferences/policy.js';

describe('runtime preferences policy', () => {
  it('accepts supported values without granting source code, upload or filesystem capabilities', () => {
    expect(preferenceChange('theme', 'marklyra-dark.css')).toEqual({
      key: 'theme',
      value: 'marklyra-dark.css',
    });
    expect(preferenceChange('wordsPerMinute', 600)).toEqual({ key: 'wordsPerMinute', value: 600 });
    const pathTemplate = `./assets/\${filename}`;
    expect(preferenceChange('custom_image_save_location', pathTemplate)).toEqual({
      key: 'custom_image_save_location',
      value: pathTemplate,
    });
    for (const [key, value] of [
      ['image_save_location', ''],
      ['custom_image_save_location', '../outside'],
      ['custom_image_save_location', '/absolute'],
      ['custom_image_save_location', './upload'],
      ['no_image_move_for_local', true],
      ['apply_image_move_for_web', false],
      ['use_relative_path_for_img', true],
      ['relativePathWithDot', true],
      ['showDirectoryDocumentCount', false],
      ['showDirectoryDocumentCount', true],
    ])
      expect(preferenceChange(key, value)).toEqual({ key, value });
    for (const [key, value] of [
      ['execCommand', 'anything()'],
      ['image_uploader', 'custom'],
      ['image_save_location', 'ipic'],
      ['custom_image_save_location', 'C:\\outside'],
      ['theme', '../outside.css'],
      ['wordsPerMinute', 0],
      ['wordsPerMinute', 1000],
      ['wordsPerMinute', '600'],
      ['always_show_wordcount', 1],
      ['showDirectoryDocumentCount', 'yes'],
      ['showDirectoryDocumentCount', 0],
    ])
      expect(() => preferenceChange(key, value)).toThrow();
  });

  it('shows folder document counts unless the host says otherwise', () => {
    expect(initialPreferencesOptions({}).showDirectoryDocumentCount).toBe(true);
    expect(
      initialPreferencesOptions({ showDirectoryDocumentCount: false }).showDirectoryDocumentCount,
    ).toBe(false);
  });

  it('initializes only supported host-owned settings and bounded display metadata', () => {
    const options = initialPreferencesOptions({
      theme: 'marklyra-dark.css',
      wordsPerMinute: 400,
      allThemes: ['marklyra-dark.css', 'custom.css'],
      _documentPath: '/private/file',
      _options: { license: 'secret' },
      osVersion: '26.5.2',
    });
    expect(options.theme).toBe('marklyra-dark.css');
    expect(options.wordsPerMinute).toBe(400);
    expect(options.osVersion).toBe('26.5.2');
    expect(options.allThemes).toEqual(['marklyra-dark.css', 'custom.css']);
    expect(options).not.toHaveProperty('_documentPath');
    expect(options).not.toHaveProperty('_options');
    expect(options.send_usage_info).toBe(false);
    expect(options.allow_image_upload).toBe(false);
  });

  it('keeps the host window style fixed and rejects obsolete window-style preferences', () => {
    const options = initialPreferencesOptions({
      use_seamless_window: false,
      framelessWindow: true,
    });
    expect(options.use_seamless_window).toBe(true);
    expect(options).not.toHaveProperty('framelessWindow');
    for (const key of ['use_seamless_window', 'framelessWindow'])
      expect(() => preferenceChange(key, false)).toThrow();
  });

  it('accepts catalogued user themes and refuses unlisted choices or unsafe catalog names', () => {
    const themes = preferenceThemeFiles(['marklyra-light.css', 'custom.css', 'custom.css']);
    expect(themes).toEqual(['marklyra-light.css', 'custom.css']);
    expect(preferenceChange('theme', 'custom.css', themes)).toEqual({
      key: 'theme',
      value: 'custom.css',
    });
    expect(() => preferenceChange('theme', 'marklyra-dark.css', themes)).toThrow();
    for (const value of [
      [],
      ['../outside.css'],
      ['Upper.css'],
      ['base.user.css'],
      ['bad name.css'],
      ['marklyra-light.css', 1],
    ])
      expect(() => preferenceThemeFiles(value)).toThrow();
  });

  it('requires the isolated local runtime origin on both native platforms', () => {
    for (const value of [
      'http://127.0.0.1:4196/setting.html',
      'marklyra://localhost/preferences/setting.html',
      'http://marklyra.localhost/preferences/setting.html',
    ])
      expect(
        runtimePreferencesUrl(value, 'http://localhost:4195/', 'http://localhost:4195').href,
      ).toBe(value);
    for (const value of [
      'https://example.org/setting.html',
      'file:///private/setting.html',
      'javascript:alert(1)',
      'http://localhost:4195/setting.html',
    ])
      expect(() =>
        runtimePreferencesUrl(value, 'http://localhost:4195/', 'http://localhost:4195'),
      ).toThrow();
  });

  it('maps original editor controls to portable typed settings without mutation', () => {
    const base = { ...defaultMarkLyraEditorPreferences };
    const next = updateEditorPreference(base, 'no_pairing_match', true);
    expect(base).toEqual(defaultMarkLyraEditorPreferences);
    expect(next).toEqual({ ...base, noPairingMatch: true });
    expect(editorPreferencesOptions(next)).toEqual({
      useCustomFontSize: false,
      customFontSize: 14,
      no_pairing_match: true,
      match_pari_markdown: false,
      noEmojiAutoComplete: false,
      noHintForOpenLink: false,
      auto_expand_block: false,
      codeIndentSize: 4,
      shiftTabAutoIndent: false,
      show_line_numbers_for_fence: false,
      no_line_wrapping: false,
      lineWiseCopyCut: false,
      no_mid_caret: true,
      copy_markdown_by_default: false,
      line_ending_crlf: false,
      zoomByMouse: false,
      preLinebreakOnExport: false,
      mathFormatOnCopy: 'svg',
      defaultCodeLang: '',
      defaultCodeLangOption: 1,
    });
    expect(preferenceChange('customFontSize', 9.5)).toEqual({ key: 'customFontSize', value: 9.5 });
    expect(preferenceChange('match_pari_markdown', true)).toEqual({
      key: 'match_pari_markdown',
      value: true,
    });
    for (const value of [2, 3, 4, 5, '2', '3', '4', '5'])
      expect(preferenceChange('codeIndentSize', value)).toEqual({
        key: 'codeIndentSize',
        value: Number(value),
      });
    expect(preferenceChange('shiftTabAutoIndent', true)).toEqual({
      key: 'shiftTabAutoIndent',
      value: true,
    });
    for (const key of ['show_line_numbers_for_fence', 'no_line_wrapping', 'lineWiseCopyCut']) {
      for (const value of [true, false])
        expect(preferenceChange(key, value)).toEqual({ key, value });
      for (const value of ['true', 'false', 0, 1, null])
        expect(() => preferenceChange(key, value)).toThrow();
    }
    expect(
      initialPreferencesOptions({
        show_line_numbers_for_fence: true,
        no_line_wrapping: true,
        lineWiseCopyCut: true,
      }),
    ).toMatchObject({
      show_line_numbers_for_fence: true,
      no_line_wrapping: true,
      lineWiseCopyCut: true,
    });
    for (const [key, value] of [
      ['useCustomFontSize', 'true'],
      ['customFontSize', '18px'],
      ['customFontSize', 25],
      ['customFontSize', Number.NaN],
      ['no_pairing_match', 1],
      ['match_pari_markdown', 'false'],
      ['noPairingMatch', true],
      ['preset_spell_check', 'en-US'],
      ['indentSize', '4'],
      ['codeIndentSize', '02'],
      ['codeIndentSize', ' 2'],
      ['codeIndentSize', '2px'],
      ['codeIndentSize', 2.5],
      ['codeIndentSize', 0],
      ['codeIndentSize', -1],
      ['shiftTabAutoIndent', 'true'],
      ['enable_highlight', 'true'],
    ])
      expect(() => preferenceChange(key, value)).toThrow();
    expect(
      initialPreferencesOptions({ useCustomFontSize: true, customFontSize: 20 }),
    ).toMatchObject({
      useCustomFontSize: true,
      customFontSize: 20,
    });
  });

  it('keeps Markdown policy numeric, Native-owned and separate from editor preference storage', () => {
    for (const value of [-1, 0, 2, 3, 4, 5])
      expect(preferenceChange('indentSize', value)).toEqual({ key: 'indentSize', value });
    for (const value of [true, false])
      expect(preferenceChange('prettyIndent', value)).toEqual({ key: 'prettyIndent', value });
    for (const value of ['0', '4', null, 1, 2.5, 6, Number.NaN])
      expect(() => preferenceChange('indentSize', value)).toThrow();
    for (const value of ['true', 'false', null, 0, 1])
      expect(() => preferenceChange('prettyIndent', value)).toThrow();
    expect(initialPreferencesOptions({})).toMatchObject({
      indentSize: 2,
      prettyIndent: false,
      marklyraMarkdownActions: false,
    });
    expect(
      initialPreferencesOptions({
        indentSize: 0,
        prettyIndent: true,
        marklyraMarkdownActions: true,
      }),
    ).toMatchObject({ indentSize: 0, prettyIndent: true, marklyraMarkdownActions: true });
    expect(isEditorPreferenceKey('indentSize')).toBe(false);
    expect(isEditorPreferenceKey('prettyIndent')).toBe(false);
  });
});

it('supplies the original outline read alias without granting it write authority', () => {
  for (const value of [true, false]) {
    const options = initialPreferencesOptions({
      can_collapse_outline_panel: value,
      canCollapseOutlinePanel: 'untrusted',
    });
    expect(options.can_collapse_outline_panel).toBe(value);
    expect(options.canCollapseOutlinePanel).toBe(value);
  }
  expect(() => preferenceChange('canCollapseOutlinePanel', true)).toThrow();
});
