// Relleno inicial serie↔serie: la serie i de hoy toma lo programado en el
// plan; si el plan no tiene peso, el de la serie i de la sesión anterior.
// La duración (series cronometradas) sigue la misma regla anterior > plan.
// Las reps en sesión son SIEMPRE un número fijo (lo conseguido): el rango
// del plan (4-6) no se arrastra. Al subir de peso (nueva carga) se empieza
// por lo programado —el mínimo del rango, p. ej. 4—; si el peso sigue
// igual, se continúa por donde se quedó la última vez.

import type { PerformedSet, PlannedSet } from '../models';

export function prefillFromPrevious(
  planned: PlannedSet[],
  previousSets?: PerformedSet[],
): PerformedSet[] {
  return planned.map((p, i) => {
    const prev = previousSets?.[i];
    const durationSec = prev?.durationSec ?? p.durationSec;
    // Peso: manda lo programado (0 o ausente = sin programar → la última sesión).
    const weight = p.weight || prev?.weight || 0;
    // ¿Carga nueva respecto a la última sesión? (con 0 registrado no se cuenta)
    const increasing = prev !== undefined && prev.weight > 0 && weight > prev.weight;
    const reps = increasing ? p.reps : prev?.reps ?? p.reps;
    return {
      weight,
      reps,
      done: false,
      ...(durationSec !== undefined ? { durationSec } : {}),
    };
  });
}
