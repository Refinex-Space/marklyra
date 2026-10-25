import type { Plugin } from 'vite';
export interface ShellFontMetadata {
  readonly path: string;
  readonly family: string;
  readonly weight: number;
  readonly style: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly mime: 'font/woff' | 'font/woff2';
  readonly unicodeRange?: string;
}
export const SHELL_FONT_MANIFEST: readonly ShellFontMetadata[];
export const SHELL_FONT_PREFIX: '/__runtime-fonts/';
export function runtimeShellFonts(options?: {
  sourceDirectory?: string;
  themeDirectory?: string;
}): Plugin;
