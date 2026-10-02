// Construcción de sesiones de entrenamiento.

import type { Exercise, Routine, RoutineDay, Session, SessionEntry } from '../models';
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
