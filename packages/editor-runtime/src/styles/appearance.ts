/** Computed presentation values only; no stylesheet text or host authority crosses this boundary. */
export const THEME_APPEARANCE_KEYS = [
  '--marklyra-sidebar-font-family',
  '--marklyra-sidebar-font-size',
  '--marklyra-sidebar-line-height',
  '--marklyra-sidebar-font-weight',
  '--marklyra-sidebar-text',
  '--marklyra-control-text',
  '--marklyra-control-hover-text',
  '--marklyra-sidebar-item-hover-bg',
  '--marklyra-sidebar-item-hover-text',
  '--marklyra-active-file-bg',
  '--marklyra-active-file-text',
  '--marklyra-active-file-border',
  '--marklyra-sidebar-border',
  '--marklyra-sidebar-border-right',
  '--marklyra-sidebar-padding-top',
  '--marklyra-sidebar-top',
  '--marklyra-sidebar-header-border',
  '--marklyra-sidebar-footer-hover-bg',
  '--marklyra-sidebar-footer-hover-text',
  '--marklyra-article-font-weight',
  '--marklyra-article-selected-font-weight',
  '--marklyra-article-line-height',
  '--marklyra-article-text',
  '--marklyra-article-selected-text',
  '--marklyra-article-opacity',
  '--marklyra-article-selected-opacity',
  '--marklyra-article-bg',
  '--marklyra-article-selected-bg',
  '--marklyra-article-border-bottom',
  '--marklyra-article-padding-top',
  '--marklyra-article-padding-bottom',
  '--marklyra-article-folder-padding-top',
  '--marklyra-summary-font-family',
  '--marklyra-summary-font-size',
  '--marklyra-summary-line-height',
  '--marklyra-summary-height',
  '--marklyra-summary-font-weight',
  '--marklyra-summary-opacity',
  '--marklyra-article-meta-font-family',
  '--marklyra-article-meta-line-height',
  '--marklyra-tree-row-height',
  '--marklyra-tree-icon-line-height',
  '--marklyra-outline-font-size',
  '--marklyra-outline-line-height',
  '--marklyra-outline-font-weight',
  '--marklyra-outline-hover-bg',
  '--marklyra-outline-hover-text',
  '--marklyra-sidebar-bg',
  '--marklyra-body-bg',
  '--marklyra-body-text',
] as const;

export type ThemeAppearanceKey = (typeof THEME_APPEARANCE_KEYS)[number];
export type ThemeAppearance = Partial<Record<ThemeAppearanceKey, string>>;

export function themeAppearance(value: unknown): ThemeAppearance {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid theme appearance');
  const result: ThemeAppearance = {};
  for (const [key, item] of Object.entries(value)) {
    if (!(THEME_APPEARANCE_KEYS as readonly string[]).includes(key))
      throw new TypeError('Unknown theme appearance property');
    if (
      typeof item !== 'string' ||
      item.length > 512 ||
      Array.from(item).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      })
    )
      throw new TypeError('Invalid theme appearance value');
    result[key as ThemeAppearanceKey] = item;
  }
  return result;
}
