import { DriveError } from './api';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
    prompt?: string;
  }): TokenClient;
  revoke(token: string, done?: (response: { successful?: boolean }) => void): void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

export function googleClientId(): string {
  const value = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof value === 'string' ? value.trim() : '';
}

export function isDriveConfigured(): boolean {
  return googleClientId() !== '';
}

// Solo en memoria: nunca en localStorage ni IndexedDB.
let cachedToken: { value: string; expiresAt: number } | null = null;
let gisLoader: Promise<GoogleOAuth2> | null = null;

function loadGis(): Promise<GoogleOAuth2> {
  if (gisLoader) return gisLoader;

  gisLoader = new Promise<GoogleOAuth2>((resolve, reject) => {
    const already = window.google?.accounts?.oauth2;
    if (already) {
      resolve(already);
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (oauth2) resolve(oauth2);
      else reject(new Error('Google Identity Services no se ha cargado.'));
    };
    script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services.'));
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    // Si falla, que un segundo intento pueda volver a cargarlo.
    gisLoader = null;
    throw err;
  });

  return gisLoader;
}

export function hasValidToken(): boolean {
  return !!cachedToken && cachedToken.expiresAt > Date.now();
}

export function forgetToken(): void {
  cachedToken = null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DriveError('auth', 0, message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function getAccessToken(interactive = true): Promise<string> {
  if (cachedToken && hasValidToken()) return cachedToken.value;

  const clientId = googleClientId();
  if (!clientId) {
    throw new DriveError(
      'auth',
      0,
      'Falta configurar el Client ID de Google (VITE_GOOGLE_CLIENT_ID).',
    );
  }

  const oauth2 = await loadGis();

  const response = await withTimeout(
    new Promise<TokenResponse>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: resolve,
        error_callback: (error) => {
          const type = error?.type ?? 'unknown';
          reject(
            new DriveError(
              'auth',
              0,
              type === 'popup_closed'
                ? 'Se ha cerrado la ventana de Google antes de autorizar.'
                : type === 'popup_failed_to_open'
                  ? 'El navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes.'
                  : 'No se pudo abrir la ventana de Google.',
            ),
          );
        },
        // Incluso con 'none' abre una ventana, que el navegador bloquea si no viene de un toque.
        prompt: interactive ? '' : 'none',
      });
      try {
        client.requestAccessToken();
      } catch (err) {
        reject(err);
      }
    }),
    interactive ? 180_000 : 20_000,
    interactive
      ? 'La ventana de Google no ha respondido. Inténtalo de nuevo.'
      : 'Google no ha devuelto el permiso. Toca "☁️ Subir ahora" para volver a autorizar.',
  );

  if (response.error || !response.access_token) {
    throw new DriveError(
      'auth',
      0,
      response.error === 'access_denied'
        ? 'Has cancelado el permiso de Google Drive.'
        : 'No se pudo autorizar con Google. Vuelve a intentarlo.',
    );
  }

  const seconds = Number(response.expires_in ?? 3600);
  cachedToken = {
    value: response.access_token,
    // Un minuto de margen: evita usar un token que caduque a mitad de subida.
    expiresAt: Date.now() + Math.max(0, seconds - 60) * 1000,
  };
  return cachedToken.value;
}

export async function revokeAccess(): Promise<void> {
  const token = cachedToken?.value;
  forgetToken();
  if (!token) return;
  try {
    const oauth2 = await loadGis();
    await new Promise<void>((resolve) => {
      oauth2.revoke(token, () => resolve());
    });
  } catch {
    // Sin conexión o ya caducado: se puede revocar en https://myaccount.google.com/permissions
  }
}
