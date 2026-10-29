import type { Exercise, Routine, RoutineDay, Session, SessionEntry } from '../models';
import { newId } from '../models';
import { findExercise } from './catalog';
import { recentSince, setHistoryForExercise } from './bestResults';
import { prefillFromHistory } from './prefill';
import { todayISO } from './format';

export function buildSessionFromDay(
  routine: Routine,
  day: RoutineDay,
  sessions: Session[],
  catalog: Exercise[] = [],
  date: string = todayISO(),
): Session {
  const entries: SessionEntry[] = day.exercises.map((ex) => {
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

export function buildFreeSession(): Session {
  return {
    id: newId(),
    date: todayISO(),
    dayName: 'Sesión libre',
    status: 'in-progress',
    entries: [],
  };
}
