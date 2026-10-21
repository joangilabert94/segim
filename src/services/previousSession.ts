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

/**
 * Entrada de la sesión correspondiente a un ejercicio. Si el mismo ejercicio
 * aparece varias veces en la sesión (dos bloques del mismo movimiento), se
 * devuelve una entrada combinada con todas sus series: así los récords y la
 * progresión no ignoran los bloques a partir del segundo.
 */
export function findEntry(
  session: Session,
  ref: string | ExerciseRef,
): SessionEntry | undefined {
  const target = toRef(ref);
  const matches = session.entries.filter((e) => matchesExercise(refOfEntry(e), target));
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];
  return {
    exerciseId: matches[0].exerciseId,
    exerciseName: matches[0].exerciseName,
    sets: matches.flatMap((e) => e.sets),
  };
}

/**
 * Última sesión COMPLETADA con el ejercicio y con al menos una serie hecha.
 * `excludeId` descarta la propia sesión; `beforeDate` exige fecha estrictamente
 * anterior y `maxDate` fecha igual o anterior (útil al reabrir una sesión: su
 * "anterior" nunca debe ser una sesión posterior del historial).
 * `sessions` debe estar ordenada por fecha descendente (lo está en el estado).
 */
export function findPreviousSession(
  sessions: Session[],
  ref: string | ExerciseRef,
  options: { beforeDate?: string; maxDate?: string; excludeId?: string } = {},
): Session | undefined {
  const target = toRef(ref);
  const { beforeDate, maxDate, excludeId } = options;
  const candidates = sessions
    .filter(
      (s) =>
        s.status === 'completed' &&
        s.id !== excludeId &&
        (beforeDate === undefined || s.date < beforeDate) &&
        (maxDate === undefined || s.date <= maxDate),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return candidates.find((s) => {
    const entry = findEntry(s, target);
    return entry !== undefined && entry.sets.some((set) => set.done);
  });
}
