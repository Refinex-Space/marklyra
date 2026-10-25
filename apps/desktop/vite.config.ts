import { defineConfig } from 'vite';
import { projectNotices } from '../../scripts/lib/project-notices.mjs';
import { runtimeShellFonts } from '../../scripts/runtime-shell-fonts.mjs';
import { runtimeShellIcons } from '../../scripts/runtime-shell-icons.mjs';

export default defineConfig({
  plugins: [projectNotices(), runtimeShellFonts(), runtimeShellIcons()],
});
