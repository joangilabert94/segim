import type { PerformedSet, PlannedSet } from '../models';
import { suggestFromHistory } from './bestResults';

export function prefillFromHistory(
  planned: PlannedSet[],
  history: PerformedSet[][] = [],
): PerformedSet[] {
  return planned.map((p, i) => {
    const suggested = suggestFromHistory(p, history[i]);
    return {
      weight: suggested.weight ?? 0,
      // Un rango del plan llega como su mínimo: la serie registra el número exacto conseguido.
      reps: suggested.reps,
      done: false,
      ...(suggested.durationSec !== undefined ? { durationSec: suggested.durationSec } : {}),
    };
  });
}
