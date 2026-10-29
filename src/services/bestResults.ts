import type { PerformedSet, PlannedSet, Session } from '../models';
import { parseISODate, todayISO } from './format';
import { findEntry, type ExerciseRef } from './previousSession';

// Tras un parón o una descarga, un récord antiguo no debe volver a sugerirse.
export const RECENT_BEST_DAYS = 56;

export function recentSince(date: string = todayISO()): string {
  const from = parseISODate(date);
  from.setDate(from.getDate() - RECENT_BEST_DAYS);
  return todayISO(from);
}

function atLeastAsDemanding(a: PerformedSet, b: PerformedSet): boolean {
  const aTimed = a.durationSec !== undefined;
  const bTimed = b.durationSec !== undefined;
  if (aTimed !== bTimed) return aTimed;
  if (aTimed) return (a.durationSec ?? 0) >= (b.durationSec ?? 0);
  if (a.weight !== b.weight) return a.weight > b.weight;
  return a.reps >= b.reps;
}

const mostDemanding = (sets: PerformedSet[]): PerformedSet | undefined =>
  sets.reduce<PerformedSet | undefined>(
    (best, set) => (best === undefined || atLeastAsDemanding(set, best) ? set : best),
    undefined,
  );

// Todo o nada: mezclar el peso de un día con las reps de otro sugeriría algo nunca hecho.
function reachesPlan(best: PerformedSet, planned: PlannedSet): boolean {
  if (best.weight < (planned.weight ?? 0)) return false;
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
  options: { maxDate?: string; sinceDate?: string } = {},
): (PerformedSet | undefined)[] {
  return setHistoryForExercise(sessions, ref, options).map(mostDemanding);
}

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
      if (!set.done) continue;
      if (best === undefined || atLeastAsDemanding(set, best)) best = set;
    }
  }
  return best;
}

export function mergeWithBest(planned: PlannedSet, best?: PerformedSet): PlannedSet {
  const note = planned.note !== undefined ? { note: planned.note } : {};
  if (best === undefined || !reachesPlan(best, planned)) {
    return {
      weight: planned.weight,
      reps: planned.reps,
      ...(planned.repsMax !== undefined ? { repsMax: planned.repsMax } : {}),
      ...(planned.durationSec !== undefined ? { durationSec: planned.durationSec } : {}),
      ...note,
    };
  }

  // Peso 0 en el resultado y sin peso en el plan: sigue siendo "sin carga".
  const weight = best.weight > 0 ? best.weight : planned.weight;
  if (planned.durationSec !== undefined) {
    return { weight, reps: planned.reps, durationSec: best.durationSec, ...note };
  }
  const isRange = planned.repsMax !== undefined && planned.repsMax > planned.reps;
  if (isRange && best.reps <= (planned.repsMax as number)) {
    return { weight, reps: planned.reps, repsMax: planned.repsMax, ...note };
  }
  return { weight, reps: best.reps, ...note };
}

export function suggestFromHistory(planned: PlannedSet, history: PerformedSet[] = []): PlannedSet {
  return mergeWithBest(planned, mostDemanding(history.filter((set) => reachesPlan(set, planned))));
}
