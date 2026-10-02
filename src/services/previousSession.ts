// Comparación entre sesiones: identidad por exerciseId estable;
// si falta el id (datos antiguos), fallback al nombre normalizado.

import type { Session, SessionEntry } from '../models';

/** Referencia a un ejercicio: nombre y, si existe, su id del catálogo. */
export interface ExerciseRef {
  exerciseId?: string;
  name: string;
}

/** "Press Banca " → "press banca" (minúsculas, sin acentos, espacios simples). */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** ¿Dos referencias apuntan al mismo ejercicio? (id primero, si no nombre). */
export function matchesExercise(a: ExerciseRef, b: ExerciseRef): boolean {
  if (a.exerciseId && b.exerciseId) return a.exerciseId === b.exerciseId;
  return normalizeName(a.name) === normalizeName(b.name);
}

/** Referencia de una entrada de sesión. */
export function refOfEntry(entry: SessionEntry): ExerciseRef {
  return { exerciseId: entry.exerciseId, name: entry.exerciseName };
}

const toRef = (ref: string | ExerciseRef): ExerciseRef =>
  typeof ref === 'string' ? { name: ref } : ref;

/** Entrada de la sesión correspondiente a un ejercicio. */
export function findEntry(
  session: Session,
  ref: string | ExerciseRef,
): SessionEntry | undefined {
  const target = toRef(ref);
  return session.entries.find((e) => matchesExercise(refOfEntry(e), target));
}

/**
 * Última sesión COMPLETADA (distinta de `excludeId`, y anterior a `beforeDate`
 * si se indica) que contenga el ejercicio dado.
 * `sessions` debe estar ordenadas por fecha descendente (lo está en el estado).
 */
export function findPreviousSession(
  sessions: Session[],
  ref: string | ExerciseRef,
  options: { beforeDate?: string; excludeId?: string } = {},
): Session | undefined {
  const target = toRef(ref);
  const { beforeDate, excludeId } = options;
  const candidates = sessions
    .filter(
      (s) =>
        s.status === 'completed' &&
        s.id !== excludeId &&
        (beforeDate === undefined || s.date < beforeDate),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return candidates.find((s) =>
    s.entries.some((e) => e.sets.length > 0 && matchesExercise(refOfEntry(e), target)),
  );
}
