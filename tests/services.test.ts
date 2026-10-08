import { describe, expect, it } from 'vitest';
import type { Routine, Session } from '../src/models';
import { findEntry, findPreviousSession, normalizeName } from '../src/services/previousSession';
import { prefillFromBest } from '../src/services/prefill';
import { buildSessionFromDay } from '../src/services/session';
import {
  bestOverallForExercise,
  bestSetsForExercise,
  mergeWithBest,
} from '../src/services/bestResults';
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

describe('prefillFromBest — sugerencia de la sesión', () => {
  it('cada campo toma el mayor entre el plan y el mejor resultado', () => {
    const planned = [
      { weight: 60, reps: 8 },
      { weight: 65, reps: 6 },
    ];
    const best = [
      { weight: 62, reps: 8, done: true },
      { weight: 67, reps: 5, done: true },
    ];
    const result = prefillFromBest(planned, best);
    expect(result).toEqual([
      { weight: 62, reps: 8, done: false }, // peso 62 > 60
      { weight: 67, reps: 6, done: false }, // peso 67 > 65; reps plan 6 > mejor 5
    ]);
  });

  it('si el historial tiene menos series, el resto usa el plan', () => {
    const planned = [
      { weight: 60, reps: 8 },
      { weight: 65, reps: 6 },
    ];
    const best = [{ weight: 70, reps: 8, done: true }];
    const result = prefillFromBest(planned, best);
    expect(result[0].weight).toBe(70); // 70 > 60: prevalece lo entrenado
    expect(result[1].weight).toBe(65); // sin datos: el plan
    expect(result[1].reps).toBe(6);
  });

  it('sin resultados previos usa el plan (y 0 si no hay peso planeado)', () => {
    const planned = [{ reps: 10 }, { weight: 50, reps: 8 }];
    const result = prefillFromBest(planned, undefined);
    expect(result[0]).toEqual({ weight: 0, reps: 10, done: false });
    expect(result[1]).toEqual({ weight: 50, reps: 8, done: false });
  });

  it('la duración toma la mayor de plan y mejor resultado (45 > 30)', () => {
    const planned = [
      { weight: 0, reps: 0, durationSec: 30 },
      { reps: 10 },
    ];
    const best = [
      { weight: 0, reps: 0, durationSec: 45, done: true },
      { weight: 40, reps: 12, done: true },
    ];
    const result = prefillFromBest(planned, best);
    expect(result[0]).toEqual({ weight: 0, reps: 0, done: false, durationSec: 45 });
    expect(result[1]).toEqual({ weight: 40, reps: 12, done: false });
    expect(result[1].durationSec).toBeUndefined();
  });

  it('sin resultados, la duración es la planeada (30 s)', () => {
    const result = prefillFromBest([{ weight: 0, reps: 0, durationSec: 30 }], undefined);
    expect(result[0]).toEqual({ weight: 0, reps: 0, done: false, durationSec: 30 });
  });

  it('el rango del plan se conserva como sugerencia si el mejor está dentro', () => {
    const planned = [
      { weight: 0, reps: 4, repsMax: 6 },
      { reps: 10 },
    ];
    const best = [
      { weight: 0, reps: 5, done: true },
      { weight: 40, reps: 12, done: true },
    ];
    const result = prefillFromBest(planned, best);
    expect(result[0]).toEqual({ weight: 0, reps: 4, repsMax: 6, done: false });
    expect(result[1].reps).toBe(12); // reps fijas: el mayor
    expect(result[1].repsMax).toBeUndefined();
  });

  it('sin resultados, la sesión sugiere el rango del plan (4-6)', () => {
    const result = prefillFromBest([{ weight: 0, reps: 4, repsMax: 6 }], undefined);
    expect(result[0]).toEqual({ weight: 0, reps: 4, repsMax: 6, done: false });
  });

  it('un rango antiguo en la historia no influye si está dentro del plan', () => {
    const result = prefillFromBest(
      [{ weight: 0, reps: 4, repsMax: 6 }],
      [{ weight: 0, reps: 5, repsMax: 7, done: true }],
    );
    expect(result[0]).toEqual({ weight: 0, reps: 4, repsMax: 6, done: false });
  });

  it('un mejor por fuera del rango (10) hace fija la sugerencia', () => {
    const result = prefillFromBest(
      [{ reps: 4, repsMax: 6 }],
      [{ weight: 0, reps: 10, done: true }],
    );
    expect(result[0].reps).toBe(10);
    expect(result[0].repsMax).toBeUndefined();
  });

  it('al subir de peso se mantiene el rango (4-6 a 120 kg)', () => {
    const planned = [{ weight: 120, reps: 4, repsMax: 6 }];
    const best = [{ weight: 115, reps: 6, done: true }];
    const result = prefillFromBest(planned, best);
    expect(result[0]).toEqual({ weight: 120, reps: 4, repsMax: 6, done: false });
  });

  it('con el mismo peso el rango se mantiene aunque la mejor esté en su tope', () => {
    const planned = [{ weight: 115, reps: 4, repsMax: 6 }];
    const best = [{ weight: 115, reps: 6, done: true }];
    const result = prefillFromBest(planned, best);
    expect(result[0]).toEqual({ weight: 115, reps: 4, repsMax: 6, done: false });
  });

  it('el peso superior de la historia sube la sugerencia y el rango se conserva', () => {
    const planned = [{ weight: 115, reps: 4, repsMax: 6 }];
    const best = [{ weight: 120, reps: 6, done: true }];
    const result = prefillFromBest(planned, best);
    expect(result[0]).toEqual({ weight: 120, reps: 4, repsMax: 6, done: false });
  });

  it('reps por encima del rango del plan se conservan (mejor 8 > plan 6)', () => {
    const planned = [{ weight: 115, reps: 4, repsMax: 6 }];
    const best = [{ weight: 115, reps: 8, done: true }];
    const result = prefillFromBest(planned, best);
    expect(result[0]).toEqual({ weight: 115, reps: 8, done: false });
  });
});

describe('bestSetsForExercise / bestOverallForExercise', () => {
  const mejor = makeSession({
    id: 'buena',
    date: '2026-09-21',
    entries: [
      {
        exerciseName: 'Press banca',
        sets: [
          { weight: 120, reps: 6, done: true },
          { weight: 120, reps: 6, done: true },
        ],
      },
    ],
  });
  const mala = makeSession({
    id: 'mala',
    date: '2026-09-28', // más reciente y peor: no debe mandar
    entries: [
      {
        exerciseName: 'Press banca',
        sets: [
          { weight: 110, reps: 4, done: true },
          { weight: 110, reps: 5, done: true },
        ],
      },
    ],
  });

  it('de cada serie guarda el mejor resultado, no el de la última sesión', () => {
    const best = bestSetsForExercise([mala, mejor], { name: 'Press banca' });
    expect(best.map((b) => b && [b.weight, b.reps])).toEqual([
      [120, 6],
      [120, 6],
    ]);
  });

  it('ignora las sesiones en curso', () => {
    const enCurso = makeSession({
      id: 'wip',
      status: 'in-progress',
      date: '2026-10-01',
      entries: [{ exerciseName: 'Press banca', sets: [{ weight: 200, reps: 20, done: true }] }],
    });
    const best = bestSetsForExercise([enCurso, mejor], { name: 'Press banca' });
    expect(best[0]?.weight).toBe(120);
  });

  it('los índices sin serie devuelven undefined', () => {
    const best = bestSetsForExercise([mejor], { name: 'Press banca' });
    expect(best).toHaveLength(2);
    expect(best[2]).toBeUndefined();
  });

  it('el mejor global es el más exigente (6 × 120 kg de 6-6-5-5)', () => {
    const sesion = makeSession({
      entries: [
        {
          exerciseName: 'Press banca',
          sets: [
            { weight: 120, reps: 6, done: true },
            { weight: 120, reps: 6, done: true },
            { weight: 120, reps: 5, done: true },
            { weight: 120, reps: 5, done: true },
          ],
        },
      ],
    });
    const best = bestOverallForExercise([sesion], { name: 'Press banca' });
    expect([best?.weight, best?.reps]).toEqual([120, 6]);
  });

  it('en cronometradas manda la mayor duración', () => {
    const larga = makeSession({
      entries: [
        { exerciseName: 'Plancha', sets: [{ weight: 0, reps: 0, durationSec: 45, done: true }] },
      ],
    });
    const corta = makeSession({
      id: 'otra',
      date: '2026-09-21',
      entries: [
        { exerciseName: 'Plancha', sets: [{ weight: 0, reps: 0, durationSec: 30, done: true }] },
      ],
    });
    expect(bestOverallForExercise([corta, larga], { name: 'Plancha' })?.durationSec).toBe(45);
  });
});

describe('mergeWithBest — tabla de reglas (plan | mejor → sugerencia)', () => {
  const rango = { weight: 115, reps: 4, repsMax: 6 };
  const fijo = { weight: 35, reps: 8 };

  it('plan 4-6 a 115 con mejor 5 a 115 → 4-6 a 115 (dentro del rango)', () => {
    expect(mergeWithBest(rango, { weight: 115, reps: 5, done: true })).toEqual({
      weight: 115,
      reps: 4,
      repsMax: 6,
    });
  });

  it('plan 4-6 a 115 con mejor 3 a 115 → 4-6 a 115 (se mantiene el plan)', () => {
    expect(mergeWithBest(rango, { weight: 115, reps: 3, done: true })).toEqual({
      weight: 115,
      reps: 4,
      repsMax: 6,
    });
  });

  it('plan 4-6 a 115 con mejor 4 a 120 → 4-6 a 120 (sube el peso)', () => {
    expect(mergeWithBest(rango, { weight: 120, reps: 4, done: true })).toEqual({
      weight: 120,
      reps: 4,
      repsMax: 6,
    });
  });

  it('plan 4-6 a 115 con mejor 5 a 120 → 4-6 a 120 (sube el peso)', () => {
    expect(mergeWithBest(rango, { weight: 120, reps: 5, done: true })).toEqual({
      weight: 120,
      reps: 4,
      repsMax: 6,
    });
  });

  it('plan 8 a 35 con mejor 9 a 35 → 9 a 35 (nuevas reps)', () => {
    expect(mergeWithBest(fijo, { weight: 35, reps: 9, done: true })).toEqual({
      weight: 35,
      reps: 9,
    });
  });

  it('plan 8 a 35 con mejor 8 a 40 → 8 a 40 (nuevo peso)', () => {
    expect(mergeWithBest(fijo, { weight: 40, reps: 8, done: true })).toEqual({
      weight: 40,
      reps: 8,
    });
  });

  it('plan 8 a 35 con mejor 7 a 35 → 8 a 35 (se mantienen las reps planeadas)', () => {
    expect(mergeWithBest(fijo, { weight: 35, reps: 7, done: true })).toEqual({
      weight: 35,
      reps: 8,
    });
  });

  it('plan 8 a 35 con mejor 8 a 30 → 8 a 35 (se mantiene el peso planeado)', () => {
    expect(mergeWithBest(fijo, { weight: 30, reps: 8, done: true })).toEqual({
      weight: 35,
      reps: 8,
    });
  });

  it('plan 30 s con mejor 45 s → 45 s (manda la mayor duración)', () => {
    expect(
      mergeWithBest(
        { reps: 0, durationSec: 30 },
        { weight: 0, reps: 0, durationSec: 45, done: true },
      ),
    ).toEqual({ reps: 0, durationSec: 45 });
  });

  it('plan 30 s con mejor 25 s → 30 s (se mantiene la duración planeada)', () => {
    expect(
      mergeWithBest(
        { reps: 0, durationSec: 30 },
        { weight: 0, reps: 0, durationSec: 25, done: true },
      ),
    ).toEqual({ reps: 0, durationSec: 30 });
  });

  it('sin resultados el plan no cambia (nunca se actualiza solo)', () => {
    expect(mergeWithBest({ weight: 115, reps: 4, repsMax: 6, note: 'x' }, undefined)).toEqual({
      weight: 115,
      reps: 4,
      repsMax: 6,
      note: 'x',
    });
  });

  it('mejor por fuera del rango → el plan pasa a fijo 8', () => {
    expect(
      mergeWithBest(rango, { weight: 115, reps: 8, done: true }),
    ).toEqual({ weight: 115, reps: 8 });
  });
});

describe('buildSessionFromDay', () => {
  it('crea una sesión sugerida con lo mejor del historial', () => {
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
      { weight: 62, reps: 8, done: false }, // peso del mejor resultado
      { weight: 67, reps: 6, done: false }, // reps plan 6 > mejor 5
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

  it('un rango en el plan (4-6) llega a la sesión como sugerencia de rango', () => {
    const routine = makeRoutine();
    routine.days[0].exercises[0].plannedSets = [
      { weight: 60, reps: 4, repsMax: 6 },
      { weight: 65, reps: 8 },
    ];

    const session = buildSessionFromDay(routine, routine.days[0], []);

    expect(session.entries[0].sets).toEqual([
      { weight: 60, reps: 4, repsMax: 6, done: false }, // el rango se muestra
      { weight: 65, reps: 8, done: false },
    ]);
  });

  it('la subida manual del plan manda y su rango se conserva', () => {
    const routine = makeRoutine();
    routine.days[0].exercises[0].plannedSets = [
      { weight: 130, reps: 4, repsMax: 6 },
      { weight: 130, reps: 4, repsMax: 6 },
    ];
    const previous = makeSession({
      id: 'prev',
      date: '2026-09-28',
      entries: [
        {
          exerciseName: 'Press banca',
          sets: [
            { weight: 120, reps: 6, done: true },
            { weight: 120, reps: 6, done: true },
          ],
        },
      ],
    });

    const session = buildSessionFromDay(routine, routine.days[0], [previous]);

    expect(session.entries[0].sets).toEqual([
      { weight: 130, reps: 4, repsMax: 6, done: false }, // peso nuevo, rango intacto
      { weight: 130, reps: 4, repsMax: 6, done: false },
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
