import {
  defaultMarkLyraStartupPreferences,
  type MarkLyraStartupPreferences,
} from '@marklyra/editor-runtime';
export const startupEditorFields = {
  strict_mode: 'strictMarkdown',
  enable_inline_math: 'enableInlineMath',
  enable_highlight: 'enableHighlight',
  enable_subscript: 'enableSubscript',
  enable_superscript: 'enableSuperscript',
  enable_diagram: 'enableDiagram',
  enableAlert: 'enableAlert',
  noAutoLink: 'noAutoLink',
  ignoreLineBreak: 'ignoreLineBreak',
  hideBrAndLineBreak: 'hideBrAndLineBreak',
  indentFirstLine: 'indentFirstLine',
  SmartyPantsOnRendering: 'convertSmartOnRender',
  smartQuote: 'smartQuote',
  smartDash: 'smartDash',
  remapPunctuation: 'remapUnicodePunctuation',
  noLegacyMath: 'noLegacyMath',
  gitlabMath: 'gitlabMath',
  noDisplayLinesInMath: 'noDisplayLinesInMath',
  allowPhysicsConflict: 'allowPhysicsConflict',
  auto_numbering_for_math: 'autoNumberingForMath',
} as const satisfies Record<string, keyof MarkLyraStartupPreferences>;
export type StartupEditorKey = keyof typeof startupEditorFields;
export const startupEditorKeys = Object.keys(startupEditorFields) as StartupEditorKey[];
export function isStartupEditorKey(key: string): key is StartupEditorKey {
  return Object.hasOwn(startupEditorFields, key);
}
export function startupEditorOptions(
  values: Partial<Record<StartupEditorKey, unknown>>,
): Record<StartupEditorKey, boolean | string> {
  return Object.fromEntries(
    startupEditorKeys.map((key) => [
      key,
      key === 'auto_numbering_for_math'
        ? (values[key] ?? '')
        : typeof values[key] === 'boolean'
          ? values[key]
          : defaultMarkLyraStartupPreferences[startupEditorFields[key]],
    ]),
  ) as Record<StartupEditorKey, boolean | string>;
}
export function startupEditorConfiguration(
  values: Partial<Record<StartupEditorKey, unknown>>,
): MarkLyraStartupPreferences {
  const options = startupEditorOptions(values);
  return Object.fromEntries(
    startupEditorKeys.map((key) => [
      startupEditorFields[key],
      key === 'auto_numbering_for_math' ? options[key] || false : options[key],
    ]),
  ) as MarkLyraStartupPreferences;
}
