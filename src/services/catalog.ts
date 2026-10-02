// Catálogo de ejercicios: lógica pura de búsqueda y creación.
// La identidad es el id; el nombre solo es la etiqueta visible.

import type { Exercise, Routine } from '../models';
import { newId } from '../models';
import { normalizeName } from './previousSession';

/** Busca un ejercicio del catálogo por nombre normalizado. */
export function findExercise(
  exercises: Exercise[],
  name: string,
): Exercise | undefined {
  const target = normalizeName(name);
  return exercises.find((e) => normalizeName(e.name) === target);
}

/**
 * Devuelve el ejercicio existente o crea uno nuevo con ese nombre.
 * Si el nombre ya existe, devuelve el existente (nunca duplica).
 */
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

/**
 * Si el catálogo está vacío, lo siembra con los ejercicios de las rutinas
 * (para que el autocompletado y la comparación por id funcionen desde el
 * primer momento con datos antiguos).
 */
export function seedCatalogFromRoutines(
  exercises: Exercise[],
  routines: Routine[],
): Exercise[] {
  if (exercises.length > 0) return exercises;

  const seen = new Set<string>();
  const seeded: Exercise[] = [];
  for (const routine of routines) {
    for (const day of routine.days) {
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

/**
 * Vincula por id los ejercicios de las rutinas que todavía no lo tengan
 * (coincidencia por nombre normalizado contra el catálogo).
 */
export function linkRoutinesToCatalog(
  routines: Routine[],
  catalog: Exercise[],
): { routines: Routine[]; changed: boolean } {
  if (catalog.length === 0) return { routines, changed: false };

  let changed = false;
  const out = routines.map((routine) => ({
    ...routine,
    days: routine.days.map((day) => ({
      ...day,
      exercises: day.exercises.map((ex) => {
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
