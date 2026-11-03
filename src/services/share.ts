import type { Exercise, Routine, Session } from '../models';
import { BACKUP_APP_ID } from './backup';
import { findExercise } from './catalog';
import { parseExercise, parseRoutine, parseSession } from './validation';

// Estable a propósito, no el nombre visible de la app.
export const ROUTINES_KIND = 'gymrutinas-routines';

export interface RoutinesFile {
  kind: typeof ROUTINES_KIND;
  version: 1;
  exportedAt: string;
  routines: Routine[];
  exercises: Exercise[];
  // Opcional: solo cuando se exportan también las sesiones de esas rutinas.
  sessions?: Session[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const validRoutines = (items: unknown[]): Routine[] =>
  items.flatMap((item, i) => {
    try {
      return [parseRoutine(item, `La rutina ${i + 1}`)];
    } catch {
      return [];
    }
  });

const validExercises = (items: unknown[]): Exercise[] =>
  items.flatMap((item, i) => {
    try {
      return [parseExercise(item, `El ejercicio ${i + 1}`)];
    } catch {
      return [];
    }
  });

const validSessions = (items: unknown[]): Session[] =>
  items.flatMap((item, i) => {
    try {
      return [parseSession(item, `La sesión ${i + 1}`)];
    } catch {
      return [];
    }
  });

/** Sesiones realizadas (no las que están en curso) que pertenecen a esas rutinas. */
export function sessionsOfRoutines(
  routines: Routine[],
  sessions: Session[],
): Session[] {
  const ids = new Set(routines.map((r) => r.id));
  return sessions.filter(
    (s) => s.status === 'completed' && s.routineId !== undefined && ids.has(s.routineId),
  );
}

export function referencedExercises(
  routines: Routine[],
  catalog: Exercise[],
  sessions: Session[] = [],
): Exercise[] {
  const out = new Map<string, Exercise>();
  const add = (exerciseId: string | undefined, name: string) => {
    const byId = exerciseId ? catalog.find((e) => e.id === exerciseId) : undefined;
    const hit = byId ?? findExercise(catalog, name);
    if (hit) out.set(hit.id, hit);
  };
  for (const routine of routines) {
    for (const day of routine.days) {
      for (const entry of day.exercises) add(entry.exerciseId, entry.name);
    }
  }
  for (const session of sessions) {
    for (const entry of session.entries) add(entry.exerciseId, entry.exerciseName);
  }
  return [...out.values()];
}

export function buildRoutinesFile(
  routines: Routine[],
  catalog: Exercise[],
  now: Date = new Date(),
  sessions: Session[] = [],
): RoutinesFile {
  return {
    kind: ROUTINES_KIND,
    version: 1,
    exportedAt: now.toISOString(),
    routines,
    exercises: referencedExercises(routines, catalog, sessions),
    ...(sessions.length > 0 ? { sessions } : {}),
  };
}

export function downloadRoutinesFile(file: RoutinesFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `segim-rutinas-${file.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseRoutinesFile(text: string): RoutinesFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El fichero no es un JSON válido.');
  }
  if (!isObject(data)) {
    throw new Error('El fichero no parece un archivo de rutinas de Segim.');
  }

  const isRoutinesFile = data.kind === ROUTINES_KIND;
  const isFullBackup = data.app === BACKUP_APP_ID;
  if (!isRoutinesFile && !isFullBackup) {
    throw new Error('El fichero no parece un archivo de rutinas de Segim.');
  }
  if (!Array.isArray(data.routines)) {
    throw new Error('El fichero no contiene rutinas.');
  }

  const routines = validRoutines(data.routines);
  if (routines.length === 0) {
    throw new Error('El fichero no contiene ninguna rutina válida.');
  }

  // Las sesiones solo se leen del fichero de rutinas: una copia completa se restaura en Ajustes.
  const sessions = isRoutinesFile && Array.isArray(data.sessions)
    ? validSessions(data.sessions)
    : [];

  return {
    kind: ROUTINES_KIND,
    version: 1,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : new Date().toISOString(),
    routines,
    exercises: Array.isArray(data.exercises) ? validExercises(data.exercises) : [],
    ...(sessions.length > 0 ? { sessions } : {}),
  };
}

export interface MergeResult {
  routines: Routine[];
  exercises: Exercise[];
  sessions: Session[];
  added: number;
  skipped: number;
  exercisesAdded: number;
  sessionsAdded: number;
}

export function mergeRoutines(
  localRoutines: Routine[],
  localExercises: Exercise[],
  file: RoutinesFile,
  localSessions: Session[] = [],
): MergeResult {
  const exercises = [...localExercises];
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const idMap = new Map<string, string>();
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

  // Reimportar no duplica el historial: se descarta la sesión cuyo id ya existe.
  const sessionIds = new Set(localSessions.map((s) => s.id));
  const sessions = [...localSessions];
  let sessionsAdded = 0;
  for (const session of file.sessions ?? []) {
    if (sessionIds.has(session.id)) continue;
    sessions.push({
      ...session,
      entries: session.entries.map((entry) => {
        if (!entry.exerciseId) return entry;
        const mapped = idMap.get(entry.exerciseId);
        return mapped && mapped !== entry.exerciseId
          ? { ...entry, exerciseId: mapped }
          : entry;
      }),
    });
    sessionIds.add(session.id);
    sessionsAdded++;
  }

  return { routines, exercises, sessions, added, skipped, exercisesAdded, sessionsAdded };
}
