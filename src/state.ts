// Estado global en memoria + persistencia en IndexedDB.
// Patrón mínimo: estado único, suscriptores y acciones que mutan y guardan.

import { useEffect, useState } from 'preact/hooks';
import type { Exercise, Routine, RoutineDay, Session, Settings, Unit } from './models';
import { DEFAULT_SETTINGS, deepClone, newId } from './models';
import * as db from './db/idb';
import { buildFreeSession, buildSessionFromDay } from './services/session';
import {
  mergeDuplicateExercises,
  pickOrCreateExercise,
  seedCatalogFromRoutines,
  linkRoutinesToCatalog,
  repairExerciseLinks,
} from './services/catalog';
import { normalizeName } from './services/previousSession';
import { convertRoutines, convertSessions } from './services/units';
import { applyTheme } from './theme';
import { pushNotice } from './services/notices';
import { buildRoutinesFile, downloadRoutinesFile, mergeRoutines, parseRoutinesFile } from './services/share';
import { buildBackup } from './services/backup';
import {
  type AutoBackupReason,
  cancelPendingAutoBackup,
  requestAutoBackup,
} from './services/drive/autoBackup';

export interface AppState {
  routines: Routine[];
  exercises: Exercise[]; // catálogo con id estable
  sessions: Session[]; // ordenadas por fecha descendente
  settings: Settings;
  loaded: boolean;
  /** Aviso visible si IndexedDB no se pudo leer (datos dañados o bloqueados). */
  loadError?: string;
}

let state: AppState = {
  routines: [],
  exercises: [],
  sessions: [],
  settings: DEFAULT_SETTINGS,
  loaded: false,
};

const listeners = new Set<() => void>();

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Re-renderiza a los suscriptores sin tocar los datos (tema, en la práctica). */
export function notifyListeners(): void {
  listeners.forEach((fn) => fn());
}

export function getState(): AppState {
  return state;
}

function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  // Cualquier cambio de ajustes puede cambiar el tema (unificado aquí para
  // no olvidar ninguna vía: cargar, editar, importar copia o borrar todo).
  if (patch.settings) applyTheme(patch.settings.theme);
  listeners.forEach((fn) => fn());
}

/** Hook: se suscribe a los cambios del estado. */
export function useStore(): AppState {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((t) => t + 1)), []);
  return state;
}

export function sortSessions(sessions: Session[]): Session[] {
  // Solo importa la fecha de realización: la sesión no guarda duración.
  return [...sessions].sort((a, b) => b.date.localeCompare(a.date));
}

const logError = (what: string, err: unknown) => {
  console.error(`No se pudo ${what}`, err);
  pushNotice(
    `No se pudo ${what} en este dispositivo. Si se repite, exporta una copia desde Ajustes.`,
    'error',
  );
};

// ---------------------------------------------------------------------------
// Copia automática en Google Drive
// ---------------------------------------------------------------------------

/**
 * Avisa de que hay datos nuevos. **No sube todavía**: encola la subida con el
 * retardo del motivo (ver services/drive/autoBackup), para que una ráfaga de
 * ediciones acabe en una sola copia en vez de en veinte.
 */
function touchBackup(reason: AutoBackupReason): void {
  requestAutoBackup({
    reason,
    enabled: state.settings.autoBackup === true,
    // Los datos se leen al subir, no ahora: la copia lleva lo último.
    build: () => buildBackup(state),
    // Las ediciones solo refrescan la copia viva; las fechadas se reservan a
    // hitos (cerrar sesión o subir a mano), o la rotación de 10 se las comería.
    dated: reason === 'session-complete',
  });
}

/** Carga todo el estado desde IndexedDB. */
export async function loadState(): Promise<void> {
  try {
    const [rawRoutines, exercises, sessions, settings] = await Promise.all([
      db.loadRoutines(),
      db.loadExercises(),
      db.loadSessions(),
      db.loadSettings(),
    ]);
    // Datos antiguos sin catálogo: lo sembramos desde las rutinas y
    // vinculamos los ejercicios existentes por id.
    const seeded = seedCatalogFromRoutines(exercises, rawRoutines);
    // Une entradas duplicadas por nombre antes de reparar vínculos: así las
    // rutinas y sesiones que apuntaban a cualquiera de ellas convergen en una.
    const deduped = mergeDuplicateExercises(seeded);
    const catalog = deduped.exercises;
    const linked = linkRoutinesToCatalog(rawRoutines, catalog);
    // Repara ids huérfanos (ejercicios borrados o fusionados) y enlaza por
    // nombre las sesiones antiguas: evita que el historial quede desconectado.
    const repaired = repairExerciseLinks(linked.routines, sessions, catalog);
    if (catalog !== exercises || deduped.changed) {
      db.saveExercises(catalog).catch((e) => logError('guardar el catálogo', e));
    }
    if (linked.changed || repaired.changedRoutines) {
      db.saveRoutines(repaired.routines).catch((e) => logError('guardar las rutinas', e));
    }
    for (const sessionId of repaired.changedSessionIds) {
      const changed = repaired.sessions.find((s) => s.id === sessionId);
      if (changed) {
        db.saveSession(changed).catch((e) => logError('guardar la sesión', e));
      }
    }
    setState({
      routines: repaired.routines,
      exercises: catalog,
      sessions: sortSessions(repaired.sessions),
      settings,
      loaded: true,
    });
  } catch (err) {
    console.error('No se pudo cargar los datos', err);
    // No ocultar el problema: la app sigue usable, pero avisa de que el estado
    // mostrado está vacío y de que conviene importar una copia desde Ajustes.
    setState({
      loaded: true,
      loadError:
        'No se pudieron leer los datos guardados en este dispositivo. Importa una copia desde Ajustes o borra los datos para empezar de cero.',
    });
  }
}

// ---------------------------------------------------------------------------
// Rutinas
// ---------------------------------------------------------------------------

function persistRoutines(): void {
  db.saveRoutines(state.routines).catch((e) => logError('guardar las rutinas', e));
}

export function getRoutine(id: string): Routine | undefined {
  return state.routines.find((r) => r.id === id);
}

export function createRoutine(): Routine {
  const now = new Date().toISOString();
  const routine: Routine = {
    id: newId(),
    name: 'Nueva rutina',
    days: [{ id: newId(), name: 'Día 1', exercises: [] }],
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  setState({ routines: [...state.routines, routine] });
  persistRoutines();
  return routine;
}

export function upsertRoutine(routine: Routine): void {
  const exists = state.routines.some((r) => r.id === routine.id);
  setState({
    routines: exists
      ? state.routines.map((r) => (r.id === routine.id ? routine : r))
      : [...state.routines, routine],
  });
  persistRoutines();
  touchBackup('routine-edit');
}

/** Copia profunda + mutación + guardado. Devuelve la rutina resultante. */
export function patchRoutine(id: string, mutate: (draft: Routine) => void): Routine | undefined {
  const current = getRoutine(id);
  if (!current) return undefined;
  const draft = deepClone(current);
  mutate(draft);
  draft.updatedAt = new Date().toISOString();
  upsertRoutine(draft);
  return draft;
}

export function deleteRoutine(id: string): void {
  setState({
    routines: state.routines.filter((r) => r.id !== id),
    settings:
      state.settings.activeRoutineId === id
        ? { ...state.settings, activeRoutineId: undefined }
        : state.settings,
  });
  persistRoutines();
  db.saveSettings(state.settings).catch((e) => logError('guardar los ajustes', e));
  touchBackup('routine-edit');
}

// ---------------------------------------------------------------------------
// Catálogo de ejercicios (identidad estable por id)
// ---------------------------------------------------------------------------

function persistExercises(): void {
  db.saveExercises(state.exercises).catch((e) => logError('guardar el catálogo', e));
}

export function getExercise(id: string): Exercise | undefined {
  return state.exercises.find((e) => e.id === id);
}

/**
 * Devuelve el ejercicio del catálogo con ese nombre; si no existe, lo crea
 * y lo guarda. Nunca duplica nombres (comparación normalizada).
 */
export function ensureExercise(name: string, muscleGroup?: string): Exercise {
  const exercise = pickOrCreateExercise(state.exercises, name, muscleGroup);
  if (!state.exercises.some((e) => e.id === exercise.id)) {
    setState({ exercises: [...state.exercises, exercise] });
    persistExercises();
    touchBackup('exercise-edit');
  }
  return exercise;
}

/**
 * Renombra / reagrupa un ejercicio en el catálogo y en TODAS las rutinas
 * que lo referencian (las sesiones históricas conservan su nombre de origen).
 * Devuelve `false` si el nombre ya pertenece a otro ejercicio del catálogo:
 * permitirlo partiría la identidad en dos entradas con el mismo nombre.
 */
export function applyExerciseDefinition(
  id: string,
  patch: { name?: string; muscleGroup?: string },
): boolean {
  const name = patch.name?.trim() || undefined;
  const muscleChanged = patch.muscleGroup !== undefined;
  const muscle = patch.muscleGroup?.trim() || undefined;

  if (
    name &&
    state.exercises.some(
      (ex) => ex.id !== id && normalizeName(ex.name) === normalizeName(name),
    )
  ) {
    return false;
  }

  const apply = <T extends { exerciseId?: string; name: string; muscleGroup?: string }>(item: T): T => {
    if (item.exerciseId !== id) return item;
    return {
      ...item,
      ...(name ? { name } : {}),
      ...(muscleChanged ? { muscleGroup: muscle } : {}),
    };
  };

  setState({
    // El catálogo se identifica por `id`
    exercises: state.exercises.map((ex) =>
      ex.id === id
        ? {
            ...ex,
            ...(name ? { name } : {}),
            ...(muscleChanged ? { muscleGroup: muscle } : {}),
          }
        : ex,
    ),
    // Las rutinas se identifican por el vínculo `exerciseId`
    routines: state.routines.map((r) => ({
      ...r,
      days: r.days.map((d) => ({
        ...d,
        exercises: d.exercises.map((e) => apply(e)),
      })),
    })),
  });
  persistExercises();
  persistRoutines();
  touchBackup('exercise-edit');
  return true;
}

/**
 * Quita un ejercicio del catálogo. Las rutinas y sesiones conservan su nombre y
 * sus series, pero pierden el vínculo al id borrado (se reparan por nombre), de
 * modo que una sesión nueva no herede un id inexistente.
 */
export function deleteExerciseFromCatalog(id: string): void {
  const exercises = state.exercises.filter((e) => e.id !== id);
  const repaired = repairExerciseLinks(state.routines, state.sessions, exercises);
  setState({
    exercises,
    routines: repaired.routines,
    sessions: repaired.sessions,
  });
  persistExercises();
  if (repaired.changedRoutines) persistRoutines();
  for (const sessionId of repaired.changedSessionIds) {
    const changed = repaired.sessions.find((s) => s.id === sessionId);
    if (changed) {
      db.saveSession(changed).catch((e) => logError('guardar la sesión', e));
    }
  }
  touchBackup('exercise-edit');
}

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

export function updateSettings(patch: Partial<Settings>): void {
  const settings = { ...state.settings, ...patch };
  setState({ settings });
  db.saveSettings(settings).catch((e) => logError('guardar los ajustes', e));
  // Desactivarla olvida también la subida que estuviera esperando.
  if (patch.autoBackup === false) cancelPendingAutoBackup();
}

/**
 * Cambia la unidad convirtiendo todos los pesos guardados (kg ↔ lb).
 * No se usa `updateSettings` porque hay que reescribir rutinas y sesiones:
 * los números no llevan unidad y limitarse a cambiar la etiqueta haría que
 * 60 kg se mostrara como 60 lb.
 */
export function setUnit(unit: Unit): void {
  if (unit === state.settings.unit) return;
  const from = state.settings.unit;
  const routines = convertRoutines(state.routines, from, unit);
  const sessions = convertSessions(state.sessions, from, unit);
  const settings = { ...state.settings, unit };
  setState({ routines, sessions, settings });
  persistRoutines();
  db.saveSettings(settings).catch((e) => logError('guardar los ajustes', e));
  sessions.forEach(persistSession);
}

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------
// El plan NUNCA se actualiza solo: los mejores resultados son una sugerencia
// que solo se aplican al plan con el botón "Actualizar plan" del editor.

function persistSession(session: Session): void {
  db.saveSession(session).catch((e) => logError('guardar la sesión', e));
}

export function getSession(id: string): Session | undefined {
  return state.sessions.find((s) => s.id === id);
}

export function currentSession(): Session | undefined {
  return state.sessions.find((s) => s.status === 'in-progress');
}

/** Copia profunda + mutación + guardado incremental. Devuelve la sesión resultante. */
export function patchSession(id: string, mutate: (draft: Session) => void): Session | undefined {
  const current = getSession(id);
  if (!current) return undefined;
  const draft = deepClone(current);
  mutate(draft);
  const next = state.sessions.map((s) => (s.id === id ? draft : s));
  setState({ sessions: next });
  persistSession(draft);
  return draft;
}

/** Cierra (como completada) la sesión en curso si la hay. */
export function closeCurrentSession(): Session | undefined {
  const active = currentSession();
  if (!active) return undefined;
  return patchSession(active.id, (s) => {
    s.status = 'completed';
  });
}

/** Inicia una sesión desde un día de rutina (cierra la anterior si existía). */
export function startSessionFromDay(routine: Routine, day: RoutineDay): Session {
  closeCurrentSession();
  const session = buildSessionFromDay(routine, day, state.sessions, state.exercises);
  setState({ sessions: sortSessions([...state.sessions, session]) });
  persistSession(session);
  return session;
}

/** Inicia una sesión libre (sin rutina). */
export function startFreeSession(): Session {
  closeCurrentSession();
  const session = buildFreeSession();
  setState({ sessions: sortSessions([...state.sessions, session]) });
  persistSession(session);
  return session;
}

export function finalizeSession(id: string): Session | undefined {
  const updated = patchSession(id, (s) => {
    s.status = 'completed';
  });
  // Copia en Drive al terminar: se sube en segundo plano (nunca se espera:
  // cerrar una sesión no puede depender de la red) tras un retardo corto. Es
  // un hito, así que sí deja copia fechada.
  if (updated) touchBackup('session-complete');
  return updated;
}

/**
 * Cambia la fecha de realización de una sesión (YYYY-MM-DD) y reordena el
 * historial. La sesión no guarda duración: la fecha es su única marca temporal.
 */
export function setSessionDate(id: string, date: string): Session | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const updated = patchSession(id, (s) => {
    s.date = date;
  });
  if (updated) {
    setState({ sessions: sortSessions(state.sessions) });
    touchBackup('session-edit');
  }
  return updated;
}

/** Reabre una sesión del historial para editarla (cierra la que estuviera en curso). */
export function reopenSession(id: string): Session | undefined {
  closeCurrentSession();
  const reopened = patchSession(id, (s) => {
    s.status = 'in-progress';
  });
  // Reabrir ya cambia el historial (la sesión deja de estar cerrada).
  if (reopened) touchBackup('session-edit');
  return reopened;
}

export function deleteSession(id: string): void {
  setState({ sessions: state.sessions.filter((s) => s.id !== id) });
  db.removeSession(id).catch((e) => logError('borrar la sesión', e));
  touchBackup('session-edit');
}

// ---------------------------------------------------------------------------
// Intercambio de rutinas (compartir entre dispositivos)
// ---------------------------------------------------------------------------

/** Exporta rutinas + sus ejercicios a un .json. Devuelve cuántas se exportan. */
export function exportRoutines(): number {
  if (state.routines.length === 0) {
    throw new Error('No hay rutinas para exportar.');
  }
  downloadRoutinesFile(buildRoutinesFile(state.routines, state.exercises));
  return state.routines.length;
}

/**
 * Importa rutinas desde un .json, sumándolas a las existentes.
 * Las que ya están por id se omiten: reimportar no duplica.
 */
export function importRoutines(text: string): {
  added: number;
  skipped: number;
  exercisesAdded: number;
} {
  const file = parseRoutinesFile(text);
  const merged = mergeRoutines(state.routines, state.exercises, file);
  if (merged.added > 0 || merged.exercisesAdded > 0) {
    setState({ routines: merged.routines, exercises: merged.exercises });
    persistRoutines();
    persistExercises();
  }
  return {
    added: merged.added,
    skipped: merged.skipped,
    exercisesAdded: merged.exercisesAdded,
  };
}

// ---------------------------------------------------------------------------
// Backup y borrado total
// ---------------------------------------------------------------------------

/** Reemplaza todos los datos (importación de backup). */
export function replaceAll(data: {
  routines: Routine[];
  exercises?: Exercise[];
  sessions: Session[];
  settings: Settings;
}): void {
  const deduped = mergeDuplicateExercises(data.exercises ?? []);
  const routines = data.routines;
  const repaired = repairExerciseLinks(routines, data.sessions, deduped.exercises);
  setState({
    routines: repaired.routines,
    exercises: deduped.exercises,
    sessions: sortSessions(repaired.sessions),
    settings: { ...DEFAULT_SETTINGS, ...data.settings },
    loadError: undefined,
  });
  db.replaceAllData({
    routines: state.routines,
    exercises: state.exercises,
    sessions: state.sessions,
    settings: state.settings,
  }).catch((e) => logError('importar la copia', e));
}

export function clearAllData(): void {
  // La subida pendiente leería el estado ya vacío y machacaría la copia de Drive.
  cancelPendingAutoBackup();
  setState({
    routines: [],
    exercises: [],
    sessions: [],
    settings: DEFAULT_SETTINGS,
    loadError: undefined,
  });
  db.clearAll().catch((e) => logError('borrar los datos', e));
}
