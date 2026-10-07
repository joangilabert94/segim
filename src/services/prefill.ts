// Relleno inicial serie↔serie: la serie i de hoy toma lo programado en el
// plan y lo de la sesión anterior, prevaleciendo en cada campo el mayor de
// los dos: si la última sesión llegó a 120 kg o a más reps que el plan,
// la nueva sesión arranca en 120 kg y esas reps.
// La duración (series cronometradas) sigue la regla anterior > plan.
// Las reps en sesión son SIEMPRE un número fijo (lo conseguido): el rango
// del plan (4-6) no se arrastra. Si el plan está por encima de lo entrenado
// (carga nueva), se empieza por el mínimo del rango; si no, se continúa
// por donde se quedó.

import type { PerformedSet, PlannedSet } from '../models';

export function prefillFromPrevious(
  planned: PlannedSet[],
  previousSets?: PerformedSet[],
): PerformedSet[] {
  return planned.map((p, i) => {
    const prev = previousSets?.[i];
    const durationSec = prev?.durationSec ?? p.durationSec;
    // Peso: prevalece el mayor entre lo programado y lo entrenado.
    const weight = Math.max(p.weight || 0, prev?.weight || 0);
    // ¿Carga nueva? (el plan por encima de la última sesión, con peso registrado)
    const increasing = prev !== undefined && prev.weight > 0 && weight > prev.weight;
    // Reps: si la sesión anterior se pasó del plan, prevalecen sus reps;
    // si es carga nueva, se empieza por el mínimo del rango; si no, se continúa.
    const planCap = Math.max(p.reps, p.repsMax ?? p.reps);
    const beyondPlan = prev !== undefined && prev.reps > planCap;
    const reps = beyondPlan
      ? prev.reps
      : increasing
        ? p.reps
        : (prev?.reps ?? p.reps);
    return {
      weight,
      reps,
      done: false,
      ...(durationSec !== undefined ? { durationSec } : {}),
    };
  });
}
