import { describe, expect, it } from 'vitest';
import type { Routine, Session } from '../src/models';
import { convertRoutines, convertSessions, convertWeight } from '../src/services/units';

describe('convertWeight', () => {
  it('convierte kg a lb con un decimal', () => {
    expect(convertWeight(60, 'kg', 'lb')).toBe(132.3);
    expect(convertWeight(2.5, 'kg', 'lb')).toBe(5.5);
  });

  it('convierte lb a kg y vuelve al valor original', () => {
    expect(convertWeight(132.3, 'lb', 'kg')).toBe(60);
    expect(convertWeight(convertWeight(60, 'kg', 'lb'), 'lb', 'kg')).toBe(60);
  });

  it('no toca el cero ni la misma unidad', () => {
    expect(convertWeight(0, 'kg', 'lb')).toBe(0);
    expect(convertWeight(60, 'kg', 'kg')).toBe(60);
  });
});

const routine: Routine = {
  id: 'r',
  name: 'Rutina',
  archived: false,
  createdAt: '',
  updatedAt: '',
  days: [
    {
      id: 'd',
      name: 'Día',
      exercises: [
        {
          id: 'e',
          name: 'Press',
          plannedSets: [{ weight: 60, reps: 8 }, { reps: 10 }],
        },
      ],
    },
  ],
};

const session: Session = {
  id: 's',
  date: '2026-10-20',
  dayName: 'Día',
  status: 'completed',
  entries: [
    {
      exerciseName: 'Press',
      sets: [
        { weight: 60, reps: 8, done: true },
        { weight: 0, reps: 20, done: true },
      ],
    },
  ],
};

describe('convertRoutines / convertSessions', () => {
  it('convierte los pesos planeados y no muta el original', () => {
    const out = convertRoutines([routine], 'kg', 'lb');
    expect(out[0].days[0].exercises[0].plannedSets[0].weight).toBe(132.3);
    expect(out[0].days[0].exercises[0].plannedSets[1].weight).toBeUndefined();
    expect(routine.days[0].exercises[0].plannedSets[0].weight).toBe(60);
  });

  it('convierte los pesos realizados, incluidos los de la sesión en curso', () => {
    const out = convertSessions([session], 'kg', 'lb');
    expect(out[0].entries[0].sets[0].weight).toBe(132.3);
    expect(out[0].entries[0].sets[1].weight).toBe(0);
    expect(session.entries[0].sets[0].weight).toBe(60);
  });

  it('si la unidad no cambia devuelve los mismos arrays', () => {
    const routines = [routine];
    const sessions = [session];
    expect(convertRoutines(routines, 'kg', 'kg')).toBe(routines);
    expect(convertSessions(sessions, 'kg', 'kg')).toBe(sessions);
  });
});
