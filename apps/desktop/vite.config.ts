import { defineConfig } from 'vite';
import { runtimeShellFonts } from '../../scripts/runtime-shell-fonts.mjs';
import { runtimeShellIcons } from '../../scripts/runtime-shell-icons.mjs';

export default defineConfig({ plugins: [runtimeShellFonts(), runtimeShellIcons()] });
