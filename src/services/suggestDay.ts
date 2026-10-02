// Día sugerido de una rutina: el siguiente al último entrenado con ella.

import type { Routine, RoutineDay, Session } from '../models';

export function suggestDay(routine: Routine, sessions: Session[]): RoutineDay | undefined {
  if (routine.days.length === 0) return undefined;

  const done = sessions
    .filter((s) => s.routineId === routine.id && s.status === 'completed' && s.dayId)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (done.length === 0) return routine.days[0];

  const lastIndex = routine.days.findIndex((d) => d.id === done[0].dayId);
  const nextIndex = lastIndex < 0 ? 0 : (lastIndex + 1) % routine.days.length;
  return routine.days[nextIndex];
}
