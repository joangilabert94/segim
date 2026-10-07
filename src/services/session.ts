// Construcción de sesiones de entrenamiento.

import type {
  Exercise,
  PerformedSet,
  PlannedSet,
  Routine,
  RoutineDay,
  Session,
  SessionEntry,
} from '../models';
import { newId } from '../models';
import { findEntry, findPreviousSession } from './previousSession';
import { findExercise } from './catalog';
import { prefillFromPrevious } from './prefill';
import { todayISO } from './format';

/**
 * Crea una sesión en curso a partir de un día de rutina.
 * Cada ejercicio se vincula al catálogo por id (si es posible) y se
 * pre-rellena serie a serie con la última sesión que contuvo ese ejercicio.
 */
export function buildSessionFromDay(
  routine: Routine,
  day: RoutineDay,
  sessions: Session[],
  catalog: Exercise[] = [],
): Session {
  const entries: SessionEntry[] = day.exercises.map((ex) => {
    // Vínculo estable: el id del ejercicio de la rutina o el del catálogo por nombre
    const exerciseId =
      ex.exerciseId ?? findExercise(catalog, ex.name)?.id;
    const previous = findPreviousSession(sessions, {
      exerciseId,
      name: ex.name,
    });
    const previousEntry = previous ? findEntry(previous, { exerciseId, name: ex.name }) : undefined;
    return {
      exerciseId,
      exerciseName: ex.name,
      sets: prefillFromPrevious(ex.plannedSets, previousEntry?.sets),
    };
  });

  return {
    id: newId(),
    date: todayISO(),
    routineId: routine.id,
    dayId: day.id,
    dayName: day.name,
    status: 'in-progress',
    startedAt: new Date().toISOString(),
    entries,
  };
}

/** Sesión sin rutina asociada: el usuario añade ejercicios sobre la marcha. */
export function buildFreeSession(): Session {
  return {
    id: newId(),
    date: todayISO(),
    dayName: 'Sesión libre',
    status: 'in-progress',
    startedAt: new Date().toISOString(),
    entries: [],
  };
}

// ---------------------------------------------------------------------------
// Peso programado: el plan sigue a lo realmente entrenado
// ---------------------------------------------------------------------------

/**
 * Pasa a `plannedSets` el peso realmente levantado en `performedSets`,
 * pero solo si sube: si la última sesión llegó a 120 kg, el plan programa
 * 120 kg; si entrenaste menos, el programado se queda como está. El plan
 * nunca baja solo: para trabajar menos, entrena antes ese peso en la sesión
 * y después baja el plan (entonces ya no se re-sincroniza hacia arriba).
 * Peso 0 o ausente = sin registrar: no programa nada. El rango de reps y el
 * resto de la serie no se tocan. Devuelve cuántas series cambian.
 */
function applyWeightSync(
  plannedSets: PlannedSet[],
  performedSets: PerformedSet[] | undefined,
): number {
  if (!performedSets) return 0;
  let changed = 0;
  plannedSets.forEach((planned, i) => {
    const weight = performedSets[i]?.weight;
    if (weight === undefined || weight <= 0) return;
    if (planned.weight === undefined || weight > planned.weight) {
      planned.weight = weight;
      changed += 1;
    }
  });
  return changed;
}

/**
 * Actualiza el peso programado de un día con el de la última sesión que
 * entrenó cada ejercicio. Devuelve cuántas series cambian.
 */
export function syncPlannedWeightsFromPrevious(
  day: RoutineDay,
  sessions: Session[],
  catalog: Exercise[] = [],
): number {
  let changed = 0;
  for (const ex of day.exercises) {
    // Vínculo estable: el id de la rutina o el del catálogo por nombre
    const exerciseId = ex.exerciseId ?? findExercise(catalog, ex.name)?.id;
    const previous = findPreviousSession(sessions, { exerciseId, name: ex.name });
    const entry = previous ? findEntry(previous, { exerciseId, name: ex.name }) : undefined;
    changed += applyWeightSync(ex.plannedSets, entry?.sets);
  }
  return changed;
}

/**
 * Actualiza el peso programado de un día con el de una sesión que acaba de
 * completarse (para que el plan refleje el nuevo peso nada más finalizar).
 * Devuelve cuántas series cambian.
 */
export function syncPlannedWeightsFromSession(
  day: RoutineDay,
  session: Session,
  catalog: Exercise[] = [],
): number {
  let changed = 0;
  for (const ex of day.exercises) {
    const exerciseId = ex.exerciseId ?? findExercise(catalog, ex.name)?.id;
    const entry = findEntry(session, { exerciseId, name: ex.name });
    changed += applyWeightSync(ex.plannedSets, entry?.sets);
  }
  return changed;
}
