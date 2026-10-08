// Construcción de sesiones de entrenamiento.

import type { Exercise, Routine, RoutineDay, Session, SessionEntry } from '../models';
import { newId } from '../models';
import { findExercise } from './catalog';
import { bestSetsForExercise } from './bestResults';
import { prefillFromBest } from './prefill';
import { todayISO } from './format';

/**
 * Crea una sesión en curso a partir de un día de rutina.
 * Cada ejercicio se vincula al catálogo por id (si es posible) y cada serie
 * se sugiere con la opción más exigente entre el plan y el MEJOR resultado
 * histórico de esa serie (nunca el de la última sesión si hubo peores).
 * El plan no se modifica: solo se lee.
 */
export function buildSessionFromDay(
  routine: Routine,
  day: RoutineDay,
  sessions: Session[],
  catalog: Exercise[] = [],
): Session {
  const entries: SessionEntry[] = day.exercises.map((ex) => {
    // Vínculo estable: el id de la rutina o el del catálogo por nombre
    const exerciseId =
      ex.exerciseId ?? findExercise(catalog, ex.name)?.id;
    const best = bestSetsForExercise(sessions, { exerciseId, name: ex.name });
    return {
      exerciseId,
      exerciseName: ex.name,
      sets: prefillFromBest(ex.plannedSets, best),
    };
  });

  return {
    id: newId(),
    date: todayISO(),
    routineId: routine.id,
    dayId: day.id,
    dayName: day.name,
    status: 'in-progress',
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
    entries: [],
  };
}
