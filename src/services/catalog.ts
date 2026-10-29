import type { Exercise, Routine, Session } from '../models';
import { newId } from '../models';
import { normalizeName } from './previousSession';

export function findExercise(
  exercises: Exercise[],
  name: string,
): Exercise | undefined {
  const target = normalizeName(name);
  return exercises.find((e) => normalizeName(e.name) === target);
}

export function pickOrCreateExercise(
  exercises: Exercise[],
  name: string,
  muscleGroup?: string,
): Exercise {
  const trimmed = name.trim();
  const existing = findExercise(exercises, trimmed);
  if (existing) return existing;
  return {
    id: newId(),
    name: trimmed,
    muscleGroup: muscleGroup?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
}

export function isExerciseShared(
  exerciseId: string,
  routines: Routine[],
  sessions: Session[],
  exceptEntryId: string,
): boolean {
  const inRoutines = routines.some((routine) =>
    routine.days.some((day) =>
      day.exercises.some((entry) => entry.exerciseId === exerciseId && entry.id !== exceptEntryId),
    ),
  );
  return (
    inRoutines ||
    sessions.some((session) => session.entries.some((entry) => entry.exerciseId === exerciseId))
  );
}

export function mergeDuplicateExercises(exercises: Exercise[]): {
  exercises: Exercise[];
  changed: boolean;
} {
  const byName = new Map<string, Exercise>();
  const merged: Exercise[] = [];
  let changed = false;

  for (const exercise of exercises) {
    const key = normalizeName(exercise.name);
    const survivor = byName.get(key);
    if (!survivor) {
      byName.set(key, exercise);
      merged.push(exercise);
      continue;
    }
    changed = true;
    if (!survivor.muscleGroup && exercise.muscleGroup) {
      const upgraded = { ...survivor, muscleGroup: exercise.muscleGroup };
      merged[merged.indexOf(survivor)] = upgraded;
      byName.set(key, upgraded);
    }
  }

  return { exercises: merged, changed };
}

export function seedCatalogFromRoutines(
  exercises: Exercise[],
  routines: Routine[],
): Exercise[] {
  if (exercises.length > 0) return exercises;

  const seen = new Set<string>();
  const seeded: Exercise[] = [];
  for (const routine of routines) {
    if (!Array.isArray(routine.days)) continue;
    for (const day of routine.days) {
      if (!Array.isArray(day?.exercises)) continue;
      for (const ex of day.exercises) {
        const name = ex.name.trim();
        if (!name) continue;
        const key = normalizeName(name);
        if (seen.has(key)) continue;
        seen.add(key);
        seeded.push(
          pickOrCreateExercise(seeded, name, ex.muscleGroup),
        );
      }
    }
  }
  return seeded;
}

export function repairExerciseLinks(
  routines: Routine[],
  sessions: Session[],
  catalog: Exercise[],
): {
  routines: Routine[];
  sessions: Session[];
  changedRoutines: boolean;
  changedSessionIds: string[];
} {
  const catalogIds = new Set(catalog.map((e) => e.id));
  const resolve = (exerciseId: string | undefined, name: string): string | undefined => {
    if (exerciseId && catalogIds.has(exerciseId)) return exerciseId;
    return findExercise(catalog, name)?.id;
  };

  let changedRoutines = false;
  const nextRoutines = routines.map((routine) => ({
    ...routine,
    days: (Array.isArray(routine.days) ? routine.days : []).map((day) => ({
      ...day,
      exercises: (Array.isArray(day?.exercises) ? day.exercises : []).map((entry) => {
        const nextId = resolve(entry.exerciseId, entry.name);
        if (nextId === entry.exerciseId) return entry;
        changedRoutines = true;
        return nextId === undefined
          ? { ...entry, exerciseId: undefined }
          : { ...entry, exerciseId: nextId };
      }),
    })),
  }));

  const changedSessionIds: string[] = [];
  const nextSessions = sessions.map((session) => {
    let changed = false;
    const entries = (Array.isArray(session.entries) ? session.entries : []).map((entry) => {
      const nextId = resolve(entry.exerciseId, entry.exerciseName);
      if (nextId === entry.exerciseId) return entry;
      changed = true;
      return nextId === undefined
        ? { ...entry, exerciseId: undefined }
        : { ...entry, exerciseId: nextId };
    });
    if (!changed) return session;
    changedSessionIds.push(session.id);
    return { ...session, entries };
  });

  return {
    routines: nextRoutines,
    sessions: nextSessions,
    changedRoutines,
    changedSessionIds,
  };
}

export function linkRoutinesToCatalog(
  routines: Routine[],
  catalog: Exercise[],
): { routines: Routine[]; changed: boolean } {
  if (catalog.length === 0) return { routines, changed: false };

  let changed = false;
  const out = routines.map((routine) => ({
    ...routine,
    // Datos antiguos o dañados: una rutina sin `days` no debe tumbar la carga de la app.
    days: (Array.isArray(routine.days) ? routine.days : []).map((day) => ({
      ...day,
      exercises: (Array.isArray(day?.exercises) ? day.exercises : []).map((ex) => {
        if (ex.exerciseId) return ex;
        const match = findExercise(catalog, ex.name);
        if (!match) return ex;
        changed = true;
        return { ...ex, exerciseId: match.id };
      }),
    })),
  }));
  return { routines: out, changed };
}
