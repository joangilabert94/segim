import { describe, expect, it } from 'vitest';
import type { Exercise, PerformedSet, Session } from '../src/models';
import { DEFAULT_SETTINGS } from '../src/models';
import {
  compareLoad,
  effectiveLoad,
  fmtLoad,
  fmtLoadUnit,
  loadProfile,
  profileLookup,
  progressedWeight,
  type LoadProfile,
} from '../src/services/load';
import { bestOverallForExercise, suggestFromHistory } from '../src/services/bestResults';
import { volumeOf } from '../src/services/stats';
import { e1rmOf, progressSeries } from '../src/services/progression';
import { parseExercise, parseSettings } from '../src/services/validation';
import { convertExercises } from '../src/services/units';

const set = (weight: number, reps: number): PerformedSet => ({ weight, reps, done: true });

const profile = (over: Partial<LoadProfile>): LoadProfile => ({
  load: 'external',
  unilateral: false,
  increment: 2.5,
  ...over,
});

const session = (id: string, date: string, sets: PerformedSet[], exerciseId = 'ex'): Session => ({
  id,
  date,
  dayName: 'Día 1',
  status: 'completed',
  entries: [{ exerciseId, exerciseName: 'Dominadas', sets }],
});

describe('perfil de carga', () => {
  it('sale del catálogo y de los ajustes, con el incremento propio si lo hay', () => {
    const exercise: Exercise = {
      id: 'ex',
      name: 'Dominadas',
      createdAt: '2026-01-01',
      load: 'assisted',
      unilateral: true,
      increment: 5,
    };
    expect(loadProfile(exercise, { progressionIncrement: 2.5, bodyweight: 80 })).toEqual({
      load: 'assisted',
      unilateral: true,
      increment: 5,
      bodyweight: 80,
    });
    expect(profileLookup([exercise], DEFAULT_SETTINGS)('otro')).toEqual({
      load: 'external',
      unilateral: false,
      increment: 2.5,
    });
  });

  it('en asistidos, menos asistencia es más exigente', () => {
    expect(compareLoad(10, 20, { load: 'assisted' })).toBeGreaterThan(0);
    expect(compareLoad(10, 20, { load: 'external' })).toBeLessThan(0);
  });

  it('la carga efectiva suma el lastre o resta la ayuda al peso corporal', () => {
    expect(effectiveLoad(10, profile({ load: 'bodyweight', bodyweight: 75 }))).toBe(85);
    expect(effectiveLoad(20, profile({ load: 'assisted', bodyweight: 75 }))).toBe(55);
    expect(effectiveLoad(10, profile({ load: 'bodyweight' }))).toBeUndefined();
    expect(effectiveLoad(60, profile({}))).toBe(60);
  });

  it('la progresión resta asistencia sin bajar de 0', () => {
    expect(progressedWeight(60, profile({}))).toBe(62.5);
    expect(progressedWeight(10, profile({ load: 'assisted', increment: 5 }))).toBe(5);
    expect(progressedWeight(2, profile({ load: 'assisted', increment: 5 }))).toBe(0);
  });

  it('formatea PC, PC+lastre y PC−asistencia', () => {
    expect(fmtLoad(60, { load: 'external' })).toBe('60');
    expect(fmtLoad(0, { load: 'bodyweight' })).toBe('PC');
    expect(fmtLoad(10, { load: 'bodyweight' })).toBe('PC+10');
    expect(fmtLoad(20, { load: 'assisted' })).toBe('PC−20');
    expect(fmtLoadUnit(0, { load: 'bodyweight' }, 'kg')).toBe('PC');
    expect(fmtLoadUnit(12.5, { load: 'bodyweight' }, 'kg')).toBe('PC+12,5 kg');
  });
});

describe('mejores y sugerencias en asistidos', () => {
  const assisted = profile({ load: 'assisted' });

  it('el mejor resultado es el de menos asistencia', () => {
    const sessions = [session('a', '2026-10-01', [set(30, 8)]), session('b', '2026-10-08', [set(20, 8)])];
    expect(bestOverallForExercise(sessions, { exerciseId: 'ex', name: 'Dominadas' }, assisted)).toMatchObject({
      weight: 20,
    });
  });

  it('un resultado con más asistencia que el plan no lo alcanza', () => {
    expect(suggestFromHistory({ weight: 20, reps: 8 }, [set(30, 10)], assisted)).toMatchObject({
      weight: 20,
      reps: 8,
    });
    expect(suggestFromHistory({ weight: 20, reps: 8 }, [set(15, 8)], assisted)).toMatchObject({
      weight: 15,
      reps: 8,
    });
  });
});

describe('volumen y 1RM con tipos de carga', () => {
  it('unilateral cuenta doble y el peso corporal entra en lastrados y asistidos', () => {
    const s: Session = {
      id: 's',
      date: '2026-10-01',
      dayName: 'Día 1',
      status: 'completed',
      entries: [
        { exerciseId: 'zancada', exerciseName: 'Zancada', sets: [set(20, 10)] },
        { exerciseId: 'dominada', exerciseName: 'Dominadas', sets: [set(10, 5)] },
        { exerciseId: 'asistida', exerciseName: 'Fondos asistidos', sets: [set(30, 10)] },
      ],
    };
    const catalog: Exercise[] = [
      { id: 'zancada', name: 'Zancada', createdAt: '', unilateral: true },
      { id: 'dominada', name: 'Dominadas', createdAt: '', load: 'bodyweight' },
      { id: 'asistida', name: 'Fondos asistidos', createdAt: '', load: 'assisted' },
    ];

    expect(volumeOf(s, profileLookup(catalog, { ...DEFAULT_SETTINGS, bodyweight: 80 }))).toBe(
      20 * 10 * 2 + 90 * 5 + 50 * 10,
    );
    expect(volumeOf(s, profileLookup(catalog, DEFAULT_SETTINGS))).toBe(20 * 10 * 2);
  });

  it('el 1RM de un lastrado usa el peso corporal más el lastre', () => {
    expect(e1rmOf(set(10, 3), profile({ load: 'bodyweight', bodyweight: 80 }))).toBeCloseTo(99);
    expect(e1rmOf(set(10, 3), profile({ load: 'bodyweight' }))).toBeUndefined();
  });

  it('la gráfica de asistidos guarda la asistencia mínima de cada sesión', () => {
    const points = progressSeries(
      [session('a', '2026-10-01', [set(30, 8), set(25, 6)])],
      { exerciseId: 'ex', name: 'Dominadas' },
      profile({ load: 'assisted' }),
    );
    expect(points[0].weight).toBe(25);
  });
});

describe('copias y unidades', () => {
  it('valida los campos nuevos del catálogo y de los ajustes', () => {
    expect(
      parseExercise({ id: 'a', name: 'X', load: 'assisted', unilateral: true, increment: 5 }),
    ).toMatchObject({ load: 'assisted', unilateral: true, increment: 5 });
    expect(parseExercise({ id: 'a', name: 'X', load: 'raro', increment: -1 })).not.toHaveProperty(
      'load',
    );
    expect(parseSettings({ progressionIncrement: 5, bodyweight: 80 })).toMatchObject({
      progressionIncrement: 5,
      bodyweight: 80,
    });
    expect(parseSettings({}).progressionIncrement).toBe(2.5);
    expect(parseSettings({ bodyweight: 0 })).not.toHaveProperty('bodyweight');
  });

  it('cambiar de unidad convierte el incremento propio de cada ejercicio', () => {
    const [converted] = convertExercises(
      [{ id: 'a', name: 'X', createdAt: '', increment: 2.5 }],
      'kg',
      'lb',
    );
    expect(converted.increment).toBe(5.5);
  });
});
