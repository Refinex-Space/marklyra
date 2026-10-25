export const marklyraLocales = ['en', 'zh-Hans'] as const;
export type MarkLyraLocale = (typeof marklyraLocales)[number];

/** Only bundled UI languages may reach the dictionary loader. Unsupported
 * saved values fall back without interpreting them as resource paths. */
export function marklyraLocale(value: unknown, fallback: MarkLyraLocale = 'en'): MarkLyraLocale {
  if (typeof value !== 'string') return fallback;
  if (/^(?:Base|en(?:-[a-z]{2})?)$/i.test(value)) return 'en';
  if (/^zh-(?:CN|Hans(?:-[a-z]{2})?)$/i.test(value)) return 'zh-Hans';
  return fallback;
}

export function marklyraLocaleDirectory(
  value: unknown,
  fallback: MarkLyraLocale = 'en',
): 'Base' | 'zh-Hans' {
  return marklyraLocale(value, fallback) === 'zh-Hans' ? 'zh-Hans' : 'Base';
}
