import type { Exercise, Routine, RoutineDay, Session, SessionEntry, Settings } from '../models';
import { DEFAULT_SETTINGS, newId } from '../models';
import { loadProfile } from './load';
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
  settings: Pick<Settings, 'progressionIncrement' | 'bodyweight'> = DEFAULT_SETTINGS,
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
      sets: prefillFromHistory(
        ex.plannedSets,
        history,
        loadProfile(catalog.find((e) => e.id === exerciseId), settings),
      ),
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
