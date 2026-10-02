// Clonado profundo de rutinas con todos los ids nuevos.

import type { Routine } from '../models';
import { newId } from '../models';

export function cloneRoutine(routine: Routine, newName?: string): Routine {
  const copy: Routine = {
    ...structuredClone(routine),
    id: newId(),
    name: newName ?? `Copia de ${routine.name}`,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceRoutineId: routine.id,
    days: routine.days.map((day) => ({
      ...structuredClone(day),
      id: newId(),
      exercises: day.exercises.map((ex) => ({
        ...structuredClone(ex),
        id: newId(),
      })),
    })),
  };
  return copy;
}
