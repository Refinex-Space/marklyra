/** URLs are supplied by the host; the SDK has no filesystem or desktop authority. */
export interface ThemeStyles {
  theme: string | null;
  baseUser: string | null;
  themeUser: string | null;
}

export const emptyThemeStyles: Readonly<ThemeStyles> = Object.freeze({
  theme: null,
  baseUser: null,
  themeUser: null,
});

export function themeStyles(value: unknown, runtimeUrl: string): ThemeStyles {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid theme styles');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['theme', 'baseUser', 'themeUser'].includes(key)))
    throw new TypeError('Unknown theme style');
  const base = new URL(runtimeUrl);
  const result: ThemeStyles = { ...emptyThemeStyles };
  for (const key of ['theme', 'baseUser', 'themeUser'] as const) {
    const source = input[key];
    if (source === undefined || source === null) continue;
    if (
      typeof source !== 'string' ||
      source.length > 8192 ||
      Array.from(source).some((character) => character.charCodeAt(0) <= 32)
    )
      throw new TypeError('Invalid theme style URL');
    const url = new URL(source, base);
    if (
      !['http:', 'https:', 'marklyra:'].includes(url.protocol) ||
      url.protocol !== base.protocol ||
      url.host !== base.host ||
      url.username ||
      url.password ||
      url.hash ||
      !url.pathname.toLowerCase().endsWith('.css')
    )
      throw new TypeError('Theme styles require CSS at the runtime origin');
    result[key] = url.href;
  }
  return result;
}
