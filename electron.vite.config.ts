import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    // Bundle all npm deps into the main entry so the packaged app needs no
    // node_modules (node builtins stay external via Vite's SSR defaults).
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') }, external: ['electron'] } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/preload/index.ts') } } },
  },
  renderer: {
    root: resolve('src/renderer'),
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } },
    plugins: [react()],
    resolve: { alias: { '@shared': resolve('src/shared') } },
  },
});
