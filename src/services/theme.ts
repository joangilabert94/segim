// Lógica pura del tema (sin DOM): resolución de la preferencia y validación.
// El pegamento con el documento vive en src/theme.ts.

import type { ResolvedTheme, ThemeMode } from '../models';

/** Opciones del selector de Ajustes, en el orden en que se muestran. */
export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

/** Etiqueta legible de un valor guardado (datos antiguos o corruptos → 'auto'). */
export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

/**
 * Resuelve la preferencia a un tema concreto.
 *
 * `devicePrefersLight` es lo que dice el sistema:
 *  - `true`/`false` → el dispositivo prefiere claro/oscuro;
 *  - `null` → no se puede detectar (sin `prefers-color-scheme`), en cuyo
 *    caso se usa el tema claro, el valor por defecto de la aplicación.
 */
export function resolveTheme(
  mode: ThemeMode,
  devicePrefersLight: boolean | null,
): ResolvedTheme {
  if (mode === 'light' || mode === 'dark') return mode;
  return devicePrefersLight === false ? 'dark' : 'light';
}
