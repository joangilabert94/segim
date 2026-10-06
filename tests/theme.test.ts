import { describe, expect, it } from 'vitest';
import { THEME_OPTIONS, normalizeThemeMode, resolveTheme } from '../src/services/theme';

describe('resolveTheme', () => {
  it('las opciones explícitas ganan al modo del dispositivo', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('"auto" sigue al dispositivo', () => {
    expect(resolveTheme('auto', true)).toBe('light');
    expect(resolveTheme('auto', false)).toBe('dark');
  });

  it('sin detección posible cae en el tema claro (el por defecto)', () => {
    expect(resolveTheme('auto', null)).toBe('light');
  });

  it('nunca devuelve un tema distinto de light/dark', () => {
    for (const mode of ['auto', 'light', 'dark'] as const) {
      for (const pref of [true, false, null]) {
        expect(['light', 'dark']).toContain(resolveTheme(mode, pref));
      }
    }
  });
});

describe('normalizeThemeMode', () => {
  it('acepta los tres valores válidos', () => {
    expect(normalizeThemeMode('light')).toBe('light');
    expect(normalizeThemeMode('dark')).toBe('dark');
    expect(normalizeThemeMode('auto')).toBe('auto');
  });

  it('cualquier valor desconocido o ausente es "auto"', () => {
    expect(normalizeThemeMode(undefined)).toBe('auto');
    expect(normalizeThemeMode(null)).toBe('auto');
    expect(normalizeThemeMode('blue')).toBe('auto');
    expect(normalizeThemeMode(42)).toBe('auto');
  });
});

describe('THEME_OPTIONS', () => {
  it('ofrece automático, claro y oscuro, en ese orden', () => {
    expect(THEME_OPTIONS.map((o) => o.value)).toEqual(['auto', 'light', 'dark']);
    expect(THEME_OPTIONS.every((o) => o.label.length > 0)).toBe(true);
  });
});
