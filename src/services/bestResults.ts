// Mejores resultados por ejercicio y fusión con el plan.
// Regla de "más exigente": mayor peso y, a igual peso, más reps;
// en series cronometradas, la mayor duración. El plan nunca se actualiza
// solo: estos máximos son una sugerencia que se aplica con el botón
// "Actualizar plan" del editor.

import type { PerformedSet, PlannedSet, Session } from '../models';
import { findEntry, type ExerciseRef } from './previousSession';

/** ¿`a` es al menos tan exigente como `b`? */
function atLeastAsDemanding(a: PerformedSet, b: PerformedSet): boolean {
  const aTimed = a.durationSec !== undefined;
  const bTimed = b.durationSec !== undefined;
  if (aTimed !== bTimed) return aTimed; // una cronometrada manda sobre una por reps
  if (aTimed) return (a.durationSec ?? 0) >= (b.durationSec ?? 0);
  if (a.weight !== b.weight) return a.weight > b.weight;
  return a.reps >= b.reps;
}

/**
 * El mejor resultado de cada índice de serie de un ejercicio en todo el
 * historial (sesiones completadas). Índice i = serie i+1; si una serie no
 * existió en alguna sesión, no aporta.
 */
export function bestSetsForExercise(
  sessions: Session[],
  ref: ExerciseRef,
): (PerformedSet | undefined)[] {
  const lists: PerformedSet[][] = [];
  for (const session of sessions) {
    if (session.status !== 'completed') continue;
    const entry = findEntry(session, ref);
    if (entry && entry.sets.length > 0) lists.push(entry.sets);
  }
  let size = 0;
  for (const list of lists) size = Math.max(size, list.length);
  const bests: (PerformedSet | undefined)[] = [];
  for (let i = 0; i < size; i++) {
    let best: PerformedSet | undefined;
    for (const list of lists) {
      const candidate = list[i];
      if (candidate && (best === undefined || atLeastAsDemanding(candidate, best))) {
        best = candidate;
      }
    }
    bests.push(best);
  }
  return bests;
}

/**
 * Mejor resultado global de un ejercicio (todas sus series juntas):
 * la referencia que se muestra en la pestaña Ejercicios (p. ej. 6 × 120 kg
 * si hiciste 6-6-5-5 a 120 kg).
 */
export function bestOverallForExercise(
  sessions: Session[],
  ref: ExerciseRef,
): PerformedSet | undefined {
  let best: PerformedSet | undefined;
  for (const session of sessions) {
    if (session.status !== 'completed') continue;
    const entry = findEntry(session, ref);
    if (!entry) continue;
    for (const set of entry.sets) {
      if (best === undefined || atLeastAsDemanding(set, best)) best = set;
    }
  }
  return best;
}

/**
 * Combina lo planeado con el mejor resultado: la opción más exigente de cada
 * campo. El plan solo cambia aquí dentro cuando alguien lo pide (botón
 * "Actualizar plan"); la sesión usa esta misma fusión como sugerencia.
 */
export function mergeWithBest(planned: PlannedSet, best?: PerformedSet): PlannedSet {
  // Peso: el mayor entre lo planeado y lo conseguido (0 o ausente = sin dato).
  const weight = Math.max(planned.weight ?? 0, best?.weight ?? 0) > 0
    ? Math.max(planned.weight ?? 0, best?.weight ?? 0)
    : planned.weight;
  const note = planned.note;

  // Serie cronometrada: manda la mayor duración (y el peso mayor).
  if (planned.durationSec !== undefined) {
    const durationSec =
      best?.durationSec !== undefined
        ? Math.max(planned.durationSec, best.durationSec)
        : planned.durationSec;
    return { weight, reps: planned.reps, durationSec, ...(note !== undefined ? { note } : {}) };
  }

  // Sin datos aún, o el mejor es de otra naturaleza (cronometrada): manda el plan.
  if (best === undefined || best.durationSec !== undefined) {
    return {
      weight,
      reps: planned.reps,
      ...(planned.repsMax !== undefined ? { repsMax: planned.repsMax } : {}),
      ...(note !== undefined ? { note } : {}),
    };
  }

  const isRange = planned.repsMax !== undefined && planned.repsMax > planned.reps;
  if (isRange) {
    if (best.reps > (planned.repsMax as number)) {
      // Mejor por fuera del rango: el plan pasa a número fijo (caso raro).
      return { weight, reps: best.reps, ...(note !== undefined ? { note } : {}) };
    }
    // El rango se conserva mientras el mejor esté dentro de él.
    return {
      weight,
      reps: planned.reps,
      repsMax: planned.repsMax,
      ...(note !== undefined ? { note } : {}),
    };
  }

  // Reps fijas: el mayor entre plan y mejor resultado.
  return { weight, reps: Math.max(planned.reps, best.reps), ...(note !== undefined ? { note } : {}) };
}
