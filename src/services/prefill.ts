// Relleno inicial serie↔serie de una sesión nueva: el mejor resultado
// reciente de esa serie si alcanza el plan en peso y reps a la vez; si no,
// el plan (ver suggestFromHistory). Un rango del plan (4-6) llega como su
// mínimo: la serie realizada registra el número exacto que se consigue.

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
      reps: suggested.reps,
      done: false,
      ...(suggested.durationSec !== undefined ? { durationSec: suggested.durationSec } : {}),
    };
  });
}
