// Relleno inicial serie↔serie: la sugerencia de la sesión nueva es la
// opción más exigente entre lo planeado en el plan y el MEJOR resultado
// histórico de esa serie (no el de la última sesión: si hubo dos malas,
// manda la mejor). Reglas (ver mergeWithBest):
//   - peso: el mayor de plan y mejor resultado (115 → 120 si entrenaste 120).
//   - reps fijas: el mayor (plan 8, mejor 9 → 9; plan 8, mejor 7 → 8).
//   - rango del plan (4-6): la columna Plan lo muestra; la serie de la sesión
//     sugiere su mínimo como número fijo. Si el mejor histórico está dentro
//     del rango, el peso puede subir, pero la serie realizada nunca guarda un
//     rango: se registra el número exacto que se consigue.
//   - duración: la mayor (plan 30 s, mejor 45 s → 45 s).
// Así el volumen y la progresión no cuentan reps que nadie ha hecho.

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
      ...(merged.durationSec !== undefined ? { durationSec: merged.durationSec } : {}),
    };
  });
}
