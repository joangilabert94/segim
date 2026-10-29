// Capa de persistencia local sobre IndexedDB (a través de idb-keyval).
// Claves: "routines" (array), "session:<id>" (una por sesión), "settings" (objeto).
// Guardar sesión a sesión permite la persistencia incremental del entrenamiento en curso.

import { del, delMany, get, keys, set, setMany } from 'idb-keyval';
import type { Exercise, Routine, Session, Settings } from '../models';
import { DEFAULT_SETTINGS } from '../models';

const K_ROUTINES = 'routines';
const K_EXERCISES = 'exercises';
const K_SETTINGS = 'settings';
const K_SESSION_PREFIX = 'session:';
/** Metadatos de Google Drive (ver db/driveStore.ts): NO son datos del usuario. */
export const K_DRIVE_META = 'drive:meta';
const DRIVE_PREFIX = 'drive:';

const sessionKey = (id: string) => `${K_SESSION_PREFIX}${id}`;
const isDriveKey = (key: IDBValidKey) => typeof key === 'string' && key.startsWith(DRIVE_PREFIX);

export async function loadRoutines(): Promise<Routine[]> {
  return (await get<Routine[]>(K_ROUTINES)) ?? [];
}

export async function saveRoutines(routines: Routine[]): Promise<void> {
  await set(K_ROUTINES, routines);
}

export async function loadExercises(): Promise<Exercise[]> {
  return (await get<Exercise[]>(K_EXERCISES)) ?? [];
}

export async function saveExercises(exercises: Exercise[]): Promise<void> {
  await set(K_EXERCISES, exercises);
}

export async function loadSessions(): Promise<Session[]> {
  const all = await keys();
  const ids = all
    .filter((k): k is string => typeof k === 'string' && k.startsWith(K_SESSION_PREFIX))
    .map((k) => k.slice(K_SESSION_PREFIX.length));
  const sessions = await Promise.all(ids.map((id) => get<Session>(sessionKey(id))));
  return sessions.filter((s): s is Session => !!s && typeof s.date === 'string');
}

export async function saveSession(session: Session): Promise<void> {
  await set(sessionKey(session.id), session);
}

export async function removeSession(id: string): Promise<void> {
  await del(sessionKey(id));
}

export async function loadSettings(): Promise<Settings> {
  const stored = await get<Settings>(K_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await set(K_SETTINGS, settings);
}

/**
 * Borra todos los datos de la app.
 *
 * La conexión con Google Drive se conserva a propósito: si se perdiera la
 * referencia al fichero, la siguiente copia podría duplicarlo en Drive o,
 * peor, sobrescribir una copia buena. El usuario siempre puede desconectarla
 * explícitamente desde Ajustes.
 */
export async function clearAll(): Promise<void> {
  const all = await keys();
  await delMany(all.filter((k) => !isDriveKey(k)));
}

/** Sustituye todos los datos de la app (importar una copia), conservando los de Drive. */
export async function replaceAllData(data: {
  routines: Routine[];
  exercises: Exercise[];
  sessions: Session[];
  settings: Settings;
}): Promise<void> {
  const entries: [IDBValidKey, unknown][] = [
    [K_ROUTINES, data.routines],
    [K_EXERCISES, data.exercises],
    [K_SETTINGS, data.settings],
    ...data.sessions.map((s): [IDBValidKey, unknown] => [sessionKey(s.id), s]),
  ];
  const keep = new Set(entries.map(([key]) => key));
  const stale = (await keys()).filter((k) => !keep.has(k) && !isDriveKey(k));
  // Primero se escribe y luego se borra: si se corta a medias sobran datos, no faltan.
  await setMany(entries);
  await delMany(stale);
}
