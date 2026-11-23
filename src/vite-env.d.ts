/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  // No es un secreto: viaja en el bundle y Google lo restringe por origen autorizado.
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  // Tampoco es secreto: la publishable key identifica la app y el RLS filtra las filas.
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
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
