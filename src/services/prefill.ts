import type { PerformedSet, PlannedSet } from '../models';
import { suggestFromHistory } from './bestResults';
import { EXTERNAL_LOAD, type LoadProfile } from './load';

export function toPerformedSets(suggested: PlannedSet[]): PerformedSet[] {
  return suggested.map((set) => ({
    weight: set.weight ?? 0,
    // Un rango del plan llega como su mínimo: la serie registra el número exacto conseguido.
    reps: set.reps,
    done: false,
    ...(set.durationSec !== undefined ? { durationSec: set.durationSec } : {}),
  }));
}

export function prefillFromHistory(
  planned: PlannedSet[],
  history: PerformedSet[][] = [],
  profile: LoadProfile = EXTERNAL_LOAD,
): PerformedSet[] {
  return toPerformedSets(planned.map((p, i) => suggestFromHistory(p, history[i], profile)));
}
