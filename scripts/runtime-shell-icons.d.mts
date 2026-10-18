import type { Plugin } from 'vite';

export interface RuntimeShellIconsOptions {
  sourceDirectory?: string;
}
export function runtimeShellIcons(options?: RuntimeShellIconsOptions): Plugin;
