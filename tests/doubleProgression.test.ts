import { describe, expect, it } from 'vitest';
import type { Exercise, PerformedSet, PlannedSet, Routine, Session } from '../src/models';
import { DEFAULT_SETTINGS } from '../src/models';
import { lastRecentSets, suggestExercise } from '../src/services/doubleProgression';
import type { LoadProfile } from '../src/services/load';
import { buildSessionFromDay } from '../src/services/session';

const done = (weight: number, reps: number): PerformedSet => ({ weight, reps, done: true });

const external: LoadProfile = { load: 'external', unilateral: false, increment: 2.5 };

const range = (weight: number | undefined): PlannedSet => ({ weight, reps: 8, repsMax: 12 });

const session = (id: string, date: string, sets: PerformedSet[]): Session => ({
  id,
  date,
  dayName: 'Push',
  status: 'completed',
  entries: [{ exerciseId: 'press', exerciseName: 'Press banca', sets }],
});

describe('progresión doble', () => {
  it('todas las series en el tope del rango: todas suben y vuelven al mínimo', () => {
    const last = [done(60, 12), done(60, 12), done(60, 12)];
    const out = suggestExercise([range(60), range(60), range(60)], last.map((s) => [s]), last, external);

    expect(out.progressed).toBe(true);
    expect(out.sets).toEqual([
      { weight: 62.5, reps: 8, repsMax: 12 },
      { weight: 62.5, reps: 8, repsMax: 12 },
      { weight: 62.5, reps: 8, repsMax: 12 },
    ]);
  });

  it('si una serie no llega al tope, ninguna sube', () => {
    const last = [done(60, 12), done(60, 12), done(60, 10)];
    const out = suggestExercise([range(60), range(60), range(60)], last.map((s) => [s]), last, external);

    expect(out.progressed).toBe(false);
    expect(out.sets.map((s) => s.weight)).toEqual([60, 60, 60]);
  });

  it('las series de reps fijas no cambian aunque suba el rango', () => {
    const last = [done(60, 12), done(40, 10)];
    const out = suggestExercise(
      [range(60), { weight: 40, reps: 10 }],
      last.map((s) => [s]),
      last,
      external,
    );

    expect(out.sets).toEqual([{ weight: 62.5, reps: 8, repsMax: 12 }, { weight: 40, reps: 10 }]);
  });

  it('usa el incremento del ejercicio y, en asistidos, quita asistencia', () => {
    const last = [done(30, 12)];
    const assisted: LoadProfile = { load: 'assisted', unilateral: false, increment: 5 };

    expect(suggestExercise([range(30)], [last], last, assisted).sets[0].weight).toBe(25);
    expect(
      suggestExercise([range(60)], [[done(60, 12)]], [done(60, 12)], { ...external, increment: 1 })
        .sets[0].weight,
    ).toBe(61);
  });

  it('un lastrado sin lastre empieza a añadirlo; un normal sin peso planeado no sube', () => {
    const bodyweight: LoadProfile = { load: 'bodyweight', unilateral: false, increment: 2.5 };
    const last = [done(0, 12)];

    expect(suggestExercise([range(undefined)], [last], last, bodyweight).sets[0].weight).toBe(2.5);
    expect(suggestExercise([range(undefined)], [last], last, external).progressed).toBe(false);
  });

  it('un asistido ya sin ayuda no puede bajar más: no resetea las reps', () => {
    const assisted: LoadProfile = { load: 'assisted', unilateral: false, increment: 5 };
    const out = suggestExercise([range(0)], [[done(0, 12)]], [done(0, 12)], assisted);

    expect(out.progressed).toBe(false);
  });

  it('la última sesión solo cuenta si está dentro de las 8 semanas', () => {
    const old = session('old', '2026-07-01', [done(60, 12)]);
    const ref = { exerciseId: 'press', name: 'Press banca' };

    expect(lastRecentSets([old], ref, '2026-10-01')).toBeUndefined();
    expect(lastRecentSets([old], ref, '2026-07-15')).toEqual([done(60, 12)]);
  });

  it('una sesión nueva ya llega con el peso subido', () => {
    const routine: Routine = {
      id: 'r1',
      name: 'Torso',
      archived: false,
      createdAt: '',
      updatedAt: '',
      days: [
        {
          id: 'd1',
          name: 'Push',
          exercises: [
            { id: 'e1', exerciseId: 'press', name: 'Press banca', plannedSets: [range(60), range(60)] },
          ],
        },
      ],
    };
    const catalog: Exercise[] = [{ id: 'press', name: 'Press banca', createdAt: '', increment: 5 }];
    const previous = session('prev', '2026-09-28', [done(60, 12), done(60, 12)]);

    const next = buildSessionFromDay(
      routine,
      routine.days[0],
      [previous],
      catalog,
      '2026-10-01',
      DEFAULT_SETTINGS,
    );

    expect(next.entries[0].sets).toEqual([
      { weight: 65, reps: 8, done: false },
      { weight: 65, reps: 8, done: false },
    ]);
  });
});
