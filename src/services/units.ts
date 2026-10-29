import type { Exercise, Routine, Session, Unit } from '../models';

export const KG_PER_LB = 0.45359237;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function convertWeight(value: number, from: Unit, to: Unit): number {
  if (from === to || !Number.isFinite(value) || value === 0) return value;
  const kg = from === 'kg' ? value : value * KG_PER_LB;
  return round1(to === 'kg' ? kg : kg / KG_PER_LB);
}

export function convertExercises(exercises: Exercise[], from: Unit, to: Unit): Exercise[] {
  if (from === to) return exercises;
  return exercises.map((exercise) =>
    exercise.increment === undefined
      ? exercise
      : { ...exercise, increment: convertWeight(exercise.increment, from, to) },
  );
}

export function convertRoutines(
  routines: Routine[],
  from: Unit,
  to: Unit,
): Routine[] {
  if (from === to) return routines;
  return routines.map((routine) => ({
    ...routine,
    days: routine.days.map((day) => ({
      ...day,
      exercises: day.exercises.map((exercise) => ({
        ...exercise,
        plannedSets: exercise.plannedSets.map((set) =>
          set.weight === undefined
            ? set
            : { ...set, weight: convertWeight(set.weight, from, to) },
        ),
      })),
    })),
  }));
}

export function convertSessions(
  sessions: Session[],
  from: Unit,
  to: Unit,
): Session[] {
  if (from === to) return sessions;
  return sessions.map((session) => ({
    ...session,
    entries: session.entries.map((entry) => ({
      ...entry,
      sets: entry.sets.map((set) => ({
        ...set,
        weight: convertWeight(set.weight, from, to),
      })),
    })),
  }));
}
