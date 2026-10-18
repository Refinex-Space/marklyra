export interface MarkLyraEditorPreferences {
  useCustomFontSize: boolean;
  customFontSize: number;
  noPairingMatch: boolean;
  autoPairExtendSymbol: boolean;
  noEmojiAutoComplete: boolean;
  expandSimpleBlock: boolean;
  codeIndentSize: 2 | 3 | 4 | 5;
  shiftTabAutoIndent: boolean;
  showLineNumbersForFence: boolean;
  noLineWrapping: boolean;
  lineWiseCopyCut: boolean;
  scrollWithCursor?: boolean;
  copyMarkdownByDefault?: boolean;
  preferCRLF?: boolean;
  zoomByMouse?: boolean;
  preLinebreakOnExport?: boolean;
  mathFormatOnCopy?: 'svg' | 'latex';
  defaultCodeLang?: string;
  defaultCodeLangOption?: 0 | 1 | 2 | 3;
  noHintForOpenLink?: boolean;
}

export type ResolvedMarkLyraEditorPreferences = Required<MarkLyraEditorPreferences>;

export const defaultMarkLyraEditorPreferences: Readonly<ResolvedMarkLyraEditorPreferences> =
  Object.freeze({
    useCustomFontSize: false,
    customFontSize: 14,
    noPairingMatch: false,
    autoPairExtendSymbol: false,
    noEmojiAutoComplete: false,
    expandSimpleBlock: false,
    codeIndentSize: 4,
    shiftTabAutoIndent: false,
    showLineNumbersForFence: false,
    noLineWrapping: false,
    lineWiseCopyCut: false,
    scrollWithCursor: false,
    copyMarkdownByDefault: false,
    preferCRLF: false,
    zoomByMouse: false,
    preLinebreakOnExport: false,
    mathFormatOnCopy: 'svg',
    defaultCodeLang: '',
    defaultCodeLangOption: 1,
    noHintForOpenLink: false,
  });

/** Shared browser contract. No desktop settings, filesystem or React authority. */
export function marklyraEditorPreferences(
  value: unknown,
  base: Readonly<MarkLyraEditorPreferences> = defaultMarkLyraEditorPreferences,
): ResolvedMarkLyraEditorPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Editor preferences must be an object');
  const result = { ...defaultMarkLyraEditorPreferences, ...base };
  for (const [key, input] of Object.entries(value)) {
    if (!Object.hasOwn(defaultMarkLyraEditorPreferences, key))
      throw new TypeError(`Unknown editor preference: ${key}`);
    if (key === 'customFontSize') {
      if (typeof input !== 'number' || !Number.isFinite(input) || input < 9 || input > 24)
        throw new TypeError('customFontSize must be a finite number between 9 and 24');
      result.customFontSize = input;
    } else if (key === 'mathFormatOnCopy') {
      if (input !== 'svg' && input !== 'latex') throw TypeError('Invalid math copy format');
      result.mathFormatOnCopy = input;
    } else if (key === 'defaultCodeLang') {
      if (typeof input !== 'string' || !/^[a-z0-9_+#./-]{0,80}$/i.test(input))
        throw TypeError('Invalid default code language');
      result.defaultCodeLang = input;
    } else if (key === 'defaultCodeLangOption') {
      if (input !== 0 && input !== 1 && input !== 2 && input !== 3)
        throw TypeError('Invalid default code language mask');
      result.defaultCodeLangOption = input;
    } else if (key === 'codeIndentSize') {
      if (input !== 2 && input !== 3 && input !== 4 && input !== 5)
        throw new TypeError('codeIndentSize must be 2, 3, 4 or 5');
      result.codeIndentSize = input;
    } else {
      if (typeof input !== 'boolean') throw new TypeError(`${key} must be boolean`);
      result[
        key as Exclude<
          keyof MarkLyraEditorPreferences,
          | 'customFontSize'
          | 'codeIndentSize'
          | 'defaultCodeLang'
          | 'defaultCodeLangOption'
          | 'mathFormatOnCopy'
        >
      ] = input;
    }
  }
  return result;
}
