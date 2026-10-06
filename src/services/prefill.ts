// Relleno inicial serie↔serie: la serie i de hoy toma los valores
// de la serie i de la sesión anterior; si no existe, los del plan.
// La duración (series cronometradas) y el rango de reps siguen la misma regla.

import type { PerformedSet, PlannedSet } from '../models';

export function prefillFromPrevious(
  planned: PlannedSet[],
  previousSets?: PerformedSet[],
): PerformedSet[] {
  return planned.map((p, i) => {
    const prev = previousSets?.[i];
    const durationSec = prev?.durationSec ?? p.durationSec;
    const reps = prev?.reps ?? p.reps;
    const max = prev?.repsMax ?? p.repsMax;
    // Un rango con extremos repetidos (10-6) no aporta: se guarda como fijo.
    const repsMax = max !== undefined && max > reps ? max : undefined;
    return {
      weight: prev?.weight ?? p.weight ?? 0,
      reps,
      done: false,
      ...(repsMax !== undefined ? { repsMax } : {}),
      ...(durationSec !== undefined ? { durationSec } : {}),
    };
  });
}
