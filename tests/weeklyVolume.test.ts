import { describe, expect, it } from 'vitest';
import type { Exercise, PerformedSet, Session, SessionEntry } from '../src/models';
import { addDays, weekStart, weeklySetsByGroup } from '../src/services/weeklyVolume';

const sets = (done: number, pending = 0): PerformedSet[] => [
  ...Array.from({ length: done }, () => ({ weight: 50, reps: 10, done: true })),
  ...Array.from({ length: pending }, () => ({ weight: 50, reps: 10, done: false })),
];

const session = (
  id: string,
  date: string,
  entries: SessionEntry[],
  status: Session['status'] = 'completed',
): Session => ({ id, date, dayName: 'Día', status, entries });

const catalog: Exercise[] = [
  { id: 'press', name: 'Press banca', createdAt: '', muscleGroup: 'Pecho' },
  { id: 'aperturas', name: 'Aperturas', createdAt: '', muscleGroup: ' pecho ' },
  { id: 'remo', name: 'Remo', createdAt: '', muscleGroup: 'Espalda' },
  { id: 'zancada', name: 'Zancada', createdAt: '', unilateral: true, muscleGroup: 'Piernas' },
  { id: 'plancha', name: 'Plancha', createdAt: '' },
];

describe('semanas', () => {
  it('la semana empieza en lunes', () => {
    expect(weekStart('2026-10-29')).toBe('2026-10-26');
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
    expect(weekStart('2026-11-01')).toBe('2026-10-26');
    expect(addDays('2026-10-26', -7)).toBe('2026-10-19');
  });
});

describe('series semanales por grupo muscular', () => {
  it('cuenta las series hechas por grupo y las compara con la semana anterior', () => {
    const sessions = [
      session('a', '2026-10-27', [
        { exerciseId: 'press', exerciseName: 'Press banca', sets: sets(3, 1) },
        { exerciseId: 'aperturas', exerciseName: 'Aperturas', sets: sets(2) },
        { exerciseId: 'zancada', exerciseName: 'Zancada', sets: sets(3) },
      ]),
      session('b', '2026-11-01', [{ exerciseId: 'remo', exerciseName: 'Remo', sets: sets(4) }]),
      session('c', '2026-10-21', [{ exerciseId: 'press', exerciseName: 'Press banca', sets: sets(4) }]),
      session('d', '2026-11-02', [{ exerciseId: 'remo', exerciseName: 'Remo', sets: sets(9) }]),
      session('e', '2026-10-28', [{ exerciseId: 'remo', exerciseName: 'Remo', sets: sets(9) }], 'in-progress'),
    ];

    expect(weeklySetsByGroup(sessions, catalog, '2026-10-26')).toEqual([
      { group: 'Pecho', sets: 5, previous: 4 },
      { group: 'Espalda', sets: 4, previous: 0 },
      { group: 'Piernas', sets: 3, previous: 0 },
    ]);
  });

  it('sin grupo va al final y los ejercicios sin id se buscan por nombre', () => {
    const sessions = [
      session('a', '2026-10-27', [
        { exerciseId: 'plancha', exerciseName: 'Plancha', sets: sets(5) },
        { exerciseName: 'Remo', sets: sets(1) },
      ]),
    ];

    expect(weeklySetsByGroup(sessions, catalog, '2026-10-26')).toEqual([
      { group: 'Espalda', sets: 1, previous: 0 },
      { group: 'Sin grupo', sets: 5, previous: 0 },
    ]);
  });
});
