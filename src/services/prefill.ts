// Relleno inicial serie↔serie: la sugerencia de la sesión nueva es la
// opción más exigente entre lo planeado en el plan y el MEJOR resultado
// histórico de esa serie (no el de la última sesión: si hubo dos malas,
// manda la mejor). Reglas (ver mergeWithBest):
//   - peso: el mayor de plan y mejor resultado (115 → 120 si entrenaste 120).
//   - reps fijas: el mayor (plan 8, mejor 9 → 9; plan 8, mejor 7 → 8).
//   - rango del plan (4-6): se conserva como sugerencia mientras el mejor
//     esté dentro; si el mejor lo supera (8), la sugerencia pasa a fijo 8.
//   - duración: la mayor (plan 30 s, mejor 45 s → 45 s).
// El campo de la sesión muestra el rango pero solo admite teclear un número
// exacto: en cuanto se edita, se guarda como fijo.

import type { PerformedSet, PlannedSet } from '../models';
import { mergeWithBest } from './bestResults';

export function prefillFromBest(
  planned: PlannedSet[],
  bestSets?: (PerformedSet | undefined)[],
): PerformedSet[] {
  return planned.map((p, i) => {
    const merged = mergeWithBest(p, bestSets?.[i]);
    return {
      weight: merged.weight ?? 0,
      reps: merged.reps,
      done: false,
      ...(merged.repsMax !== undefined ? { repsMax: merged.repsMax } : {}),
      ...(merged.durationSec !== undefined ? { durationSec: merged.durationSec } : {}),
    };
  });
}
