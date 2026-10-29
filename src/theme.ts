import type { ResolvedTheme, ThemeMode } from './models';
import { normalizeThemeMode, resolveTheme } from './services/theme';

// La lee también el script inline de index.html: pinta el tema antes de IndexedDB, sin parpadeo.
const CACHE_KEY = 'segim-theme';

const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#f4f7f1',
  dark: '#0c0f0e',
};

const STATUS_BAR: Record<ResolvedTheme, string> = {
  light: 'default',
  dark: 'black-translucent',
};

let mode: ThemeMode = 'auto';
let watching: ThemeMode | null = null;
let media: MediaQueryList | null = null;

const listeners = new Set<() => void>();

export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

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

export function applyTheme(next: ThemeMode): void {
  mode = normalizeThemeMode(next);
  cache(mode);
  syncWatcher();
  paint(currentTheme());
}

export function initTheme(): void {
  applyTheme(readCachedTheme());
}
