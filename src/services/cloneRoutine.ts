import type { Routine } from '../models';
import { deepClone, newId } from '../models';

export function cloneRoutine(routine: Routine, newName?: string): Routine {
  const copy: Routine = {
    ...deepClone(routine),
    id: newId(),
    name: newName ?? `Copia de ${routine.name}`,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceRoutineId: routine.id,
    days: routine.days.map((day) => ({
      ...deepClone(day),
      id: newId(),
      exercises: day.exercises.map((ex) => ({
        ...deepClone(ex),
        id: newId(),
      })),
    })),
  };
  return copy;
}
