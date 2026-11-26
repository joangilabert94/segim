/**
 * Paletas de color de la app: 3 para el modo claro y 3 para el oscuro.
 *
 * La elección de paleta es local al dispositivo (se guarda en localStorage para
 * pintar antes del primer fotograma y en los ajustes de IndexedDB). No se
 * sincroniza con la nube y sí viaja en la copia de seguridad.
 *
 * Los valores concretos de cada paleta viven en `src/styles/tokens.css`; aquí solo
 * están los metadatos para validar y para pintar los selectores de Ajustes.
 * Los nombres/ids son únicos entre los dos modos.
 */

export const LIGHT_PALETTE_IDS = ['salvia', 'oceano', 'arcilla'] as const;
export const DARK_PALETTE_IDS = ['lima', 'medianoche', 'ambar'] as const;

export type LightPaletteId = (typeof LIGHT_PALETTE_IDS)[number];
export type DarkPaletteId = (typeof DARK_PALETTE_IDS)[number];
export type PaletteId = LightPaletteId | DarkPaletteId;

export const DEFAULT_LIGHT_PALETTE: LightPaletteId = 'salvia';
export const DEFAULT_DARK_PALETTE: DarkPaletteId = 'lima';

export interface PaletteMeta {
  id: PaletteId;
  mode: 'light' | 'dark';
  label: string;
  hint: string;
  /** Colores para el selector de Ajustes: fondo, superficie, acento y texto. */
  swatch: { bg: string; surface: string; accent: string; text: string };
  /** Color de theme-color / barra de estado del sistema. */
  bar: string;
}

export const PALETTES: PaletteMeta[] = [
  {
    id: 'salvia',
    mode: 'light',
    label: 'Salvia',
    hint: 'La de siempre: fondo hueso verdoso con acento verde.',
    swatch: { bg: '#f4f7f1', surface: '#ffffff', accent: '#3f7a0a', text: '#141a14' },
    bar: '#f4f7f1',
  },
  {
    id: 'oceano',
    mode: 'light',
    label: 'Océano',
    hint: 'Blanco azulado limpio con acento azul profundo.',
    swatch: { bg: '#f0f5fa', surface: '#ffffff', accent: '#0e5aa8', text: '#101820' },
    bar: '#f0f5fa',
  },
  {
    id: 'arcilla',
    mode: 'light',
    label: 'Arcilla',
    hint: 'Papel cálido con acento terracota y verde oliva.',
    swatch: { bg: '#faf3ec', surface: '#fffdf9', accent: '#b0441c', text: '#221610' },
    bar: '#faf3ec',
  },
  {
    id: 'lima',
    mode: 'dark',
    label: 'Lima',
    hint: 'La de siempre: negro verdoso con acento lima fluorescente.',
    swatch: { bg: '#0c0f0e', surface: '#141917', accent: '#c6f24e', text: '#e9f0eb' },
    bar: '#0c0f0e',
  },
  {
    id: 'medianoche',
    mode: 'dark',
    label: 'Medianoche',
    hint: 'Azul noche con acento cielo e índigo suave.',
    swatch: { bg: '#0d1420', surface: '#131b29', accent: '#7dd3fc', text: '#e6edf7' },
    bar: '#0d1420',
  },
  {
    id: 'ambar',
    mode: 'dark',
    label: 'Ámbar',
    hint: 'Carbón cálido con acento ámbar y turquesa suave.',
    swatch: { bg: '#141010', surface: '#1c1714', accent: '#f2b33d', text: '#f3ece5' },
    bar: '#141010',
  },
];

const BY_ID = new Map(PALETTES.map((p) => [p.id, p]));

export function isLightPalette(value: unknown): value is LightPaletteId {
  return typeof value === 'string' && (LIGHT_PALETTE_IDS as readonly string[]).includes(value);
}

export function isDarkPalette(value: unknown): value is DarkPaletteId {
  return typeof value === 'string' && (DARK_PALETTE_IDS as readonly string[]).includes(value);
}

export function normalizeLightPalette(value: unknown): LightPaletteId {
  return isLightPalette(value) ? value : DEFAULT_LIGHT_PALETTE;
}

export function normalizeDarkPalette(value: unknown): DarkPaletteId {
  return isDarkPalette(value) ? value : DEFAULT_DARK_PALETTE;
}

export function paletteMeta(id: PaletteId): PaletteMeta {
  // normalizeXxx garantiza un id conocido; el fallback es imposible en la práctica.
  return BY_ID.get(id) ?? PALETTES[0];
}

export function palettesForMode(mode: 'light' | 'dark'): PaletteMeta[] {
  return PALETTES.filter((p) => p.mode === mode);
}

/** Paleta activa (para el color de la barra del sistema). */
export function barColor(resolved: 'light' | 'dark', light: LightPaletteId, dark: DarkPaletteId): string {
  return paletteMeta(resolved === 'light' ? light : dark).bar;
}
