import type { PerformedSet, PlannedSet } from '../models';
import { suggestFromHistory } from './bestResults';
import { EXTERNAL_LOAD, type LoadProfile } from './load';

export function prefillFromHistory(
  planned: PlannedSet[],
  history: PerformedSet[][] = [],
  profile: LoadProfile = EXTERNAL_LOAD,
): PerformedSet[] {
  return planned.map((p, i) => {
    const suggested = suggestFromHistory(p, history[i], profile);
    return {
      weight: suggested.weight ?? 0,
      // Un rango del plan llega como su mínimo: la serie registra el número exacto conseguido.
      reps: suggested.reps,
      done: false,
      ...(suggested.durationSec !== undefined ? { durationSec: suggested.durationSec } : {}),
    };
  });
}
