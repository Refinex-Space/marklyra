import type { MarkLyraCommand } from '@marklyra/editor-runtime';

export type BuiltinTheme = Extract<MarkLyraCommand, { type: 'setTheme' }>['theme'];
export const builtinThemes: readonly BuiltinTheme[] = ['marklyra-light', 'marklyra-dark'];
export interface ThemeEntry {
  id: string;
  name: string;
  builtin: boolean;
}
export interface ThemeCatalog {
  folderPath: string;
  themes: ThemeEntry[];
}

/** Portable filename identity shared with the native theme catalog. */
export function validThemeId(value: unknown): value is string {
  if (typeof value !== 'string' || !value || Array.from(value).length > 120) return false;
  if (
    value.startsWith('.') ||
    value.endsWith('.') ||
    value.endsWith('.user') ||
    /[A-Z<>:"/\\|?*%\p{White_Space}\p{Cc}]/u.test(value)
  )
    return false;
  const stem = value.split('.')[0]?.toUpperCase() ?? '';
  return !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem);
}

export function normalizeThemeId(value: unknown): string {
  return validThemeId(value) ? value : 'marklyra-light';
}

export function builtinTheme(value: string): BuiltinTheme {
  return builtinThemes.includes(value as BuiltinTheme) ? (value as BuiltinTheme) : 'marklyra-light';
}

export const defaultThemeCatalog: ThemeCatalog = {
  folderPath: '',
  themes: builtinThemes.map((id) => ({
    id,
    name: id === 'marklyra-dark' ? 'MarkLyra Dark' : 'MarkLyra Light',
    builtin: true,
  })),
};

/** Retired bundled choices fall back only when no user theme owns that exact ID. */
export function resolveThemeId(id: string, catalog: ThemeCatalog): string {
  if (catalog.themes.some((theme) => theme.id === id)) return id;
  if (id === 'night' || id === 'dark') return 'marklyra-dark';
  if (['github', 'gothic', 'newsprint', 'pixyll', 'whitey'].includes(id)) return 'marklyra-light';
  return id;
}

export function themeCatalog(value: unknown): ThemeCatalog {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid theme catalog');
  const input = value as Record<string, unknown>;
  if (
    typeof input.folderPath !== 'string' ||
    !Array.isArray(input.themes) ||
    input.themes.length > 1030
  )
    throw new TypeError('Invalid theme catalog');
  const seen = new Set<string>();
  const themes = input.themes.map((entry: unknown): ThemeEntry => {
    if (!entry || typeof entry !== 'object') throw new TypeError('Invalid theme entry');
    const row = entry as Record<string, unknown>;
    if (
      !validThemeId(row.id) ||
      typeof row.name !== 'string' ||
      row.name.length > 512 ||
      /\p{Cc}/u.test(row.name) ||
      typeof row.builtin !== 'boolean' ||
      seen.has(row.id)
    )
      throw new TypeError('Invalid theme entry');
    seen.add(row.id);
    return { id: row.id, name: row.name, builtin: row.builtin };
  });
  return { folderPath: input.folderPath, themes };
}

export function storedTheme(): string {
  try {
    let choice: unknown = null;
    try {
      choice = JSON.parse(localStorage.getItem(themeChoiceKey) ?? 'null');
    } catch {
      /* Preserve malformed data and use the legacy value. */
    }
    if (choice && typeof choice === 'object') {
      const record = choice as Record<string, unknown>;
      if (validThemeId(record.theme) && typeof record.revision === 'string') return record.theme;
    }
    const legacy = localStorage.getItem('marklyra-theme');
    return legacy === 'dark' ? 'marklyra-dark' : normalizeThemeId(legacy);
  } catch {
    return 'marklyra-light';
  }
}

export const themeChoiceKey = 'marklyra-theme-choice-v1';
export interface ThemeChoiceWrite {
  theme: string;
  value: string;
  previous: string | null;
}
export function prepareThemeChoice(theme: string): ThemeChoiceWrite {
  if (!validThemeId(theme)) throw new Error('主题名称无效。');
  return {
    theme,
    previous: localStorage.getItem(themeChoiceKey),
    value: JSON.stringify({ theme, revision: crypto.randomUUID() }),
  };
}
export function persistThemeChoice(write: ThemeChoiceWrite): void {
  localStorage.setItem(themeChoiceKey, write.value);
  if (localStorage.getItem(themeChoiceKey) !== write.value)
    throw new Error('无法持久保存主题选择。');
}
export function rollbackThemeChoice(write: ThemeChoiceWrite): void {
  if (localStorage.getItem(themeChoiceKey) !== write.value) return;
  if (write.previous === null) localStorage.removeItem(themeChoiceKey);
  else localStorage.setItem(themeChoiceKey, write.previous);
}
export function mirrorLegacyTheme(write: ThemeChoiceWrite): void {
  if (localStorage.getItem(themeChoiceKey) === write.value)
    localStorage.setItem('marklyra-theme', write.theme);
}

/** Native chrome follows the actual loaded background, including custom dark themes. */
export function darkBackground(value: string | undefined, fallback: boolean): boolean {
  const parts = value?.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/i);
  if (!parts) return fallback;
  const channels = parts.slice(1, 4).map((part) => {
    const component = Math.min(255, Number(part)) / 255;
    return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
  return luminance < 0.179;
}
