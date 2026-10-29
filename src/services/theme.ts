import type { ResolvedTheme, ThemeMode } from '../models';

export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'auto', label: 'Auto.' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

export function resolveTheme(
  mode: ThemeMode,
  devicePrefersLight: boolean | null,
): ResolvedTheme {
  if (mode === 'light' || mode === 'dark') return mode;
  // null (sin prefers-color-scheme) cae en claro, el tema por defecto de la app.
  return devicePrefersLight === false ? 'dark' : 'light';
}
