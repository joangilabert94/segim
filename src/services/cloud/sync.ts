import type { Exercise, Routine, Session, Settings } from '../../models';
import { cloudClient } from './client';
import {
  exerciseToRow,
  exercisesFromRows,
  type ExerciseRow,
  type PerformedSetRow,
  type PlannedSetRow,
  type RoutineDayRow,
  type RoutineExerciseRow,
  type RoutineRow,
  routineToRows,
  routinesFromRows,
  type SessionEntryRow,
  type SessionRow,
  sessionToRows,
  sessionsFromRows,
  settingsFromRow,
  type SettingsRow,
  settingsToRow,
} from './mappers';

export interface CloudData {
  routines: Routine[];
  exercises: Exercise[];
  sessions: Session[];
  settings: Settings | null;
}

interface QueryError {
  message: string;
}

function fail(error: QueryError | null, what: string): void {
  if (error) throw new Error(`No se pudo ${what}: ${error.message}`);
}

function rows<T>(result: { data: unknown; error: QueryError | null }, what: string): T[] {
  fail(result.error, what);
  return (result.data ?? []) as T[];
}

/** Descarga todo lo del usuario (el RLS deja pasar solo sus filas). */
export async function cloudPull(): Promise<CloudData> {
  const c = cloudClient();
  const [
    routinesResult,
    daysResult,
    routineExercisesResult,
    plannedResult,
    sessionsResult,
    entriesResult,
    performedResult,
    exercisesResult,
    settingsResult,
  ] = await Promise.all([
    c.from('routines').select('*'),
    c.from('routine_days').select('*'),
    c.from('routine_exercises').select('*'),
    c.from('planned_sets').select('*'),
    c.from('sessions').select('*'),
    c.from('session_entries').select('*'),
    c.from('performed_sets').select('*'),
    c.from('exercises').select('*'),
    c.from('settings').select('*').limit(1),
  ]);

  const settingsRows = rows<SettingsRow>(settingsResult, 'leer los ajustes');

  return {
    routines: routinesFromRows({
      routines: rows<RoutineRow>(routinesResult, 'leer las rutinas'),
      days: rows<RoutineDayRow>(daysResult, 'leer los días'),
      exercises: rows<RoutineExerciseRow>(routineExercisesResult, 'leer los ejercicios de rutina'),
      sets: rows<PlannedSetRow>(plannedResult, 'leer las series planeadas'),
    }),
    exercises: exercisesFromRows(rows<ExerciseRow>(exercisesResult, 'leer el catálogo')),
    sessions: sessionsFromRows({
      sessions: rows<SessionRow>(sessionsResult, 'leer las sesiones'),
      entries: rows<SessionEntryRow>(entriesResult, 'leer los ejercicios de la sesión'),
      sets: rows<PerformedSetRow>(performedResult, 'leer las series hechas'),
    }),
    settings: settingsFromRow(settingsRows[0] ?? null),
  };
}

/**
 * Guarda una rutina entera. Los hijos (días, ejercicios y series) se reescriben completos:
 * es más simple que calcular diferencias y en la app no tienen id propio que conservar.
 */
export async function cloudPushRoutine(routine: Routine, userId: string): Promise<void> {
  const c = cloudClient();
  const payload = routineToRows(routine, userId);

  const saved = await c.from('routines').upsert(payload.routine, { onConflict: 'user_id,id' });
  fail(saved.error, 'guardar la rutina');

  // El borrado de los días arrastra en cascada sus ejercicios y series planificadas.
  const cleared = await c
    .from('routine_days')
    .delete()
    .eq('routine_id', routine.id)
    .eq('user_id', userId);
  fail(cleared.error, 'guardar los días');

  if (payload.days.length > 0) {
    fail((await c.from('routine_days').insert(payload.days)).error, 'guardar los días');
  }
  if (payload.exercises.length > 0) {
    fail(
      (await c.from('routine_exercises').insert(payload.exercises)).error,
      'guardar los ejercicios de la rutina',
    );
  }
  if (payload.sets.length > 0) {
    fail((await c.from('planned_sets').insert(payload.sets)).error, 'guardar las series planeadas');
  }
}

export async function cloudDeleteRoutines(ids: string[], userId: string): Promise<void> {
  if (ids.length === 0) return;
  fail(
    (await cloudClient().from('routines').delete().in('id', ids).eq('user_id', userId)).error,
    'borrar las rutinas',
  );
}

export async function cloudPushSession(session: Session, userId: string): Promise<void> {
  const c = cloudClient();
  const payload = sessionToRows(session, userId);

  fail(
    (await c.from('sessions').upsert(payload.session, { onConflict: 'user_id,id' })).error,
    'guardar la sesión',
  );

  fail(
    (
      await c
        .from('session_entries')
        .delete()
        .eq('session_id', session.id)
        .eq('user_id', userId)
    ).error,
    'guardar los ejercicios de la sesión',
  );

  if (payload.entries.length === 0) return;

  const inserted = await c
    .from('session_entries')
    .insert(payload.entries)
    .select('id, position');
  const created = rows<{ id: string; position: number }>(
    inserted,
    'guardar los ejercicios de la sesión',
  );

  const idByPosition = new Map(created.map((row) => [Number(row.position), row.id]));
  // Nunca se descartan series en silencio: si alguna no enlaza con su ejercicio, falla
  // visible y reintentable en vez de dejar la nube a medias sin que nadie se entere.
  const unlinked = payload.sets.filter((set) => !idByPosition.has(set.entry_position));
  if (unlinked.length > 0) {
    throw new Error(
      `No se pudieron guardar ${unlinked.length} serie(s) de la sesión: faltan sus ejercicios.`,
    );
  }
  const sets = payload.sets.map(({ entry_position, ...set }) => ({
    ...set,
    session_entry_id: idByPosition.get(entry_position) as string,
  }));
  if (sets.length > 0) {
    fail((await c.from('performed_sets').insert(sets)).error, 'guardar las series hechas');
  }
}

export async function cloudDeleteSessions(ids: string[], userId: string): Promise<void> {
  if (ids.length === 0) return;
  fail(
    (await cloudClient().from('sessions').delete().in('id', ids).eq('user_id', userId)).error,
    'borrar las sesiones',
  );
}

export async function cloudPushExercises(list: Exercise[], userId: string): Promise<void> {
  if (list.length === 0) return;
  const payload = list.map((exercise) => exerciseToRow(exercise, userId));
  fail(
    (await cloudClient().from('exercises').upsert(payload, { onConflict: 'user_id,id' })).error,
    'guardar el catálogo',
  );
}

export async function cloudDeleteExercises(ids: string[], userId: string): Promise<void> {
  if (ids.length === 0) return;
  fail(
    (await cloudClient().from('exercises').delete().in('id', ids).eq('user_id', userId)).error,
    'borrar ejercicios del catálogo',
  );
}

export async function cloudPushSettings(settings: Settings, userId: string): Promise<void> {
  fail(
    (
      await cloudClient()
        .from('settings')
        .upsert(settingsToRow(settings, userId), { onConflict: 'user_id' })
    ).error,
    'guardar los ajustes',
  );
}

async function remoteIds(table: string, userId: string): Promise<string[]> {
  const result = await cloudClient().from(table).select('id').eq('user_id', userId);
  return rows<{ id: string }>(result, `leer ${table}`).map((row) => row.id);
}

async function prune(table: string, keep: Set<string>, userId: string): Promise<void> {
  const stale = (await remoteIds(table, userId)).filter((id) => !keep.has(id));
  if (stale.length === 0) return;
  fail(
    (await cloudClient().from(table).delete().in('id', stale).eq('user_id', userId)).error,
    `limpiar ${table}`,
  );
}

/** Sube el estado completo. Se usa al conectar y al resolver el primer conflicto. */
export async function cloudPushAll(
  data: { routines: Routine[]; exercises: Exercise[]; sessions: Session[]; settings: Settings },
  userId: string,
): Promise<void> {
  await cloudPushExercises(data.exercises, userId);
  for (const routine of data.routines) await cloudPushRoutine(routine, userId);
  for (const session of data.sessions) await cloudPushSession(session, userId);

  // Al final, para no borrar una fila que todavía referencia una rutina recién subida.
  await prune('exercises', new Set(data.exercises.map((e) => e.id)), userId);
  await prune('routines', new Set(data.routines.map((r) => r.id)), userId);
  await prune('sessions', new Set(data.sessions.map((s) => s.id)), userId);

  await cloudPushSettings(data.settings, userId);
}

const REALTIME_TABLES = [
  'exercises',
  'routines',
  'routine_days',
  'routine_exercises',
  'planned_sets',
  'sessions',
  'session_entries',
  'performed_sets',
  'settings',
] as const;

/** Avisa de cualquier cambio del usuario (el RLS filtra lo que no es suyo). */
export function subscribeRemoteChanges(onChange: () => void): () => void {
  const c = cloudClient();
  let channel = c.channel(`segim-sync-${Math.random().toString(36).slice(2, 10)}`);
  for (const table of REALTIME_TABLES) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => onChange(),
    );
  }
  channel.subscribe();
  return () => {
    void c.removeChannel(channel);
  };
}
