import type { KnApi } from '@shared/types';

declare global {
  interface Window {
    kn: KnApi;
  }
  /** Injected at build time by electron.vite.config.ts from package.json. */
  const __APP_VERSION__: string;
}

export {};
