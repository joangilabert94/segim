import type { PerformedSet, PlannedSet } from '../models';
import { reachesPlan, suggestFromHistory } from './bestResults';
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

/**
 * Relleno al empezar la sesión: cada serie arranca con lo que se hizo la semana anterior.
 * La subida de la progresión doble no se aplica sola, se ofrece como sugerencia.
 */
export function prefillForSession(
  planned: PlannedSet[],
  history: PerformedSet[][],
  lastSets: PerformedSet[] | undefined,
  profile: LoadProfile = EXTERNAL_LOAD,
): PerformedSet[] {
  return toPerformedSets(
    planned.map((set, i) => {
      const last = lastSets?.[i];
      const reached = last !== undefined && reachesPlan(last, set, profile);
      // Por debajo del plan (o sin serie equivalente) manda la sugerencia del historial.
      if (!last?.done || !reached) return suggestFromHistory(set, history[i], profile);
      return {
        weight: last.weight,
        reps: last.reps,
        ...(last.durationSec !== undefined ? { durationSec: last.durationSec } : {}),
      };
    }),
  );
}
