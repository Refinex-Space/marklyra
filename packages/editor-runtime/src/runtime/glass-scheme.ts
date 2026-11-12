import type { ThemeAppearance } from '../styles/appearance.js';

/** Whether an opaque computed `rgb()`/`rgba()` colour is dark, by the same relative-luminance
 * threshold the desktop shell uses for its own `data-theme`. Unknown or transparent: undefined. */
function darkColor(value: string | undefined): boolean | undefined {
  const parts = value?.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d*(?:\.\d+)?%?))?/i,
  );
  if (!parts) return undefined;
  if (parts[4] && Number.parseFloat(parts[4]) === 0) return undefined;
  const [red, green, blue] = parts.slice(1, 4).map((part) => {
    const component = Math.min(255, Number(part)) / 255;
    return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
  });
  return (red ?? 0) * 0.2126 + (green ?? 0) * 0.7152 + (blue ?? 0) * 0.0722 < 0.179;
}

/** The document background decides; the theme's `color-scheme` covers one that cannot be read. */
export function glassTheme(
  bodyBackground: string | undefined,
  colorScheme: string,
  prefersDark: boolean,
): 'dark' | 'light' {
  const schemes = colorScheme.split(/\s+/);
  const dark =
    darkColor(bodyBackground) ??
    (schemes.includes('dark') && (!schemes.includes('light') || prefersDark));
  return dark ? 'dark' : 'light';
}

/** The Liquid Glass tokens (`style/liquid-glass.css`) switch on `:root[data-theme]`, as in the
 * shell, so the page's floating UI follows the document theme. */
export function syncGlassScheme(
  appearance: ThemeAppearance,
  root: HTMLElement = document.documentElement,
): void {
  const theme = glassTheme(
    appearance['--marklyra-body-bg'],
    getComputedStyle(root).colorScheme,
    matchMedia('(prefers-color-scheme: dark)').matches,
  );
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
}
