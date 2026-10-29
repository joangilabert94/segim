import type { Exercise, Routine, RoutineDay, Session, SessionEntry, Settings } from '../models';
import { DEFAULT_SETTINGS, newId } from '../models';
import { loadProfile } from './load';
import { findExercise } from './catalog';
import { recentSince, setHistoryForExercise } from './bestResults';
import { toPerformedSets } from './prefill';
import { lastRecentSets, suggestExercise } from './doubleProgression';
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
    const ref = { exerciseId, name: ex.name };
    const history = setHistoryForExercise(sessions, ref, {
      maxDate: date,
      sinceDate: recentSince(date),
    });
    const suggestion = suggestExercise(
      ex.plannedSets,
      history,
      lastRecentSets(sessions, ref, date),
      loadProfile(catalog.find((e) => e.id === exerciseId), settings),
    );
    return {
      exerciseId,
      exerciseName: ex.name,
      sets: toPerformedSets(suggestion.sets),
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
