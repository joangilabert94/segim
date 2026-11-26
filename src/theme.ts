import type { ResolvedTheme, Settings, ThemeMode } from './models';
import { normalizeThemeMode, resolveTheme } from './services/theme';
import {
  normalizeDarkPalette,
  normalizeLightPalette,
  barColor,
} from './services/palette';

// La lee también el script inline de index.html: pinta el tema antes de IndexedDB, sin parpadeo.
const THEME_CACHE_KEY = 'segim-theme';
const PALETTE_CACHE_KEY = 'segim-palettes';

const STATUS_BAR: Record<ResolvedTheme, string> = {
  light: 'default',
  dark: 'black-translucent',
};

let mode: ThemeMode = 'auto';
let lightPalette = normalizeLightPalette(undefined);
let darkPalette = normalizeDarkPalette(undefined);
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
    return normalizeThemeMode(localStorage.getItem(THEME_CACHE_KEY));
  } catch {
    return 'auto';
  }
}

/** Par de paletas guardado por el script inline / por applyTheme. Tolerante a datos corruptos. */
export function readCachedPalettes(): { light: typeof lightPalette; dark: typeof darkPalette } {
  try {
    const raw = localStorage.getItem(PALETTE_CACHE_KEY);
    const parsed: unknown = raw === null ? undefined : JSON.parse(raw);
    const obj = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    return {
      light: normalizeLightPalette(obj.light),
      dark: normalizeDarkPalette(obj.dark),
    };
  } catch {
    return { light: normalizeLightPalette(undefined), dark: normalizeDarkPalette(undefined) };
  }
}

function cacheTheme(next: ThemeMode): void {
  try {
    localStorage.setItem(THEME_CACHE_KEY, next);
  } catch {
    // sin almacenamiento (modo privado): seguimos en memoria
  }
}

function cachePalettes(): void {
  try {
    localStorage.setItem(PALETTE_CACHE_KEY, JSON.stringify({ light: lightPalette, dark: darkPalette }));
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
  root.setAttribute('data-palette', resolved === 'light' ? lightPalette : darkPalette);
  root.style.setProperty('color-scheme', resolved);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', barColor(resolved, lightPalette, darkPalette));

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

/** Aplica modo (auto/claro/oscuro) y las paletas de cada modo; pinta sin parpadeo. */
export function applyTheme(next: Pick<Settings, 'theme' | 'lightPalette' | 'darkPalette'>): void {
  mode = normalizeThemeMode(next.theme);
  lightPalette = normalizeLightPalette(next.lightPalette);
  darkPalette = normalizeDarkPalette(next.darkPalette);
  cacheTheme(mode);
  cachePalettes();
  syncWatcher();
  paint(currentTheme());
}

export function initTheme(): void {
  const cached = readCachedPalettes();
  applyTheme({ theme: readCachedTheme(), lightPalette: cached.light, darkPalette: cached.dark });
}
