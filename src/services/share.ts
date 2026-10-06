// Compartir rutinas entre dispositivos: exporta SOLO rutinas y los ejercicios
// del catálogo que necesitan. Sin sesiones, sin ajustes, sin historial.
// La copia completa de seguridad sigue en backup.ts.

import type { Exercise, Routine } from '../models';
import { findExercise } from './catalog';

export const ROUTINES_KIND = 'gymrutinas-routines';

export interface RoutinesFile {
  kind: typeof ROUTINES_KIND;
  version: 1;
  exportedAt: string;
  routines: Routine[];
  exercises: Exercise[]; // solo los referenciadas por esas rutinas
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const isRoutine = (v: unknown): v is Routine => {
  if (!isObject(v)) return false;
  return typeof v.id === 'string' && Array.isArray(v.days);
};

const isExercise = (v: unknown): v is Exercise => {
  if (!isObject(v)) return false;
  return typeof v.id === 'string' && typeof v.name === 'string';
};

/**
 * Ejercicios del catálogo que usan esas rutinas: los referenciados por id y
 * los de las entradas sin id, resueltos por nombre normalizado.
 */
export function referencedExercises(
  routines: Routine[],
  catalog: Exercise[],
): Exercise[] {
  const out = new Map<string, Exercise>();
  for (const routine of routines) {
    for (const day of routine.days) {
      for (const entry of day.exercises) {
        const byId = entry.exerciseId
          ? catalog.find((e) => e.id === entry.exerciseId)
          : undefined;
        const hit = byId ?? findExercise(catalog, entry.name);
        if (hit) out.set(hit.id, hit);
      }
    }
  }
  return [...out.values()];
}

/** Monta el fichero de intercambio con las rutinas y su catálogo. */
export function buildRoutinesFile(
  routines: Routine[],
  catalog: Exercise[],
  now: Date = new Date(),
): RoutinesFile {
  return {
    kind: ROUTINES_KIND,
    version: 1,
    exportedAt: now.toISOString(),
    routines,
    exercises: referencedExercises(routines, catalog),
  };
}

/** Descarga el fichero de rutinas como .json. */
export function downloadRoutinesFile(file: RoutinesFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gymrutinas-rutinas-${file.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Valida y parsea un fichero de rutinas. También acepta una copia completa
 * (backup.ts), de la que solo extrae rutinas y catálogo.
 * Lanza Error con mensaje en español.
 */
export function parseRoutinesFile(text: string): RoutinesFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El fichero no es un JSON válido.');
  }
  if (!isObject(data)) {
    throw new Error('El fichero no parece un archivo de rutinas de GymRutinas.');
  }

  const isRoutinesFile = data.kind === ROUTINES_KIND;
  const isFullBackup = data.app === 'gymrutinas';
  if (!isRoutinesFile && !isFullBackup) {
    throw new Error('El fichero no parece un archivo de rutinas de GymRutinas.');
  }
  if (!Array.isArray(data.routines)) {
    throw new Error('El fichero no contiene rutinas.');
  }

  return {
    kind: ROUTINES_KIND,
    version: 1,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : new Date().toISOString(),
    routines: data.routines.filter(isRoutine),
    exercises: Array.isArray(data.exercises) ? data.exercises.filter(isExercise) : [],
  };
}

export interface MergeResult {
  routines: Routine[];
  exercises: Exercise[];
  added: number; // rutinas nuevas
  skipped: number; // ya estaban (mismo id)
  exercisesAdded: number; // ejercicios nuevos en el catálogo
}

/**
 * Fusiona un fichero con los datos locales sin tocar nada existente:
 *  - rutina con id ya presente → se omite (reimportar es inocuo);
 *  - ejercicio: por id, si no por nombre normalizado (nunca duplica nombres),
 *    y si no existe se añade al catálogo;
 *  - las entradas sin vínculo se vinculan por nombre con el catálogo resultante.
 */
export function mergeRoutines(
  localRoutines: Routine[],
  localExercises: Exercise[],
  file: RoutinesFile,
): MergeResult {
  const exercises = [...localExercises];
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const idMap = new Map<string, string>(); // id exportado → id local
  let exercisesAdded = 0;

  for (const incoming of file.exercises) {
    const sameId = byId.get(incoming.id);
    if (sameId) {
      idMap.set(incoming.id, sameId.id);
      continue;
    }
    const sameName = findExercise(exercises, incoming.name);
    if (sameName) {
      idMap.set(incoming.id, sameName.id);
      continue;
    }
    exercises.push(incoming);
    byId.set(incoming.id, incoming);
    idMap.set(incoming.id, incoming.id);
    exercisesAdded++;
  }

  const existing = new Set(localRoutines.map((r) => r.id));
  const routines = [...localRoutines];
  let added = 0;
  let skipped = 0;

  for (const routine of file.routines) {
    if (existing.has(routine.id)) {
      skipped++;
      continue;
    }
    routines.push({
      ...routine,
      days: routine.days.map((day) => ({
        ...day,
        exercises: day.exercises.map((entry) => {
          if (entry.exerciseId) {
            const mapped = idMap.get(entry.exerciseId);
            return mapped && mapped !== entry.exerciseId
              ? { ...entry, exerciseId: mapped }
              : entry;
          }
          const match = findExercise(exercises, entry.name);
          return match ? { ...entry, exerciseId: match.id } : entry;
        }),
      })),
    });
    existing.add(routine.id);
    added++;
  }

  return { routines, exercises, added, skipped, exercisesAdded };
}
