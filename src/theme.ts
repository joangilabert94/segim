// Aplicación del tema al documento: marca <html data-theme>, el color de la
// barra del navegador, el color de los controles nativos y sigue los cambios
// del sistema cuando la preferencia es "automática".
//
// La preferencia también se cachea en localStorage para que el script inline
// de index.html pueda pintar el tema ANTES de leer IndexedDB (sin parpadeo).

import type { ResolvedTheme, ThemeMode } from './models';
import { normalizeThemeMode, resolveTheme } from './services/theme';

const CACHE_KEY = 'segim-theme';

const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#f4f7f1',
  dark: '#0c0f0e',
};

/** iOS: barra de estado coherente con el tema (leído al abrir la app). */
const STATUS_BAR: Record<ResolvedTheme, string> = {
  light: 'default',
  dark: 'black-translucent',
};

let mode: ThemeMode = 'auto';
let watching: ThemeMode | null = null;
let media: MediaQueryList | null = null;

const listeners = new Set<() => void>();

/**
 * Se suscribe a los cambios de tema resuelto (para re-renderizar la UI:
 * el texto de Ajustes muestra "Ahora se muestra en modo …").
 */
export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Preferencia guardada la última vez (para pintar antes de cargar datos). */
export function readCachedTheme(): ThemeMode {
  try {
    return normalizeThemeMode(localStorage.getItem(CACHE_KEY));
  } catch {
    return 'auto';
  }
}

function cache(mode: ThemeMode): void {
  try {
    localStorage.setItem(CACHE_KEY, mode);
  } catch {
    // sin almacenamiento (modo privado): seguimos en memoria
  }
}

/**
 * Qué prefiere el dispositivo. `null` cuando no se puede detectar
 * (sin `matchMedia` o sin `prefers-color-scheme`).
 */
function devicePrefersLight(): boolean | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  if (mq.media === 'not all') return null; // consulta no soportada
  return mq.matches;
}

export function currentTheme(): ResolvedTheme {
  return resolveTheme(mode, devicePrefersLight());
}

function paint(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.setProperty('color-scheme', resolved);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[resolved]);

  const ios = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (ios) ios.setAttribute('content', STATUS_BAR[resolved]);
}

/** Escucha los cambios del sistema solo mientras la preferencia sea `auto`. */
function syncWatcher(): void {
  if (watching === mode) return;
  if (media) {
    media.removeEventListener('change', onSystemChange);
    media = null;
  }
  watching = mode;
  if (mode !== 'auto' || typeof window.matchMedia !== 'function') return;
  media = window.matchMedia('(prefers-color-scheme: light)');
  media.addEventListener('change', onSystemChange);
}

function onSystemChange(): void {
  if (mode !== 'auto') return;
  paint(currentTheme());
  listeners.forEach((fn) => fn());
}

/**
 * Aplica la preferencia indicada y la recuerda. Es la única vía de cambio
 * de tema: la llama el estado cada vez que cambian los ajustes.
 */
export function applyTheme(next: ThemeMode): void {
  mode = normalizeThemeMode(next);
  cache(mode);
  syncWatcher();
  paint(currentTheme());
}

/**
 * Primer pintado, antes de cargar IndexedDB: usa la preferencia cacheada
 * (o `auto` si es la primera visita).
 */
export function initTheme(): void {
  applyTheme(readCachedTheme());
}
