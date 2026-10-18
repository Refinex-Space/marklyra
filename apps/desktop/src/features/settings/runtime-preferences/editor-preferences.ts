import {
  type MarkLyraEditorPreferences,
  marklyraEditorPreferences,
} from '@marklyra/editor-runtime';

/** Original UI keys map to the portable SDK's typed configuration, never executable strings. */
export const editorPreferenceFields = {
  useCustomFontSize: 'useCustomFontSize',
  customFontSize: 'customFontSize',
  no_pairing_match: 'noPairingMatch',
  match_pari_markdown: 'autoPairExtendSymbol',
  noEmojiAutoComplete: 'noEmojiAutoComplete',
  auto_expand_block: 'expandSimpleBlock',
  codeIndentSize: 'codeIndentSize',
  shiftTabAutoIndent: 'shiftTabAutoIndent',
  show_line_numbers_for_fence: 'showLineNumbersForFence',
  no_line_wrapping: 'noLineWrapping',
  lineWiseCopyCut: 'lineWiseCopyCut',
  no_mid_caret: 'scrollWithCursor',
  copy_markdown_by_default: 'copyMarkdownByDefault',
  line_ending_crlf: 'preferCRLF',
  zoomByMouse: 'zoomByMouse',
  preLinebreakOnExport: 'preLinebreakOnExport',
  mathFormatOnCopy: 'mathFormatOnCopy',
  defaultCodeLang: 'defaultCodeLang',
  defaultCodeLangOption: 'defaultCodeLangOption',
  noHintForOpenLink: 'noHintForOpenLink',
} as const satisfies Record<string, keyof MarkLyraEditorPreferences>;

export type EditorPreferenceKey = keyof typeof editorPreferenceFields;
export const editorPreferenceKeys = Object.keys(editorPreferenceFields) as EditorPreferenceKey[];

export function isEditorPreferenceKey(key: string): key is EditorPreferenceKey {
  return Object.hasOwn(editorPreferenceFields, key);
}

export function updateEditorPreference(
  base: MarkLyraEditorPreferences,
  key: EditorPreferenceKey,
  value: unknown,
): MarkLyraEditorPreferences {
  if (key === 'no_mid_caret' && typeof value === 'boolean') value = !value;
  // The shipped select emits strings because this original control has no numeric type.
  if (key === 'codeIndentSize' && typeof value === 'string' && ['2', '3', '4', '5'].includes(value))
    value = Number(value);
  return marklyraEditorPreferences({ [editorPreferenceFields[key]]: value }, base);
}

export function editorPreferencesOptions(
  value: MarkLyraEditorPreferences,
): Record<string, number | boolean | string> {
  const resolved = marklyraEditorPreferences(value);
  return Object.fromEntries(
    editorPreferenceKeys.map((key) => [
      key,
      key === 'no_mid_caret' ? !resolved.scrollWithCursor : resolved[editorPreferenceFields[key]],
    ]),
  );
}
