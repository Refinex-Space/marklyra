export const MAX_THEME_FONT_BYTES = 8 * 1024 * 1024;
export const MAX_THEME_FONT_TOTAL_BYTES = 16 * 1024 * 1024;
export const MAX_THEME_FONT_FACES = 64;

export interface ThemeFontDescriptors {
  style?: string;
  weight?: string;
  stretch?: string;
  unicodeRange?: string;
  featureSettings?: string;
  variationSettings?: string;
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
}
export type ThemeFontSource =
  | { kind: 'local'; name: string }
  | { kind: 'data'; bytes: ArrayBuffer };
export interface ThemeFont {
  family: string;
  descriptors: ThemeFontDescriptors;
  sources: ThemeFontSource[];
}

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid theme font object');
  return value as Record<string, unknown>;
};
const keys = (value: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new TypeError('Unknown theme font property');
};
const text = (value: unknown, limit = 512): string => {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > limit ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new TypeError('Invalid theme font text');
  return value;
};

/** A bounded, typed data contract. No CSS rule, URL or filesystem locator is accepted. */
export function themeFonts(value: unknown): ThemeFont[] {
  if (!Array.isArray(value) || value.length > MAX_THEME_FONT_FACES)
    throw new TypeError('Too many or invalid theme fonts');
  let total = 0;
  return value.map((item) => {
    const font = record(item);
    keys(font, ['family', 'descriptors', 'sources']);
    const family = text(font.family, 256),
      descriptors = record(font.descriptors);
    keys(descriptors, [
      'style',
      'weight',
      'stretch',
      'unicodeRange',
      'featureSettings',
      'variationSettings',
      'display',
    ]);
    const output: ThemeFontDescriptors = {};
    for (const [key, value] of Object.entries(descriptors)) {
      const input = text(value);
      const patterns: Record<string, RegExp> = {
        style: /^(?:normal|italic|oblique(?:\s+-?(?:\d+(?:\.\d+)?|\.\d+)deg){0,2})$/i,
        weight: /^(?:normal|bold|(?:[1-9]\d{0,2}|1000)(?:\s+(?:[1-9]\d{0,2}|1000))?)$/i,
        stretch:
          /^(?:normal|(?:ultra-|extra-|semi-)?(?:condensed|expanded)|(?:\d+(?:\.\d+)?%)(?:\s+\d+(?:\.\d+)?%)?)$/i,
        unicodeRange:
          /^U\+[0-9a-f?]{1,6}(?:-[0-9a-f]{1,6})?(?:\s*,\s*U\+[0-9a-f?]{1,6}(?:-[0-9a-f]{1,6})?)*$/i,
        featureSettings:
          /^(?:normal|["'][a-z\d]{4}["'](?:\s+(?:on|off|\d+))?(?:\s*,\s*["'][a-z\d]{4}["'](?:\s+(?:on|off|\d+))?)*)$/i,
        variationSettings:
          /^(?:normal|["'][a-z\d]{4}["']\s+[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?:\s*,\s*["'][a-z\d]{4}["']\s+[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)*)$/i,
        display: /^(?:auto|block|swap|fallback|optional)$/,
      };
      if (!patterns[key]?.test(input)) throw new TypeError('Unsupported theme font descriptor');
      Object.assign(output, { [key]: input });
    }
    if (!Array.isArray(font.sources) || !font.sources.length || font.sources.length > 16)
      throw new TypeError('Invalid theme font sources');
    const sources: ThemeFontSource[] = font.sources.map((source) => {
      const entry = record(source);
      if (entry.kind === 'local') {
        keys(entry, ['kind', 'name']);
        return { kind: 'local', name: text(entry.name, 256) };
      }
      keys(entry, ['kind', 'bytes']);
      if (
        entry.kind !== 'data' ||
        !(entry.bytes instanceof ArrayBuffer) ||
        !entry.bytes.byteLength ||
        entry.bytes.byteLength > MAX_THEME_FONT_BYTES
      )
        throw new TypeError('Invalid or oversized theme font buffer');
      total += entry.bytes.byteLength;
      if (total > MAX_THEME_FONT_TOTAL_BYTES)
        throw new TypeError('Theme font batch exceeds 16 MiB');
      return { kind: 'data', bytes: entry.bytes.slice(0) };
    });
    return { family, descriptors: output, sources };
  });
}
