/** Parser/constructor options are immutable for one runtime. A fresh iframe is
 * required for reversals of original shared lexer/fence rules. No hot reparse. */
export const defaultMarkLyraStartupPreferences = Object.freeze({
  strictMarkdown: false,
  enableInlineMath: true,
  enableHighlight: false,
  enableSubscript: false,
  enableSuperscript: false,
  enableDiagram: true,
  enableAlert: true,
  noAutoLink: false,
  ignoreLineBreak: false,
  hideBrAndLineBreak: false,
  indentFirstLine: false,
  convertSmartOnRender: false,
  smartQuote: false,
  smartDash: false,
  remapUnicodePunctuation: false,
  noLegacyMath: false,
  gitlabMath: true,
  noDisplayLinesInMath: false,
  allowPhysicsConflict: false,
  autoNumberingForMath: false as false | 'ams' | 'all',
});
type OriginalStartupKey =
  | 'strictMarkdown'
  | 'enableInlineMath'
  | 'enableHighlight'
  | 'enableSubscript'
  | 'enableSuperscript'
  | 'enableDiagram'
  | 'enableAlert'
  | 'noAutoLink'
  | 'ignoreLineBreak'
  | 'hideBrAndLineBreak'
  | 'indentFirstLine';
export type MarkLyraStartupPreferences = { [K in OriginalStartupKey]: boolean } & Partial<{
  convertSmartOnRender: boolean;
  smartQuote: boolean;
  smartDash: boolean;
  remapUnicodePunctuation: boolean;
  noLegacyMath: boolean;
  gitlabMath: boolean;
  noDisplayLinesInMath: boolean;
  allowPhysicsConflict: boolean;
  autoNumberingForMath: false | 'ams' | 'all';
}>;
export type ResolvedMarkLyraStartupPreferences = Required<MarkLyraStartupPreferences>;
export function marklyraStartupPreferences(input: unknown): ResolvedMarkLyraStartupPreferences {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw TypeError('Startup preferences must be an object');
  const value: ResolvedMarkLyraStartupPreferences = { ...defaultMarkLyraStartupPreferences };
  for (const [key, item] of Object.entries(input)) {
    if (!Object.hasOwn(value, key)) throw TypeError('Invalid startup preference');
    if (key === 'autoNumberingForMath') {
      if (item !== false && item !== 'ams' && item !== 'all')
        throw TypeError('Invalid math numbering');
      value.autoNumberingForMath = item;
    } else {
      if (typeof item !== 'boolean') throw TypeError('Invalid startup preference');
      Reflect.set(value, key, item);
    }
  }
  return value;
}
