// Construcción de sesiones de entrenamiento.

import type { Exercise, Routine, RoutineDay, Session, SessionEntry } from '../models';
import { newId } from '../models';
import { findExercise } from './catalog';
import { recentSince, setHistoryForExercise } from './bestResults';
import { prefillFromHistory } from './prefill';
import { todayISO } from './format';

/**
 * Crea una sesión en curso a partir de un día de rutina.
 * Cada ejercicio se vincula al catálogo por id (si es posible) y cada serie
 * se sugiere con el mejor resultado reciente que alcance el plan, o el plan.
 * El plan no se modifica: solo se lee.
 */
export function buildSessionFromDay(
  routine: Routine,
  day: RoutineDay,
  sessions: Session[],
  catalog: Exercise[] = [],
  date: string = todayISO(),
): Session {
  const entries: SessionEntry[] = day.exercises.map((ex) => {
    // Vínculo estable: el id de la rutina o el del catálogo por nombre
    const exerciseId =
      ex.exerciseId ?? findExercise(catalog, ex.name)?.id;
    const history = setHistoryForExercise(
      sessions,
      { exerciseId, name: ex.name },
      { maxDate: date, sinceDate: recentSince(date) },
    );
    return {
      exerciseId,
      exerciseName: ex.name,
      sets: prefillFromHistory(ex.plannedSets, history),
    };
  });

  return {
    id: newId(),
    date,
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
