import { describe, expect, it } from 'vitest';
import type { PerformedSet, Session } from '../src/models';
import { EXTERNAL_LOAD, type LoadProfile } from '../src/services/load';
import { describeRecord, sessionRecords } from '../src/services/records';

const done = (weight: number, reps: number): PerformedSet => ({ weight, reps, done: true });

const session = (
  id: string,
  date: string,
  sets: PerformedSet[],
  status: Session['status'] = 'completed',
): Session => ({
  id,
  date,
  dayName: 'Push',
  status,
  entries: [{ exerciseId: 'press', exerciseName: 'Press banca', sets }],
});

const external = () => EXTERNAL_LOAD;

describe('récords al finalizar', () => {
  it('la primera vez que se hace un ejercicio no hay récords', () => {
    const today = session('hoy', '2026-10-29', [done(100, 5)]);
    expect(sessionRecords(today, [today], external)).toEqual([]);
  });

  it('peso, 1RM y volumen nuevos', () => {
    const before = session('antes', '2026-10-20', [done(95, 5), done(95, 5)]);
    const today = session('hoy', '2026-10-29', [done(100, 5), done(100, 5)]);

    const kinds = sessionRecords(today, [today, before], external).map((r) => [r.kind, r.value, r.previous]);

    expect(kinds).toEqual([
      ['weight', 100, 95],
      ['e1rm', 100 * (1 + 5 / 30), 95 * (1 + 5 / 30)],
      ['volume', 1000, 950],
    ]);
  });

  it('más reps con un peso ya levantado (o más), pero no con uno nuevo', () => {
    const before = session('antes', '2026-10-20', [done(100, 5), done(90, 8)]);
    const today = session('hoy', '2026-10-29', [done(100, 6), done(80, 9)]);

    const reps = sessionRecords(today, [before, today], external).find((r) => r.kind === 'reps');

    expect(reps).toMatchObject({ value: 6, previous: 5, weight: 100 });
  });

  it('igualar no es récord, y las series sin marcar no cuentan', () => {
    const before = session('antes', '2026-10-20', [done(100, 5)]);
    const today = session('hoy', '2026-10-29', [done(100, 5), { weight: 120, reps: 5, done: false }]);

    expect(sessionRecords(today, [before, today], external)).toEqual([]);
  });

  it('las sesiones posteriores o en curso no cuentan como historial', () => {
    const later = session('despues', '2026-11-05', [done(120, 5)]);
    const open = session('abierta', '2026-10-25', [done(120, 5)], 'in-progress');
    const before = session('antes', '2026-10-20', [done(95, 5)]);
    const today = session('hoy', '2026-10-29', [done(100, 5)]);

    expect(sessionRecords(today, [later, open, before, today], external)[0]).toMatchObject({
      kind: 'weight',
      previous: 95,
    });
  });

  it('en asistidos el récord de peso es tener menos asistencia', () => {
    const assisted: LoadProfile = { load: 'assisted', unilateral: false, increment: 2.5 };
    const before = session('antes', '2026-10-20', [done(30, 8)]);
    const today = session('hoy', '2026-10-29', [done(25, 8)]);

    const [record] = sessionRecords(today, [before, today], () => assisted);

    expect(record).toMatchObject({ kind: 'weight', value: 25, previous: 30 });
    expect(describeRecord(record, assisted, 'kg')).toEqual({
      label: 'Menos asistencia',
      value: 'PC−25 kg',
      previous: 'PC−30 kg',
    });
  });

  it('sin peso corporal, un lastrado no tiene récords de 1RM ni de volumen', () => {
    const bodyweight: LoadProfile = { load: 'bodyweight', unilateral: false, increment: 2.5 };
    const before = session('antes', '2026-10-20', [done(5, 8)]);
    const today = session('hoy', '2026-10-29', [done(10, 8)]);

    expect(sessionRecords(today, [before, today], () => bodyweight).map((r) => r.kind)).toEqual([
      'weight',
    ]);
  });
});
