import { resourceBytes } from '../export/resources.js';
import { type ThemeStyles, themeStyles } from '../styles/contracts.js';
import {
  MAX_THEME_FONT_BYTES,
  MAX_THEME_FONT_FACES,
  MAX_THEME_FONT_TOTAL_BYTES,
  type ThemeFont,
  type ThemeFontDescriptors,
  themeFonts,
} from '../styles/fonts.js';

const decode = (value: string) =>
  value.replace(
    /\\([0-9a-f]{1,6})\s?|\\(.)/gi,
    (_match, hex: string | undefined, literal: string | undefined) =>
      hex
        ? String.fromCodePoint(Math.min(Number.parseInt(hex, 16) || 0xfffd, 0x10ffff))
        : (literal ?? ''),
  );
function argument(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  return decode(
    (quote === '"' || quote === "'") && trimmed.at(-1) === quote ? trimmed.slice(1, -1) : trimmed,
  );
}
function sourceFunctions(value: string): { name: string; value: string }[] {
  const result: { name: string; value: string }[] = [];
  let offset = 0;
  while (offset < value.length) {
    while (/[,\s]/.test(value[offset] ?? '') && offset < value.length) offset++;
    if (offset >= value.length) break;
    const start = offset;
    while (/[a-z-]/i.test(value[offset] ?? '') && offset < value.length) offset++;
    const name = value.slice(start, offset).toLowerCase();
    if (!['local', 'url', 'format'].includes(name))
      throw new Error('Unsupported font src function');
    while (/\s/.test(value[offset] ?? '') && offset < value.length) offset++;
    if (value[offset++] !== '(') throw new Error('Invalid font src');
    const content = offset;
    let quote = '';
    while (offset < value.length) {
      const character = value[offset];
      if (character === '\\') {
        offset += 2;
        continue;
      }
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") quote = character;
      else if (character === ')') break;
      offset++;
    }
    if (offset >= value.length || quote) throw new Error('Unterminated font src');
    result.push({ name, value: argument(value.slice(content, offset++)) });
    if (result.length > 32) throw new Error('Too many font src functions');
  }
  return result;
}

/** Extracts only host-supplied sheets and same-origin CSS imports. Detached FontFace
 * loads select a working source without registering anything in the editor. */
export async function readThemeFonts(
  sources: ThemeStyles,
  signal?: AbortSignal,
): Promise<ThemeFont[]> {
  const input = themeStyles(sources, location.href);
  const ids = {
    theme: 'theme_css',
    baseUser: 'base_user_css',
    themeUser: 'theme_user_css',
  } as const;
  const roots: { link: HTMLLinkElement; href: string }[] = [];
  for (const key of ['theme', 'baseUser', 'themeUser'] as const) {
    const href = input[key];
    if (!href) continue;
    const link = document.getElementById(ids[key]);
    if (!(link instanceof HTMLLinkElement) || link.href !== href || !link.sheet)
      throw new Error('Host theme stylesheet is not loaded');
    roots.push({ link, href });
  }
  const check = () => {
    if (signal?.aborted || roots.some(({ link, href }) => link.href !== href))
      throw new Error('Theme font operation was cancelled or superseded');
  };
  const origin = new URL(location.href);
  const authorized = (value: string, base: string, extension: RegExp) => {
    const url = new URL(value, base);
    if (
      url.protocol !== origin.protocol ||
      url.host !== origin.host ||
      url.username ||
      url.password ||
      url.hash ||
      !extension.test(url.pathname)
    )
      throw new Error('Unauthorized theme font resource');
    return url.href;
  };
  const visited = new Set<CSSStyleSheet>();
  const faces: { rule: CSSFontFaceRule; href: string }[] = [];
  let used = 0;
  const charge = (size: number) => {
    used += size;
    if (size > MAX_THEME_FONT_BYTES || used > MAX_THEME_FONT_TOTAL_BYTES)
      throw new RangeError('Theme CSS/font resource budget exceeded');
  };
  const collect = (sheet: CSSStyleSheet, base: string) => {
    check();
    if (visited.has(sheet)) return;
    if (visited.size >= 64) throw new RangeError('Too many imported theme stylesheets');
    visited.add(sheet);
    const href = authorized(sheet.href ?? base, base, /\.css$/i);
    let sheetBytes = 0;
    const rules = (list: CSSRuleList) => {
      for (const rule of Array.from(list)) {
        sheetBytes += new TextEncoder().encode(rule.cssText).byteLength;
        if (sheetBytes > MAX_THEME_FONT_BYTES)
          throw new RangeError('Theme stylesheet exceeds 8 MiB');
        if (rule instanceof CSSFontFaceRule) {
          if (faces.length >= MAX_THEME_FONT_FACES)
            throw new RangeError('Too many theme font faces');
          faces.push({ rule, href });
        } else if (rule instanceof CSSImportRule) {
          authorized(rule.href, href, /\.css$/i);
          if (!rule.styleSheet) throw new Error('Imported font stylesheet is not loaded');
          if (!rule.media.mediaText || matchMedia(rule.media.mediaText).matches)
            collect(rule.styleSheet, href);
        } else if (rule instanceof CSSMediaRule) {
          if (matchMedia(rule.conditionText).matches) rules(rule.cssRules);
        } else if (rule instanceof CSSSupportsRule) {
          if (CSS.supports(rule.conditionText)) rules(rule.cssRules);
        }
      }
    };
    rules(sheet.cssRules);
    charge(sheetBytes);
  };
  for (const { link, href } of roots) collect(link.sheet as CSSStyleSheet, href);
  const result: ThemeFont[] = [];
  for (const { rule, href } of faces) {
    check();
    const supportedDescriptors = [
      'font-family',
      'src',
      'font-style',
      'font-weight',
      'font-stretch',
      'unicode-range',
      'font-feature-settings',
      'font-variation-settings',
      'font-display',
    ];
    if (Array.from(rule.style).some((name) => !supportedDescriptors.includes(name)))
      throw new Error('Unsupported custom font-face descriptor');
    const family = argument(rule.style.getPropertyValue('font-family'));
    const descriptors: ThemeFontDescriptors = {};
    for (const [css, key] of [
      ['font-style', 'style'],
      ['font-weight', 'weight'],
      ['font-stretch', 'stretch'],
      ['unicode-range', 'unicodeRange'],
      ['font-feature-settings', 'featureSettings'],
      ['font-variation-settings', 'variationSettings'],
      ['font-display', 'display'],
    ] as const) {
      const value = rule.style.getPropertyValue(css).trim();
      if (value) Object.assign(descriptors, { [key]: value });
    }
    const functions = sourceFunctions(rule.style.getPropertyValue('src'));
    if (
      functions.some(
        (entry) =>
          entry.name === 'format' &&
          ![
            'woff',
            'woff2',
            'truetype',
            'opentype',
            'woff-variations',
            'woff2-variations',
            'truetype-variations',
            'opentype-variations',
          ].includes(entry.value.toLowerCase()),
      )
    )
      throw new Error('Unsupported custom font format');
    if (functions.filter((entry) => entry.name !== 'format').length > 16)
      throw new RangeError('Too many theme font fallback sources');
    for (const entry of functions) {
      if (entry.name === 'url' && !entry.value.startsWith('data:'))
        authorized(entry.value, href, /\.(?:woff2?|ttf|otf)$/i);
    }
    const font: ThemeFont = { family, descriptors, sources: [] };
    themeFonts([{ ...font, sources: [{ kind: 'local', name: 'Validation' }] }]);
    let loaded = false;
    for (const entry of functions) {
      if (entry.name === 'format') continue;
      check();
      let source: string | ArrayBuffer;
      if (entry.name === 'local') {
        font.sources.push({ kind: 'local', name: entry.value });
        source = `local(${JSON.stringify(entry.value)})`;
      } else {
        let bytes: Uint8Array;
        if (entry.value.startsWith('data:')) {
          const match =
            /^data:(?:font\/(?:woff2?|ttf|otf)|application\/(?:font-woff|x-font-ttf|x-font-opentype));base64,([a-z\d+/]*={0,2})$/i.exec(
              entry.value,
            );
          if (!match?.[1] || match[1].length > Math.ceil(MAX_THEME_FONT_BYTES / 3) * 4)
            throw new Error('Invalid or oversized font data URL');
          bytes = Uint8Array.from(atob(match[1]), (character) => character.charCodeAt(0));
        } else {
          const url = authorized(entry.value, href, /\.(?:woff2?|ttf|otf)$/i);
          const response = await fetch(url, {
            credentials: 'omit',
            redirect: 'error',
            ...(signal ? { signal } : {}),
          });
          if (!response.ok) {
            await response.body?.cancel();
            continue;
          }
          bytes = await resourceBytes(
            response,
            Math.min(MAX_THEME_FONT_BYTES, MAX_THEME_FONT_TOTAL_BYTES - used),
          );
        }
        charge(bytes.byteLength);
        source = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
      }
      try {
        await new FontFace(JSON.stringify(family), source, descriptors).load();
        check();
        if (typeof source !== 'string') font.sources.push({ kind: 'data', bytes: source });
        loaded = true;
        break;
      } catch (error) {
        check();
        if (error instanceof RangeError) throw error;
      }
    }
    if (!loaded) throw new Error(`No usable source for theme font: ${family}`);
    result.push(font);
  }
  check();
  return themeFonts(result);
}
