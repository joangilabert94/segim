import { describe, expect, it } from 'vitest';
import {
  DARK_PALETTE_IDS,
  LIGHT_PALETTE_IDS,
  PALETTES,
  barColor,
  normalizeDarkPalette,
  normalizeLightPalette,
  palettesForMode,
} from '../src/services/palette';
import { parseSettings } from '../src/services/validation';
import { DEFAULT_SETTINGS } from '../src/models';

describe('catálogo de paletas', () => {
  it('hay exactamente 3 paletas claras y 3 oscuras, con ids únicos', () => {
    expect(LIGHT_PALETTE_IDS).toHaveLength(3);
    expect(DARK_PALETTE_IDS).toHaveLength(3);
    const ids = PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(palettesForMode('light').map((p) => p.id)).toEqual([...LIGHT_PALETTE_IDS]);
    expect(palettesForMode('dark').map((p) => p.id)).toEqual([...DARK_PALETTE_IDS]);
  });

  it('cada modo conserva la paleta original en primera posición', () => {
    // La paleta por defecto es la primera del catálogo ligero/oscuro.
    expect(DEFAULT_SETTINGS.lightPalette).toBe(LIGHT_PALETTE_IDS[0]);
    expect(DEFAULT_SETTINGS.darkPalette).toBe(DARK_PALETTE_IDS[0]);
  });

  it('barColor devuelve el color de barra de la paleta activa', () => {
    expect(barColor('light', 'oceano', 'ambar')).toBe('#f0f5fa');
    expect(barColor('dark', 'oceano', 'ambar')).toBe('#141010');
  });
});

describe('normalize de paletas', () => {
  it('acepta ids válidos y rechaza el resto', () => {
    expect(normalizeLightPalette('oceano')).toBe('oceano');
    expect(normalizeLightPalette('arcilla')).toBe('arcilla');
    expect(normalizeLightPalette('lima')).toBe('salvia'); // id oscuro en claro → default
    expect(normalizeLightPalette('no-existe')).toBe('salvia');
    expect(normalizeLightPalette(undefined)).toBe('salvia');
    expect(normalizeLightPalette(42)).toBe('salvia');

    expect(normalizeDarkPalette('medianoche')).toBe('medianoche');
    expect(normalizeDarkPalette('ambar')).toBe('ambar');
    expect(normalizeDarkPalette('oceano')).toBe('lima'); // id claro en oscuro → default
    expect(normalizeDarkPalette('no-existe')).toBe('lima');
    expect(normalizeDarkPalette(null)).toBe('lima');
  });
});

describe('parseSettings con paletas', () => {
  it('conserva paletas válidas de la copia de seguridad', () => {
    const parsed = parseSettings({
      unit: 'kg',
      theme: 'dark',
      lightPalette: 'arcilla',
      darkPalette: 'medianoche',
    });
    expect(parsed.lightPalette).toBe('arcilla');
    expect(parsed.darkPalette).toBe('medianoche');
  });

  it('valores corruptos o cruzados vuelven al valor por defecto', () => {
    const parsed = parseSettings({
      lightPalette: 'ambar', // oscuro en claro
      darkPalette: 'salvia', // claro en oscuro
    });
    expect(parsed.lightPalette).toBe(DEFAULT_SETTINGS.lightPalette);
    expect(parsed.darkPalette).toBe(DEFAULT_SETTINGS.darkPalette);
  });

  it('sin paletas en la copia se aplican los valores por defecto', () => {
    const parsed = parseSettings({});
    expect(parsed.lightPalette).toBe(DEFAULT_SETTINGS.lightPalette);
    expect(parsed.darkPalette).toBe(DEFAULT_SETTINGS.darkPalette);
  });
});
