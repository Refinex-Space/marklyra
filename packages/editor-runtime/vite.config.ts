import { resolve } from 'node:path';
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/runtime/frame-host.ts'),
      name: 'MarkLyraFrameHost',
      formats: ['iife'],
      fileName: () => 'frame-host.js',
    },
    minify: false,
  },
});
