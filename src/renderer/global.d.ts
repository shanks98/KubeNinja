import type { KnApi } from '@shared/types';

declare global {
  interface Window {
    kn: KnApi;
  }
}

export {};
