import { describe, expect, it } from 'vitest';
import type { Routine, Session } from '../src/models';
import { findEntry, findPreviousSession, normalizeName } from '../src/services/previousSession';
import { prefillFromPrevious } from '../src/services/prefill';
import { buildSessionFromDay } from '../src/services/session';
import { cloneRoutine } from '../src/services/cloneRoutine';
import { suggestDay } from '../src/services/suggestDay';
import { streak, volumeOf } from '../src/services/stats';
import { fmtReps, parseRepsFixed, parseRepsRange } from '../src/services/format';

// ---- Fixtures ----

function makeSession(over: Partial<Session>): Session {
  return {
    id: 's1',
    date: '2026-09-28',
    dayName: 'Día 1',
    status: 'completed',
    startedAt: '2026-09-28T10:00:00.000Z',
    completedAt: '2026-09-28T11:00:00.000Z',
    entries: [],
    ...over,
  };
}

function makeRoutine(): Routine {
  return {
    id: 'r1',
    name: 'Push / Pull / Legs',
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    days: [
      {
        id: 'd1',
        name: 'Push',
        exercises: [
          {
            id: 'e1',
            name: 'Press banca',
            plannedSets: [
              { weight: 60, reps: 8 },
              { weight: 65, reps: 6 },
            ],
          },
        ],
      },
      { id: 'd2', name: 'Pull', exercises: [] },
      { id: 'd3', name: 'Legs', exercises: [] },
    ],
  };
}

// ---- Tests ----

describe('normalizeName', () => {
  it('normaliza mayúsculas, acentos y espacios', () => {
    expect(normalizeName('  Press Banca ')).toBe('press banca');
    expect(normalizeName('Rodillo  de  bíceps')).toBe('rodillo de biceps');
  });
});

describe('findPreviousSession', () => {
  const anterior = makeSession({
    id: 'old',
    date: '2026-09-21',
    entries: [
      {
        exerciseName: 'Press Banca',
        sets: [{ weight: 62, reps: 8, done: true }, { weight: 67, reps: 5, done: true }],
      },
    ],
  });
  const masReciente = makeSession({
    id: 'newer',
    date: '2026-09-28',
    entries: [
      {
        exerciseName: 'press  banca',
        sets: [{ weight: 64, reps: 8, done: true }],
      },
    ],
  });

  it('encuentra la última sesión completada con el ejercicio (nombre normalizado)', () => {
    const found = findPreviousSession([masReciente, anterior], 'Press banca');
    expect(found?.id).toBe('newer');
  });

  it('excluye la sesión actual', () => {
    const found = findPreviousSession([masReciente, anterior], 'Press banca', {
      excludeId: 'newer',
    });
    expect(found?.id).toBe('old');
  });

  it('devuelve undefined si nadie entrenó ese ejercicio', () => {
    expect(findPreviousSession([masReciente, anterior], 'Sentadilla')).toBeUndefined();
  });

  it('ignora sesiones en curso', () => {
    const enCurso = makeSession({
      id: 'wip',
      status: 'in-progress',
      date: '2026-10-01',
      entries: [{ exerciseName: 'Press banca', sets: [] }],
    });
    const found = findPreviousSession([enCurso, masReciente], 'Press banca');
    expect(found?.id).toBe('newer');
  });

  it('findEntry encuentra el ejercicio dentro de una sesión', () => {
    const entry = findEntry(anterior, 'press BANCA');
    expect(entry?.sets).toHaveLength(2);
  });
});

describe('prefillFromPrevious', () => {
  it('la serie i toma los valores de la serie i anterior', () => {
    const planned = [
      { weight: 60, reps: 8 },
      { weight: 65, reps: 6 },
    ];
    const previous = [
      { weight: 62, reps: 8, done: true },
      { weight: 67, reps: 5, done: true },
    ];
    const result = prefillFromPrevious(planned, previous);
    expect(result).toEqual([
      { weight: 62, reps: 8, done: false },
      { weight: 67, reps: 5, done: false },
    ]);
  });

  it('si la anterior tiene menos series, el resto usa el plan', () => {
    const planned = [
      { weight: 60, reps: 8 },
      { weight: 65, reps: 6 },
    ];
    const previous = [{ weight: 70, reps: 8, done: true }];
    const result = prefillFromPrevious(planned, previous);
    expect(result[0].weight).toBe(70);
    expect(result[1].weight).toBe(65);
    expect(result[1].reps).toBe(6);
  });

  it('sin sesión anterior usa el plan (y 0 si no hay peso planeado)', () => {
    const planned = [{ reps: 10 }, { weight: 50, reps: 8 }];
    const result = prefillFromPrevious(planned, undefined);
    expect(result[0]).toEqual({ weight: 0, reps: 10, done: false });
    expect(result[1]).toEqual({ weight: 50, reps: 8, done: false });
  });

  it('arrastra la duración de las series cronometradas (anterior > plan)', () => {
    const planned = [
      { weight: 0, reps: 0, durationSec: 30 },
      { reps: 10 },
    ];
    const previous = [
      { weight: 0, reps: 0, durationSec: 45, done: true },
      { weight: 40, reps: 12, done: true },
    ];
    const result = prefillFromPrevious(planned, previous);
    expect(result[0]).toEqual({ weight: 0, reps: 0, done: false, durationSec: 45 });
    expect(result[1]).toEqual({ weight: 40, reps: 12, done: false });
    expect(result[1].durationSec).toBeUndefined();
  });

  it('sin sesión anterior toma la duración del plan', () => {
    const result = prefillFromPrevious([{ weight: 0, reps: 0, durationSec: 30 }], undefined);
    expect(result[0]).toEqual({ weight: 0, reps: 0, done: false, durationSec: 30 });
  });

  it('el rango del plan no pasa a la sesión: se queda en lo conseguido', () => {
    const planned = [
      { weight: 0, reps: 4, repsMax: 6 },
      { reps: 10 },
    ];
    const previous = [
      { weight: 0, reps: 5, done: true },
      { weight: 40, reps: 12, done: true },
    ];
    const result = prefillFromPrevious(planned, previous);
    expect(result[0]).toEqual({ weight: 0, reps: 5, done: false });
    expect(result[1].reps).toBe(12);
    expect(result[1].repsMax).toBeUndefined();
  });

  it('sin sesión anterior, la sesión toma el mínimo del plan como fijo', () => {
    const result = prefillFromPrevious([{ weight: 0, reps: 4, repsMax: 6 }], undefined);
    expect(result[0]).toEqual({ weight: 0, reps: 4, done: false });
    expect(result[0].repsMax).toBeUndefined();
  });

  it('una sesión anterior con rango antiguo arrastra solo las reps fijas', () => {
    const result = prefillFromPrevious(
      [{ weight: 0, reps: 4, repsMax: 6 }],
      [{ weight: 0, reps: 5, repsMax: 7, done: true }],
    );
    expect(result[0]).toEqual({ weight: 0, reps: 5, done: false });
  });

  it('un rango inconsistente (plan 4-6 con anterior fijo 10) se guarda como fijo', () => {
    const result = prefillFromPrevious(
      [{ reps: 4, repsMax: 6 }],
      [{ weight: 0, reps: 10, done: true }],
    );
    expect(result[0].reps).toBe(10);
    expect(result[0].repsMax).toBeUndefined();
  });
});

describe('buildSessionFromDay', () => {
  it('crea una sesión en curso pre-rellenada desde la sesión anterior', () => {
    const routine = makeRoutine();
    const previous = makeSession({
      id: 'prev',
      date: '2026-09-28',
      entries: [
        {
          exerciseName: 'Press banca',
          sets: [
            { weight: 62, reps: 8, done: true },
            { weight: 67, reps: 5, done: true },
          ],
        },
      ],
    });

    const session = buildSessionFromDay(routine, routine.days[0], [previous]);

    expect(session.status).toBe('in-progress');
    expect(session.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(session.routineId).toBe('r1');
    expect(session.entries).toHaveLength(1);
    expect(session.entries[0].sets).toEqual([
      { weight: 62, reps: 8, done: false },
      { weight: 67, reps: 5, done: false },
    ]);
  });

  it('las series cronometradas del plan llegan a la sesión', () => {
    const routine = makeRoutine();
    routine.days[0].exercises[0].plannedSets = [
      { weight: 0, reps: 0, durationSec: 30 },
      { reps: 8 },
    ];

    const session = buildSessionFromDay(routine, routine.days[0], []);

    expect(session.entries[0].sets).toEqual([
      { weight: 0, reps: 0, done: false, durationSec: 30 },
      { weight: 0, reps: 8, done: false },
    ]);
  });

  it('un rango en el plan (4-6) llega a la sesión como número fijo', () => {
    const routine = makeRoutine();
    routine.days[0].exercises[0].plannedSets = [
      { weight: 60, reps: 4, repsMax: 6 },
      { weight: 65, reps: 8 },
    ];

    const session = buildSessionFromDay(routine, routine.days[0], []);

    expect(session.entries[0].sets).toEqual([
      { weight: 60, reps: 4, done: false },
      { weight: 65, reps: 8, done: false },
    ]);
  });
});

describe('cloneRoutine', () => {
  it('clona en profundidad con ids nuevos y marca el origen', () => {
    const original = makeRoutine();
    const copy = cloneRoutine(original);

    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe(`Copia de ${original.name}`);
    expect(copy.sourceRoutineId).toBe(original.id);
    expect(copy.days).toHaveLength(original.days.length);
    expect(copy.days[0].id).not.toBe(original.days[0].id);
    expect(copy.days[0].exercises[0].id).not.toBe(original.days[0].exercises[0].id);
    expect(copy.days[0].exercises[0].plannedSets).toEqual(
      original.days[0].exercises[0].plannedSets,
    );

    // No comparte referencias con el original
    copy.days[0].exercises[0].plannedSets[0].weight = 999;
    expect(original.days[0].exercises[0].plannedSets[0].weight).toBe(60);
  });
});

describe('suggestDay', () => {
  it('empieza por el primer día si no hay sesiones', () => {
    const routine = makeRoutine();
    expect(suggestDay(routine, [])?.id).toBe('d1');
  });

  it('sigue el orden y pasa de la vuelta', () => {
    const routine = makeRoutine();
    const hechas = [
      makeSession({ id: 'a', date: '2026-09-24', routineId: 'r1', dayId: 'd1' }),
      makeSession({ id: 'b', date: '2026-09-26', routineId: 'r1', dayId: 'd2' }),
    ];
    expect(suggestDay(routine, hechas)?.id).toBe('d3');
    const tres = [
      ...hechas,
      makeSession({ id: 'c', date: '2026-09-29', routineId: 'r1', dayId: 'd3' }),
    ];
    expect(suggestDay(routine, tres)?.id).toBe('d1');
  });
});

describe('parseRepsFixed (campo de reps de la sesión)', () => {
  it('acepta solo un número y redondea', () => {
    expect(parseRepsFixed('10')).toBe(10);
    expect(parseRepsFixed(' 8,5 ')).toBe(9);
  });

  it('rechaza rangos y texto no numérico', () => {
    expect(parseRepsFixed('4-6')).toBeNull();
    expect(parseRepsFixed('4 – 6')).toBeNull();
    expect(parseRepsFixed('-3')).toBeNull();
    expect(parseRepsFixed('')).toBeNull();
    expect(parseRepsFixed('abc')).toBeNull();
  });
});

describe('parseRepsRange / fmtReps', () => {
  it('acepta un número fijo y redondea', () => {
    expect(parseRepsRange('10')).toEqual({ reps: 10 });
    expect(parseRepsRange(' 8,5 ')).toEqual({ reps: 9 });
    expect(parseRepsRange('-3')).toBeNull(); // el guion es separador de rango
  });

  it('acepta un rango y lo normaliza de menor a mayor', () => {
    expect(parseRepsRange('4-6')).toEqual({ reps: 4, repsMax: 6 });
    expect(parseRepsRange('4 – 6')).toEqual({ reps: 4, repsMax: 6 });
    expect(parseRepsRange('6-4')).toEqual({ reps: 4, repsMax: 6 });
    expect(parseRepsRange('5-5')).toEqual({ reps: 5 });
  });

  it('rechaza lo que no sea número ni rango', () => {
    expect(parseRepsRange('')).toBeNull();
    expect(parseRepsRange('abc')).toBeNull();
    expect(parseRepsRange('4-6-8')).toBeNull();
    expect(parseRepsRange('-')).toBeNull();
  });

  it('fmtReps pinta 10 o 4-6', () => {
    expect(fmtReps(10)).toBe('10');
    expect(fmtReps(4, 6)).toBe('4-6');
    expect(fmtReps(6, 6)).toBe('6'); // extremos iguales: fijo
  });
});

describe('stats', () => {
  it('volumen = Σ peso × reps de series hechas', () => {
    const session = makeSession({
      entries: [
        {
          exerciseName: 'Press',
          sets: [
            { weight: 60, reps: 8, done: true },
            { weight: 65, reps: 6, done: false },
          ],
        },
      ],
    });
    expect(volumeOf(session)).toBe(480);
  });

  it('las series cronometradas no suman volumen', () => {
    const session = makeSession({
      entries: [
        {
          exerciseName: 'Plancha',
          sets: [
            { weight: 60, reps: 8, done: true },
            { weight: 10, reps: 8, done: true, durationSec: 30 },
            { weight: 65, reps: 6, done: false },
          ],
        },
      ],
    });
    expect(volumeOf(session)).toBe(480); // la plancha (30 s) queda fuera
  });

  it('un rango antiguo en datos de sesión cuenta el extremo alto en el volumen', () => {
    const session = makeSession({
      entries: [
        {
          exerciseName: 'Press',
          sets: [
            { weight: 100, reps: 4, repsMax: 6, done: true },
            { weight: 100, reps: 4, repsMax: 6, done: false },
          ],
        },
      ],
    });
    expect(volumeOf(session)).toBe(600); // 100 × 6, la sin marcar no cuenta
  });

  it('racha de días consecutivos', () => {
    const hoy = new Date();
    const iso = (offset: number) => {
      const d = new Date(hoy);
      d.setDate(d.getDate() - offset);
      return d.toISOString().slice(0, 10);
    };
    const sesiones = [
      makeSession({ id: '1', date: iso(0) }),
      makeSession({ id: '2', date: iso(1) }),
      makeSession({ id: '3', date: iso(2) }),
      makeSession({ id: '4', date: iso(5) }),
    ];
    expect(streak(sesiones)).toBe(3);
    expect(streak([])).toBe(0);
    expect(streak([makeSession({ id: 'x', date: iso(4) })])).toBe(0);
  });
});
