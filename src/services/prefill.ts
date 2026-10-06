// Relleno inicial serie↔serie: la serie i de hoy toma los valores
// de la serie i de la sesión anterior; si no existe, los del plan.
// La duración (series cronometradas) sigue la misma regla.

import type { PerformedSet, PlannedSet } from '../models';

export function prefillFromPrevious(
  planned: PlannedSet[],
  previousSets?: PerformedSet[],
): PerformedSet[] {
  return planned.map((p, i) => {
    const prev = previousSets?.[i];
    const durationSec = prev?.durationSec ?? p.durationSec;
    return {
      weight: prev?.weight ?? p.weight ?? 0,
      reps: prev?.reps ?? p.reps,
      done: false,
      ...(durationSec !== undefined ? { durationSec } : {}),
    };
  });
}
