import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string };

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
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } },
    plugins: [react()],
    resolve: { alias: { '@shared': resolve('src/shared') } },
  },
});
