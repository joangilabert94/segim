import type { PerformedSet, PlannedSet, Session } from '../models';
import { parseISODate, todayISO } from './format';
import { compareLoad, EXTERNAL_LOAD, type LoadProfile } from './load';
import { findEntry, type ExerciseRef } from './previousSession';

// Tras un parón o una descarga, un récord antiguo no debe volver a sugerirse.
export const RECENT_BEST_DAYS = 56;

type LoadDirection = Pick<LoadProfile, 'load'>;

export function recentSince(date: string = todayISO()): string {
  const from = parseISODate(date);
  from.setDate(from.getDate() - RECENT_BEST_DAYS);
  return todayISO(from);
}

export function atLeastAsDemanding(
  a: PerformedSet,
  b: PerformedSet,
  profile: LoadDirection = EXTERNAL_LOAD,
): boolean {
  const aTimed = a.durationSec !== undefined;
  const bTimed = b.durationSec !== undefined;
  if (aTimed !== bTimed) return aTimed;
  if (aTimed) return (a.durationSec ?? 0) >= (b.durationSec ?? 0);
  if (a.weight !== b.weight) return compareLoad(a.weight, b.weight, profile) > 0;
  return a.reps >= b.reps;
}

export const mostDemanding = (
  sets: PerformedSet[],
  profile: LoadDirection = EXTERNAL_LOAD,
): PerformedSet | undefined =>
  sets.reduce<PerformedSet | undefined>(
    (best, set) => (best === undefined || atLeastAsDemanding(set, best, profile) ? set : best),
    undefined,
  );

// Todo o nada: mezclar el peso de un día con las reps de otro sugeriría algo nunca hecho.
export function reachesPlan(
  best: PerformedSet,
  planned: PlannedSet,
  profile: LoadDirection = EXTERNAL_LOAD,
): boolean {
  if (planned.weight !== undefined && compareLoad(best.weight, planned.weight, profile) < 0) {
    return false;
  }
  if (planned.durationSec !== undefined) {
    return best.durationSec !== undefined && best.durationSec >= planned.durationSec;
  }
  return best.durationSec === undefined && best.reps >= planned.reps;
}

export function setHistoryForExercise(
  sessions: Session[],
  ref: ExerciseRef,
  options: { maxDate?: string; sinceDate?: string } = {},
): PerformedSet[][] {
  const { maxDate, sinceDate } = options;
  const byIndex: PerformedSet[][] = [];
  for (const session of sessions) {
    if (session.status !== 'completed') continue;
    // Al reabrir una sesión antigua, las posteriores no cuentan.
    if (maxDate !== undefined && session.date > maxDate) continue;
    if (sinceDate !== undefined && session.date < sinceDate) continue;
    const entry = findEntry(session, ref);
    if (!entry) continue;
    entry.sets.forEach((set, i) => {
      byIndex[i] ??= [];
      // Una serie sin marcar es una sugerencia o algo a medias, no un resultado.
      if (set.done) byIndex[i].push(set);
    });
  }
  return Array.from(byIndex, (sets) => sets ?? []);
}

export function bestSetsForExercise(
  sessions: Session[],
  ref: ExerciseRef,
  options: { maxDate?: string; sinceDate?: string; profile?: LoadDirection } = {},
): (PerformedSet | undefined)[] {
  return setHistoryForExercise(sessions, ref, options).map((sets) =>
    mostDemanding(sets, options.profile),
  );
}

export function bestOverallForExercise(
  sessions: Session[],
  ref: ExerciseRef,
  profile: LoadDirection = EXTERNAL_LOAD,
): PerformedSet | undefined {
  let best: PerformedSet | undefined;
  for (const session of sessions) {
    if (session.status !== 'completed') continue;
    const entry = findEntry(session, ref);
    if (!entry) continue;
    for (const set of entry.sets) {
      if (!set.done) continue;
      if (best === undefined || atLeastAsDemanding(set, best, profile)) best = set;
    }
  }
  return best;
}

export function mergeWithBest(
  planned: PlannedSet,
  best?: PerformedSet,
  profile: LoadDirection = EXTERNAL_LOAD,
): PlannedSet {
  const note = planned.note !== undefined ? { note: planned.note } : {};
  if (best === undefined || !reachesPlan(best, planned, profile)) {
    return {
      weight: planned.weight,
      reps: planned.reps,
      ...(planned.repsMax !== undefined ? { repsMax: planned.repsMax } : {}),
      ...(planned.durationSec !== undefined ? { durationSec: planned.durationSec } : {}),
      ...note,
    };
  }

  // Peso 0 en el resultado y sin peso en el plan: sigue siendo "sin carga".
  const weight = best.weight === 0 && planned.weight === undefined ? undefined : best.weight;
  if (planned.durationSec !== undefined) {
    return { weight, reps: planned.reps, durationSec: best.durationSec, ...note };
  }
  if (planned.repsMax !== undefined && planned.repsMax > planned.reps) {
    return { weight, reps: planned.reps, repsMax: planned.repsMax, ...note };
  }
  return { weight, reps: best.reps, ...note };
}

export function suggestFromHistory(
  planned: PlannedSet,
  history: PerformedSet[] = [],
  profile: LoadDirection = EXTERNAL_LOAD,
): PlannedSet {
  const reaching = history.filter((set) => reachesPlan(set, planned, profile));
  return mergeWithBest(planned, mostDemanding(reaching, profile), profile);
}
