/// <reference types="vite/client" />

/** Versión inyectada por Vite desde package.json (vite.config.ts). */
declare const __APP_VERSION__: string;

declare module 'virtual:pwa-register' {
  export function registerSW(options?: {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
  }): (reloadPage?: boolean) => Promise<void>;
}
