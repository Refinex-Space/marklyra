import { resolve } from 'node:path';
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        vanilla: resolve(import.meta.dirname, 'index.html'),
        react: resolve(import.meta.dirname, 'react.html'),
        marklyra: resolve(import.meta.dirname, 'runtime.html'),
        portable: resolve(import.meta.dirname, 'portable.html'),
        portableReact: resolve(import.meta.dirname, 'portable-react.html'),
      },
    },
  },
});
