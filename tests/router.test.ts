import { describe, expect, it } from 'vitest';
import { matchPath } from '../src/router';

describe('matchPath', () => {
  it('empareja rutas estáticas', () => {
    expect(matchPath('/', '/')).toEqual({});
    expect(matchPath('/historial', '/historial')).toEqual({});
    expect(matchPath('/historial', '/historial/extra')).toBeNull();
    expect(matchPath('/rutinas/:id', '/rutinas')).toBeNull();
  });

  it('extrae parámetros y los decodifica', () => {
    expect(matchPath('/rutinas/:id', '/rutinas/abc123')).toEqual({ id: 'abc123' });
    expect(matchPath('/historial/:id', '/historial/a%20b')).toEqual({ id: 'a b' });
  });

  it('un "%" mal formado no lanza: devuelve null', () => {
    expect(() => matchPath('/historial/:id', '/historial/%')).not.toThrow();
    expect(matchPath('/historial/:id', '/historial/%')).toBeNull();
    expect(matchPath('/historial/:id', '/historial/%E0%A4%A')).toBeNull();
    expect(matchPath('/historial/:id', '/historial/%zz')).toBeNull();
  });

  it('distingue segmentos con y sin parámetro', () => {
    expect(matchPath('/rutinas/:id', '/rutinas/abc')).toEqual({ id: 'abc' });
    expect(matchPath('/rutinas/editar', '/rutinas/abc')).toBeNull();
    expect(matchPath('/rutinas/:id', '/rutinas/%2F')).toEqual({ id: '/' });
  });
});
