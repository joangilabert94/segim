import { describe, expect, it } from 'vitest';
import type { Routine, Session } from '../src/models';
import { buildBackup, parseBackup } from '../src/services/backup';
import { DEFAULT_SETTINGS } from '../src/models';

const routine: Routine = {
  id: 'r1',
  name: 'Push',
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  days: [
    {
      id: 'd1',
      name: 'Día 1',
      exercises: [
        {
          id: 're1',
          exerciseId: 'ex1',
          name: 'Press banca',
          plannedSets: [{ weight: 60, reps: 4, repsMax: 6 }, { reps: 10 }],
        },
      ],
    },
  ],
};

const session: Session = {
  id: 's1',
  date: '2026-10-20',
  routineId: 'r1',
  dayId: 'd1',
  dayName: 'Día 1',
  status: 'completed',
  entries: [
    {
      exerciseId: 'ex1',
      exerciseName: 'Press banca',
      sets: [{ weight: 60, reps: 5, done: true }],
    },
  ],
};

const valid = () =>
  buildBackup({
    routines: [routine],
    exercises: [
      { id: 'ex1', name: 'Press banca', muscleGroup: 'Pecho', createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    sessions: [session],
    settings: DEFAULT_SETTINGS,
  });

describe('parseBackup — validación', () => {
  it('acepta una copia completa y la conserva', () => {
    const parsed = parseBackup(JSON.stringify(valid()));
    expect(parsed.routines).toEqual([routine]);
    expect(parsed.sessions).toEqual([session]);
    expect(parsed.exercises).toHaveLength(1);
    expect(parsed.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('sigue aceptando copias antiguas sin catálogo ni tema', () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: 'gymrutinas',
        routines: [routine],
        sessions: [session],
        settings: { unit: 'lb' },
      }),
    );
    expect(parsed.exercises).toEqual([]);
    expect(parsed.settings.unit).toBe('lb');
    expect(parsed.settings.theme).toBe('auto');
    expect(parsed.settings.restPresets).toEqual(DEFAULT_SETTINGS.restPresets);
  });

  it('rechaza JSON inválido y ficheros de otra app', () => {
    expect(() => parseBackup('{nope')).toThrow('no es un JSON válido');
    expect(() => parseBackup(JSON.stringify({ app: 'otra' }))).toThrow(
      'no parece una copia de Segim',
    );
  });

  it('rechaza una versión más nueva', () => {
    expect(() =>
      parseBackup(JSON.stringify({ ...valid(), version: 2 })),
    ).toThrow('versión más nueva');
  });

  it('rechaza una rutina sin días e indica cuál', () => {
    expect(() =>
      parseBackup(JSON.stringify({ ...valid(), routines: [{ id: 'r', name: 'Rota' }] })),
    ).toThrow('La rutina 1 de la copia no tiene un "days" válido');
  });

  it('rechaza una sesión sin entries', () => {
    expect(() =>
      parseBackup(JSON.stringify({ ...valid(), sessions: [{ id: 's', date: '2026-10-20' }] })),
    ).toThrow('La sesión 1 de la copia no tiene un "entries" válido');
  });

  it('rechaza una sesión con fecha no válida', () => {
    expect(() =>
      parseBackup(
        JSON.stringify({ ...valid(), sessions: [{ ...session, date: '20/10/2026' }] }),
      ),
    ).toThrow('fecha válida');
  });

  it('rechaza un ejercicio de catálogo inválido', () => {
    expect(() =>
      parseBackup(JSON.stringify({ ...valid(), exercises: [{ id: 'x' }] })),
    ).toThrow('El ejercicio 1 de la copia no tiene un "name" válido');
  });

  it('normaliza ajustes corruptos en vez de romper la app', () => {
    const parsed = parseBackup(
      JSON.stringify({ ...valid(), settings: { unit: 'xx', restPresets: null, theme: 'blue' } }),
    );
    expect(parsed.settings.unit).toBe('kg');
    expect(parsed.settings.restPresets).toEqual(DEFAULT_SETTINGS.restPresets);
    expect(parsed.settings.theme).toBe('auto');
  });

  it('recorta y ordena los presets de descanso válidos', () => {
    const parsed = parseBackup(
      JSON.stringify({ ...valid(), settings: { restPresets: [90, 0, 'x', 601, 30] } }),
    );
    expect(parsed.settings.restPresets).toEqual([90, 5, 600, 30]);
  });

  it('una serie sin done explícito no se considera hecha', () => {
    const parsed = parseBackup(
      JSON.stringify({
        ...valid(),
        sessions: [
          {
            ...session,
            entries: [
              {
                exerciseName: 'Press banca',
                sets: [{ weight: 60, reps: 8 }],
              },
            ],
          },
        ],
      }),
    );
    expect(parsed.sessions[0].entries[0].sets[0].done).toBe(false);
  });
});
