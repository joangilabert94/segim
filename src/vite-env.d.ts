/// <reference types="vite/client" />

/** Versión inyectada por Vite desde package.json (vite.config.ts). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /**
   * Client ID público del proyecto de Google Cloud (OAuth, tipo "Aplicación
   * web"). No es un secreto: viaja en el bundle y lo restringe Google por
   * origen autorizado. Sin él, la copia en Drive aparece como no disponible.
   */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'virtual:pwa-register' {
  export function registerSW(options?: {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
  }): (reloadPage?: boolean) => Promise<void>;
}
