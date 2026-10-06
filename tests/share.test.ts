import { describe, expect, it } from 'vitest';
import type { Exercise, Routine } from '../src/models';
import {
  buildRoutinesFile,
  mergeRoutines,
  parseRoutinesFile,
  referencedExercises,
} from '../src/services/share';

const CATALOGO: Exercise[] = [
  { id: 'e-press', name: 'Press banca', muscleGroup: 'Pecho', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'e-sent', name: 'Sentadilla', muscleGroup: 'Pierna', createdAt: '2026-01-01T00:00:00.000Z' },
];

function makeRoutine(over: Partial<Routine> = {}): Routine {
  return {
    id: 'r-push',
    name: 'Push',
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    days: [
      {
        id: 'd1',
        name: 'Día 1',
        exercises: [
          { id: 're1', exerciseId: 'e-press', name: 'Press banca', plannedSets: [{ weight: 60, reps: 8 }] },
        ],
      },
    ],
    ...over,
  };
}

describe('buildRoutinesFile', () => {
  it('incluye las rutinas y SOLO los ejercicios referenciados', () => {
    const file = buildRoutinesFile([makeRoutine()], CATALOGO, new Date('2026-10-06T10:00:00Z'));

    expect(file.kind).toBe('gymrutinas-routines');
    expect(file.version).toBe(1);
    expect(file.routines).toHaveLength(1);
    expect(file.exercises.map((e) => e.id)).toEqual(['e-press']); // 'e-sent' queda fuera
  });

  it('el fichero no lleva sesiones ni ajustes', () => {
    const file = buildRoutinesFile([makeRoutine()], CATALOGO);
    const json = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    expect(json).not.toHaveProperty('sessions');
    expect(json).not.toHaveProperty('settings');
  });

  it('resuelve por nombre los ejercicios de entradas sin vínculo', () => {
    const sinId = makeRoutine({
      days: [
        { id: 'd1', name: 'Día 1', exercises: [{ id: 're1', name: 'Sentadilla', plannedSets: [{ reps: 5 }] }] },
      ],
    });
    const refs = referencedExercises([sinId], CATALOGO);
    expect(refs.map((e) => e.id)).toEqual(['e-sent']);
  });
});

describe('parseRoutinesFile', () => {
  it('rechaza JSON inválido', () => {
    expect(() => parseRoutinesFile('{no es json')).toThrow('no es un JSON válido');
  });

  it('rechaza ficheros que no son de GymRutinas', () => {
    expect(() => parseRoutinesFile('{"foo":1}')).toThrow('no parece un archivo de rutinas');
  });

  it('acepta un fichero de rutinas y descarta lo que no lo sea', () => {
    const ok = JSON.stringify({
      kind: 'gymrutinas-routines',
      version: 1,
      exportedAt: '2026-10-06T10:00:00.000Z',
      routines: [makeRoutine(), { roto: true }],
      exercises: [CATALOGO[0], { id: 'x' }],
    });
    const file = parseRoutinesFile(ok);
    expect(file.routines).toHaveLength(1);
    expect(file.exercises).toHaveLength(1);
  });

  it('acepta una copia completa y extrae rutinas y catálogo', () => {
    const backup = JSON.stringify({
      app: 'gymrutinas',
      version: 1,
      exportedAt: '2026-10-06T10:00:00.000Z',
      routines: [makeRoutine()],
      exercises: CATALOGO,
      sessions: [{ id: 's1' }],
      settings: { unit: 'kg' },
    });
    const file = parseRoutinesFile(backup);
    expect(file.kind).toBe('gymrutinas-routines');
    expect(file.routines).toHaveLength(1);
    expect(file.exercises).toHaveLength(2);
  });

  it('rechaza una copia sin rutinas', () => {
    expect(() =>
      parseRoutinesFile(JSON.stringify({ app: 'gymrutinas', sessions: [] })),
    ).toThrow('no contiene rutinas');
  });
});

describe('mergeRoutines', () => {
  it('añade la rutina conservando sus ids', () => {
    const file = buildRoutinesFile([makeRoutine()], CATALOGO);
    const res = mergeRoutines([], [], file);

    expect(res.added).toBe(1);
    expect(res.skipped).toBe(0);
    expect(res.routines[0].id).toBe('r-push');
    expect(res.exercises.map((e) => e.id)).toEqual(['e-press']);
    expect(res.exercisesAdded).toBe(1);
    expect(res.routines[0].days[0].exercises[0].exerciseId).toBe('e-press');
  });

  it('omite las rutinas que ya existen por id (reimportar no duplica)', () => {
    const local = [makeRoutine()];
    const file = buildRoutinesFile([makeRoutine()], CATALOGO);

    const primera = mergeRoutines(local, CATALOGO, file);
    expect(primera.added).toBe(0);
    expect(primera.skipped).toBe(1);
    expect(primera.exercisesAdded).toBe(0);
  });

  it('vincula por nombre cuando el ejercicio ya existe con otro id', () => {
    const localCatalog: Exercise[] = [
      { id: 'e-local', name: 'Press banca', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    const file = buildRoutinesFile([makeRoutine()], CATALOGO); // trae 'e-press'
    const res = mergeRoutines([], localCatalog, file);

    expect(res.exercisesAdded).toBe(0);
    expect(res.exercises.map((e) => e.id)).toEqual(['e-local']); // sin duplicar
    expect(res.routines[0].days[0].exercises[0].exerciseId).toBe('e-local');
  });

  it('vincula por nombre las entradas sin exerciseId', () => {
    const sinId = makeRoutine({
      days: [
        { id: 'd1', name: 'Día 1', exercises: [{ id: 're1', name: 'Press banca', plannedSets: [{ reps: 8 }] }] },
      ],
    });
    const res = mergeRoutines([], CATALOGO, buildRoutinesFile([sinId], CATALOGO));
    expect(res.routines[0].days[0].exercises[0].exerciseId).toBe('e-press');
  });

  it('suma sin tocar las rutinas existentes', () => {
    const local = [makeRoutine({ id: 'r-local', name: 'Local' })];
    const otra = makeRoutine({ id: 'r-otra', name: 'Legs' });
    const res = mergeRoutines(local, [], buildRoutinesFile([otra], CATALOGO));

    expect(res.added).toBe(1);
    expect(res.routines.map((r) => r.id)).toEqual(['r-local', 'r-otra']);
    expect(res.routines[0].name).toBe('Local');
  });
});

describe('series cronometradas en el intercambio', () => {
  it('el export/import conserva durationSec', () => {
    const timed = makeRoutine({
      days: [
        {
          id: 'd1',
          name: 'Día 1',
          exercises: [
            {
              id: 're1',
              exerciseId: 'e-sent',
              name: 'Sentadilla',
              plannedSets: [{ weight: 0, reps: 0, durationSec: 30 }, { reps: 8 }],
            },
          ],
        },
      ],
    });

    const file = buildRoutinesFile([timed], CATALOGO);
    const parsed = parseRoutinesFile(JSON.stringify(file));
    expect(parsed.routines[0]?.days[0]?.exercises[0]?.plannedSets).toEqual([
      { weight: 0, reps: 0, durationSec: 30 },
      { reps: 8 },
    ]);
  });

  it('mergeRoutines también las conserva', () => {
    const timed = makeRoutine({
      days: [
        {
          id: 'd1',
          name: 'Día 1',
          exercises: [
            { id: 're1', exerciseId: 'e-sent', name: 'Sentadilla', plannedSets: [{ reps: 0, durationSec: 45 }] },
          ],
        },
      ],
    });

    const res = mergeRoutines([], [], buildRoutinesFile([timed], CATALOGO));
    expect(res.routines[0]?.days[0]?.exercises[0]?.plannedSets[0]?.durationSec).toBe(45);
  });

  it('el export/import conserva los rangos de reps', () => {
    const ranged = makeRoutine({
      days: [
        {
          id: 'd1',
          name: 'Día 1',
          exercises: [
            {
              id: 're1',
              exerciseId: 'e-sent',
              name: 'Sentadilla',
              plannedSets: [{ reps: 4, repsMax: 6 }, { reps: 10 }],
            },
          ],
        },
      ],
    });

    const file = buildRoutinesFile([ranged], CATALOGO);
    const parsed = parseRoutinesFile(JSON.stringify(file));
    expect(parsed.routines[0]?.days[0]?.exercises[0]?.plannedSets).toEqual([
      { reps: 4, repsMax: 6 },
      { reps: 10 },
    ]);

    const res = mergeRoutines([], [], file);
    expect(res.routines[0]?.days[0]?.exercises[0]?.plannedSets[0]).toEqual({
      reps: 4,
      repsMax: 6,
    });
  });
});
