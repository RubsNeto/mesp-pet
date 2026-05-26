// src/global.d.ts
// Tipagem global expondo a API injetada por electron/preload.ts.

import type { MespApi } from '../electron/preload';

declare global {
  interface Window {
    /** API exposta pelo preload do Electron. Pode ser undefined em modo browser puro. */
    mesp?: MespApi;
  }
}

declare module '*.png' {
  const url: string;
  export default url;
}

export {};
