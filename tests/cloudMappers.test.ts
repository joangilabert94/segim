import { describe, expect, it } from 'vitest';
import type { Exercise, Routine, Session, Settings } from '../src/models';
import { DEFAULT_SETTINGS } from '../src/models';
import {
  diffEntities,
  exerciseToRow,
  exercisesFromRows,
  routineToRows,
  routinesFromRows,
  sessionToRows,
  sessionsFromRows,
  settingsFromRow,
  settingsToRow,
} from '../src/services/cloud/mappers';

const USER = '11111111-1111-1111-1111-111111111111';

const routine: Routine = {
  id: 'r1',
  name: 'Torso 1',
  archived: false,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  days: [
    {
      id: 'd1',
      name: 'Torso-pierna',
      exercises: [
        {
          id: 're1',
          exerciseId: 'ex1',
          name: 'Dominadas supinas',
          muscleGroup: 'Espalda',
          plannedSets: [
            { weight: 12.5, reps: 4, repsMax: 6 },
            { weight: 12.5, reps: 4, repsMax: 6 },
          ],
        },
        {
          id: 're2',
          name: 'Press banca',
          plannedSets: [{ weight: 115, reps: 4, note: 'última serie al fallo' }],
        },
        {
          id: 're3',
          name: 'Plancha',
          plannedSets: [{ reps: 0, durationSec: 60 }],
        },
      ],
    },
    { id: 'd2', name: 'Pierna', exercises: [] },
  ],
};

const session: Session = {
  id: 's1',
  date: '2026-11-23',
  routineId: 'r1',
  dayId: 'd1',
  dayName: 'Torso 1',
  status: 'completed',
  entries: [
    {
      exerciseId: 'ex2',
      exerciseName: 'Press banca',
      note: 'bien',
      sets: [
        { weight: 115, reps: 4, done: true },
        { weight: 115, reps: 3, done: false, extra: true },
        { weight: 0, reps: 0, durationSec: 60, done: true },
      ],
    },
    { exerciseName: 'Sesión libre', sets: [{ weight: 20, reps: 10, done: true }] },
  ],
};

const exercise: Exercise = {
  id: 'ex1',
  name: 'Dominadas supinas',
  muscleGroup: 'Espalda',
  createdAt: '2026-10-01T09:00:00.000Z',
  load: 'bodyweight',
  unilateral: true,
  increment: 2.5,
};

describe('mapeadores de rutinas', () => {
  it('una rutina sobrevive a subir y bajar, con orden y campos opcionales', () => {
    const rows = routineToRows(routine, USER);
    expect(rows.days.map((row) => row.id)).toEqual(['d1', 'd2']);
    expect(rows.exercises.every((row) => row.user_id === USER)).toBe(true);
    expect(rows.sets).toHaveLength(4);

    const back = routinesFromRows({
      routines: [rows.routine],
      days: [...rows.days].reverse(),
      exercises: [...rows.exercises].reverse(),
      sets: [...rows.sets].reverse(),
    });

    expect(back).toEqual([routine]);
  });

  it('los ids de los días son los de la app (sessions.day_id depende de ellos)', () => {
    const rows = routineToRows(routine, USER);
    expect(rows.days[0].id).toBe('d1');
    expect(rows.exercises.find((row) => row.id === 're1')?.day_id).toBe('d1');
  });

  it('tolera números que llegan como texto desde Postgres', () => {
    const rows = routineToRows(routine, USER);
    const sets = rows.sets.map((set) => ({
      ...set,
      weight: set.weight === null ? null : String(set.weight),
      reps: String(set.reps),
      reps_max: set.reps_max === null ? null : String(set.reps_max),
      position: String(set.position),
    }));

    const back = routinesFromRows({
      routines: [rows.routine],
      days: rows.days.map((day) => ({ ...day, position: String(day.position) })),
      exercises: rows.exercises,
      sets,
    });

    expect(back[0].days[0].exercises[0].plannedSets[0]).toEqual({ weight: 12.5, reps: 4, repsMax: 6 });
  });
});

describe('mapeadores de sesiones', () => {
  it('una sesión sobrevive a subir y bajar, con series por posición', () => {
    const rows = sessionToRows(session, USER);
    expect(rows.entries).toHaveLength(2);

    // Simula los ids que genera Postgres al insertar los ejercicios de la sesión.
    const entries = rows.entries.map((entry, index) => ({ ...entry, id: `entry-${index}` }));
    const sets = rows.sets.map(({ entry_position, ...set }) => ({
      ...set,
      session_entry_id: `entry-${entry_position}`,
    }));

    const back = sessionsFromRows({
      sessions: [rows.session],
      entries: [...entries].reverse(),
      sets: [...sets].reverse(),
    });

    expect(back).toEqual([session]);
  });
});

describe('mapeadores de catálogo y ajustes', () => {
  it('el ejercicio conserva tipo de carga, unilateral e incremento', () => {
    const back = exercisesFromRows([exerciseToRow(exercise, USER)]);
    expect(back).toEqual([exercise]);
  });

  it('un ejercicio sin campos opcionales no los inventa', () => {
    const plain: Exercise = { id: 'ex9', name: 'Remo', createdAt: '2026-01-01T00:00:00.000Z' };
    const back = exercisesFromRows([exerciseToRow(plain, USER)]);
    expect(back).toEqual([plain]);
    expect('load' in back[0]).toBe(false);
  });

  it('los ajustes se reconstruyen y, sin fila, vuelven a los valores por defecto', () => {
    const settings: Settings = {
      unit: 'lb',
      restPresets: [45, 90, 150],
      activeRoutineId: 'r1',
      theme: 'dark',
      lightPalette: 'oceano',
      darkPalette: 'ambar',
      progressionIncrement: 5,
      bodyweight: 78.5,
    };
    // La nube no transporta paletas (son locales al dispositivo): el round-trip
    // las deja en los valores por defecto y el puente re-aplica las locales.
    expect(settingsFromRow(settingsToRow(settings, USER))).toEqual({
      ...settings,
      lightPalette: DEFAULT_SETTINGS.lightPalette,
      darkPalette: DEFAULT_SETTINGS.darkPalette,
    });

    const empty = settingsFromRow(null);
    expect(empty).toEqual(DEFAULT_SETTINGS);
  });
});

describe('diferencias para subir solo lo que cambió', () => {
  it('detecta añadidos, cambios y borrados', () => {
    const previous = new Map([
      ['a', JSON.stringify({ id: 'a', name: 'uno' })],
      ['b', JSON.stringify({ id: 'b', name: 'dos' })],
    ]);
    const next = [
      { id: 'a', name: 'uno' },
      { id: 'c', name: 'tres' },
    ];

    const diff = diffEntities(previous, next, (item) => item.id);
    expect(diff.added).toEqual([{ id: 'c', name: 'tres' }]);
    expect(diff.changed).toEqual([]);
    expect(diff.removed).toEqual(['b']);
  });
});
