import { describe, expect, it } from 'vitest';
import type { Exercise, Routine, Session } from '../src/models';
import {
  findExercise,
  linkRoutinesToCatalog,
  pickOrCreateExercise,
  seedCatalogFromRoutines,
} from '../src/services/catalog';
import {
  findEntry,
  findPreviousSession,
  matchesExercise,
} from '../src/services/previousSession';
import { buildSessionFromDay } from '../src/services/session';

function makeSession(over: Partial<Session>): Session {
  return {
    id: 's1',
    date: '2026-09-28',
    dayName: 'Día 1',
    status: 'completed',
    entries: [],
    ...over,
  };
}

function makeRoutine(): Routine {
  return {
    id: 'r1',
    name: 'Rutina',
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    days: [
      {
        id: 'd1',
        name: 'Día 1',
        exercises: [
          {
            id: 'e1',
            exerciseId: 'ex-press',
            name: 'Press banca',
            plannedSets: [{ weight: 60, reps: 8 }],
          },
          {
            id: 'e2',
            name: 'Legacy sin catálogo',
            plannedSets: [{ reps: 10 }],
          },
        ],
      },
    ],
  };
}

describe('matchesExercise — identidad por id', () => {
  it('con ids en ambos lados compara ids (aunque el nombre cambie)', () => {
    expect(
      matchesExercise(
        { exerciseId: 'ex-1', name: 'Press banca' },
        { exerciseId: 'ex-1', name: 'Press inclinado con mancuernas' },
      ),
    ).toBe(true);
    expect(
      matchesExercise(
        { exerciseId: 'ex-1', name: 'Press banca' },
        { exerciseId: 'ex-2', name: 'Press banca' },
      ),
    ).toBe(false);
  });

  it('si falta el id en alguno, cae al nombre normalizado', () => {
    expect(
      matchesExercise({ name: 'Press Banca' }, { name: '  press banca ' }),
    ).toBe(true);
    expect(
      matchesExercise({ exerciseId: 'ex-1', name: 'A' }, { name: 'B' }),
    ).toBe(false);
  });
});

describe('findPreviousSession por id estable', () => {
  const anterior = makeSession({
    id: 'old',
    date: '2026-09-21',
    entries: [
      {
        exerciseId: 'ex-press',
        exerciseName: 'Press banca (nombre viejo)',
        sets: [{ weight: 60, reps: 8, done: true }],
      },
    ],
  });

  it('encuentra la sesión anterior aunque el nombre haya cambiado', () => {
    const found = findPreviousSession([anterior], {
      exerciseId: 'ex-press',
      name: 'Press banca',
    });
    expect(found?.id).toBe('old');
    expect(findEntry(anterior, { exerciseId: 'ex-press', name: 'Otro' })?.sets).toHaveLength(1);
  });

  it('no empareja ids distintos con el mismo nombre', () => {
    const otro = makeSession({
      id: 'otro',
      date: '2026-09-25',
      entries: [
        { exerciseId: 'ex-otro', exerciseName: 'Press banca', sets: [{ weight: 99, reps: 1, done: true }] },
      ],
    });
    const found = findPreviousSession([otro], {
      exerciseId: 'ex-press',
      name: 'Press banca',
    });
    expect(found).toBeUndefined();
  });
});

describe('catálogo de ejercicios', () => {
  it('findExercise busca por nombre normalizado', () => {
    const catalog: Exercise[] = [
      { id: 'ex-1', name: 'Press banca', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    expect(findExercise(catalog, ' PRESS  BANCA ')?.id).toBe('ex-1');
    expect(findExercise(catalog, 'Sentadilla')).toBeUndefined();
  });

  it('pickOrCreateExercise no duplica nombres existentes', () => {
    const catalog: Exercise[] = [
      { id: 'ex-1', name: 'Dominadas', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    const result = pickOrCreateExercise(catalog, 'dominadas ', 'Espalda');
    expect(result.id).toBe('ex-1');
    expect(catalog).toHaveLength(1);
  });

  it('pickOrCreateExercise crea con id nuevo si no existe', () => {
    const created = pickOrCreateExercise([], '  Remo  ', 'Espalda');
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('Remo');
    expect(created.muscleGroup).toBe('Espalda');
  });

  it('seedCatalogFromRoutines siembra desde rutinas solo si está vacío', () => {
    const routines = [makeRoutine()];
    const seeded = seedCatalogFromRoutines([], routines);
    expect(seeded.map((e) => e.name).sort()).toEqual([
      'Legacy sin catálogo',
      'Press banca',
    ]);

    const already: Exercise[] = [
      { id: 'ex-x', name: 'Otro', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    expect(seedCatalogFromRoutines(already, routines)).toBe(already);
  });

  it('linkRoutinesToCatalog vincula por nombre los ejercicios sin id', () => {
    const catalog: Exercise[] = [
      { id: 'ex-press', name: 'Press banca', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    // Rutina "antigua": el ejercicio no tiene vínculo con el catálogo
    const legacy = makeRoutine();
    legacy.days[0].exercises[0] = {
      ...legacy.days[0].exercises[0],
      exerciseId: undefined,
    };

    const linked = linkRoutinesToCatalog([legacy], catalog);

    expect(linked.changed).toBe(true);
    expect(linked.routines[0].days[0].exercises[0].exerciseId).toBe('ex-press');
    // El ejercicio sin coincidencia en el catálogo queda como estaba
    expect(linked.routines[0].days[0].exercises[1].exerciseId).toBeUndefined();
  });

  it('linkRoutinesToCatalog no marca cambios si todo ya está vinculado', () => {
    const catalog: Exercise[] = [
      { id: 'ex-press', name: 'Press banca', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    const once = linkRoutinesToCatalog([makeRoutine()], catalog);
    expect(once.changed).toBe(false);

    const twice = linkRoutinesToCatalog(once.routines, catalog);
    expect(twice.changed).toBe(false);
    expect(twice.routines).toEqual(once.routines);
  });
});

describe('buildSessionFromDay — vínculos por id', () => {
  it('copia el exerciseId de la rutina y lo resuelve desde el catálogo', () => {
    const routine = makeRoutine();
    const catalog: Exercise[] = [
      { id: 'ex-legacy', name: 'Legacy sin catálogo', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    const session = buildSessionFromDay(routine, routine.days[0], [], catalog);

    expect(session.entries[0].exerciseId).toBe('ex-press');
    expect(session.entries[1].exerciseId).toBe('ex-legacy');
  });

  it('la comparación posterior funciona por id aunque cambie el nombre', () => {
    const routine = makeRoutine();
    const catalog: Exercise[] = [];
    const session = buildSessionFromDay(routine, routine.days[0], [], catalog);

    // Sesión previa con el mismo id pero otro nombre
    const previa = makeSession({
      id: 'prev',
      date: '2026-09-20',
      entries: [
        {
          exerciseId: 'ex-press',
          exerciseName: 'Otro nombre',
          sets: [{ weight: 70, reps: 6, done: true }],
        },
      ],
    });
    const found = findPreviousSession([previa, session], {
      exerciseId: 'ex-press',
      name: 'Press banca',
    });
    expect(found?.id).toBe('prev');
  });
});
