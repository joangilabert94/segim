import type { PerformedSet, PlannedSet, Session } from '../models';
import { recentSince, suggestFromHistory } from './bestResults';
import { compareLoad, progressedWeight, type LoadProfile } from './load';
import { findEntry, findPreviousSession, type ExerciseRef } from './previousSession';

const isRange = (set: PlannedSet) =>
  set.durationSec === undefined && set.repsMax !== undefined && set.repsMax > set.reps;

/** Series de la última sesión reciente con el ejercicio, la que decide si se sube. */
export function lastRecentSets(
  sessions: Session[],
  ref: ExerciseRef,
  date: string,
  excludeId?: string,
): PerformedSet[] | undefined {
  const previous = findPreviousSession(sessions, ref, { maxDate: date, excludeId });
  if (!previous || previous.date < recentSince(date)) return undefined;
  return findEntry(previous, ref)?.sets;
}

/**
 * Sugerencia de todas las series de un ejercicio. Progresión doble: si en la
 * última sesión todas las series con rango llegaron al tope con al menos el
 * peso sugerido, todas suben el incremento y vuelven al mínimo del rango.
 */
export function suggestExercise(
  planned: PlannedSet[],
  history: PerformedSet[][],
  lastSets: PerformedSet[] | undefined,
  profile: LoadProfile,
): { sets: PlannedSet[]; progressed: boolean } {
  const base = planned.map((set, i) => suggestFromHistory(set, history[i], profile));
  const ranged = planned.flatMap((set, i) => (isRange(set) ? [i] : []));
  if (ranged.length === 0 || !lastSets) return { sets: base, progressed: false };

  const allAtTop = ranged.every((i) => {
    const last = lastSets[i];
    const target = base[i].weight;
    return (
      last !== undefined &&
      last.done &&
      last.durationSec === undefined &&
      last.reps >= (planned[i].repsMax as number) &&
      (target === undefined || compareLoad(last.weight, target, profile) >= 0)
    );
  });
  // Sin peso planeado en un ejercicio normal no hay de dónde partir para subir.
  const canLoad = profile.load !== 'external' || ranged.every((i) => base[i].weight !== undefined);
  if (!allAtTop || !canLoad) return { sets: base, progressed: false };

  let progressed = false;
  const sets = base.map((set, i) => {
    if (!ranged.includes(i)) return set;
    const weight = progressedWeight(set.weight ?? 0, profile);
    if (weight === (set.weight ?? 0)) return set;
    progressed = true;
    return { ...set, weight, reps: planned[i].reps, repsMax: planned[i].repsMax };
  });
  return { sets, progressed };
}
