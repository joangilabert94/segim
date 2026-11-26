import type {
  Exercise,
  LoadType,
  Routine,
  RoutineDay,
  RoutineExercise,
  Session,
  SessionEntry,
  Settings,
} from '../../models';
import { DEFAULT_SETTINGS } from '../../models';

// Filas tal y como las devuelve o espera PostgREST. `numeric` puede llegar como número o
// como texto según la columna, así que se normaliza al leer.
export interface ExerciseRow {
  user_id: string;
  id: string;
  name: string;
  muscle_group: string | null;
  load_type: LoadType | null;
  unilateral: boolean;
  increment: number | string | null;
  created_at?: string;
}

export interface RoutineRow {
  user_id: string;
  id: string;
  name: string;
  archived: boolean;
  source_routine_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoutineDayRow {
  user_id: string;
  id: string;
  routine_id: string;
  name: string;
  position: number | string;
}

export interface RoutineExerciseRow {
  user_id: string;
  id: string;
  day_id: string;
  exercise_id: string | null;
  name: string;
  muscle_group: string | null;
  position: number | string;
}

export interface PlannedSetRow {
  user_id: string;
  routine_exercise_id: string;
  position: number | string;
  weight: number | string | null;
  reps: number | string;
  reps_max: number | string | null;
  duration_sec: number | string | null;
  note: string | null;
}

export interface SessionRow {
  user_id: string;
  id: string;
  date: string;
  routine_id: string | null;
  day_id: string | null;
  day_name: string;
  status: Session['status'];
}

export interface SessionEntryRow {
  user_id: string;
  id: string;
  session_id: string;
  exercise_id: string | null;
  exercise_name: string;
  note: string | null;
  position: number | string;
}

export interface PerformedSetRow {
  user_id: string;
  session_entry_id: string;
  position: number | string;
  weight: number | string;
  reps: number | string;
  reps_max: number | string | null;
  duration_sec: number | string | null;
  done: boolean;
  extra: boolean;
  note: string | null;
}

export interface SettingsRow {
  user_id: string;
  unit: Settings['unit'];
  rest_presets: number[] | string | null;
  active_routine_id: string | null;
  theme: Settings['theme'];
  progression_increment: number | string;
  bodyweight: number | string | null;
}

const num = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const numOr = (value: unknown, fallback: number): number => num(value) ?? fallback;

const pos = (value: unknown): number => Math.trunc(numOr(value, 0));

// ---------------------------------------------------------------- rutinas

export interface RoutineRows {
  routine: RoutineRow;
  days: RoutineDayRow[];
  exercises: RoutineExerciseRow[];
  sets: PlannedSetRow[];
}

export function routineToRows(routine: Routine, userId: string): RoutineRows {
  const days: RoutineDayRow[] = routine.days.map((day, index) => ({
    user_id: userId,
    id: day.id,
    routine_id: routine.id,
    name: day.name,
    position: index,
  }));

  const exercises: RoutineExerciseRow[] = routine.days.flatMap((day) =>
    day.exercises.map((exercise, index) => ({
      user_id: userId,
      id: exercise.id,
      day_id: day.id,
      exercise_id: exercise.exerciseId ?? null,
      name: exercise.name,
      muscle_group: exercise.muscleGroup ?? null,
      position: index,
    })),
  );

  const sets: PlannedSetRow[] = routine.days.flatMap((day) =>
    day.exercises.flatMap((exercise) =>
      exercise.plannedSets.map((set, index) => ({
        user_id: userId,
        routine_exercise_id: exercise.id,
        position: index,
        weight: set.weight ?? null,
        reps: set.reps,
        reps_max: set.repsMax ?? null,
        duration_sec: set.durationSec ?? null,
        note: set.note ?? null,
      })),
    ),
  );

  return {
    routine: {
      user_id: userId,
      id: routine.id,
      name: routine.name,
      archived: routine.archived,
      source_routine_id: routine.sourceRoutineId ?? null,
      created_at: routine.createdAt,
      updated_at: routine.updatedAt,
    },
    days,
    exercises,
    sets,
  };
}

export function routinesFromRows(rows: {
  routines: RoutineRow[];
  days: RoutineDayRow[];
  exercises: RoutineExerciseRow[];
  sets: PlannedSetRow[];
}): Routine[] {
  const daysByRoutine = new Map<string, RoutineDayRow[]>();
  for (const day of rows.days) {
    const list = daysByRoutine.get(day.routine_id) ?? [];
    list.push(day);
    daysByRoutine.set(day.routine_id, list);
  }

  const exercisesByDay = new Map<string, RoutineExerciseRow[]>();
  for (const exercise of rows.exercises) {
    const list = exercisesByDay.get(exercise.day_id) ?? [];
    list.push(exercise);
    exercisesByDay.set(exercise.day_id, list);
  }

  const setsByExercise = new Map<string, PlannedSetRow[]>();
  for (const set of rows.sets) {
    const list = setsByExercise.get(set.routine_exercise_id) ?? [];
    list.push(set);
    setsByExercise.set(set.routine_exercise_id, list);
  }

  return rows.routines.map((routine) => {
    const days: RoutineDay[] = (daysByRoutine.get(routine.id) ?? [])
      .sort((a, b) => pos(a.position) - pos(b.position))
      .map((day) => {
        const exercises: RoutineExercise[] = (exercisesByDay.get(day.id) ?? [])
          .sort((a, b) => pos(a.position) - pos(b.position))
          .map((exercise) => {
            const item: RoutineExercise = {
              id: exercise.id,
              name: exercise.name,
              plannedSets: (setsByExercise.get(exercise.id) ?? [])
                .sort((a, b) => pos(a.position) - pos(b.position))
                .map((set) => {
                  const planned: RoutineExercise['plannedSets'][number] = {
                    reps: numOr(set.reps, 0),
                  };
                  const weight = num(set.weight);
                  if (weight !== undefined) planned.weight = weight;
                  const repsMax = num(set.reps_max);
                  if (repsMax !== undefined) planned.repsMax = repsMax;
                  const durationSec = num(set.duration_sec);
                  if (durationSec !== undefined) planned.durationSec = durationSec;
                  if (set.note) planned.note = set.note;
                  return planned;
                }),
            };
            if (exercise.exercise_id) item.exerciseId = exercise.exercise_id;
            if (exercise.muscle_group) item.muscleGroup = exercise.muscle_group;
            return item;
          });
        return { id: day.id, name: day.name, exercises };
      });

    const result: Routine = {
      id: routine.id,
      name: routine.name,
      days,
      archived: routine.archived === true,
      createdAt: routine.created_at,
      updatedAt: routine.updated_at,
    };
    if (routine.source_routine_id) result.sourceRoutineId = routine.source_routine_id;
    return result;
  });
}

// ---------------------------------------------------------------- sesiones

export interface SessionEntryInsert extends Omit<SessionEntryRow, 'id'> {
  position: number;
}

export interface SessionSetInsert extends Omit<PerformedSetRow, 'session_entry_id'> {
  entry_position: number;
}

export interface SessionRows {
  session: SessionRow;
  entries: SessionEntryInsert[];
  // Las series se enlazan por la posición del ejercicio: el id de la fila lo pone Postgres.
  sets: SessionSetInsert[];
}

export function sessionToRows(session: Session, userId: string): SessionRows {
  return {
    session: {
      user_id: userId,
      id: session.id,
      date: session.date,
      routine_id: session.routineId ?? null,
      day_id: session.dayId ?? null,
      day_name: session.dayName,
      status: session.status,
    },
    entries: session.entries.map((entry, index) => ({
      user_id: userId,
      session_id: session.id,
      exercise_id: entry.exerciseId ?? null,
      exercise_name: entry.exerciseName,
      note: entry.note ?? null,
      position: index,
    })),
    sets: session.entries.flatMap((entry, entryIndex) =>
      entry.sets.map((set, index) => ({
        user_id: userId,
        entry_position: entryIndex,
        position: index,
        weight: set.weight,
        reps: set.reps,
        reps_max: set.repsMax ?? null,
        duration_sec: set.durationSec ?? null,
        done: set.done === true,
        extra: set.extra === true,
        note: set.note ?? null,
      })),
    ),
  };
}

export function sessionsFromRows(rows: {
  sessions: SessionRow[];
  entries: SessionEntryRow[];
  sets: PerformedSetRow[];
}): Session[] {
  const entriesBySession = new Map<string, SessionEntryRow[]>();
  for (const entry of rows.entries) {
    const list = entriesBySession.get(entry.session_id) ?? [];
    list.push(entry);
    entriesBySession.set(entry.session_id, list);
  }

  const entryIds = new Set(rows.entries.map((entry) => entry.id));
  const orphanedSets = rows.sets.filter((set) => !entryIds.has(set.session_entry_id)).length;
  // No se puede inventar el ejercicio al que pertenecen: se ignoran, pero que quede constancia.
  if (orphanedSets > 0) {
    console.warn(`Sincronización: ${orphanedSets} serie(s) sin su ejercicio; se ignoran.`);
  }

  const setsByEntry = new Map<string, PerformedSetRow[]>();
  for (const set of rows.sets) {
    const list = setsByEntry.get(set.session_entry_id) ?? [];
    list.push(set);
    setsByEntry.set(set.session_entry_id, list);
  }

  return rows.sessions.map((session) => {
    const entries: SessionEntry[] = (entriesBySession.get(session.id) ?? [])
      .sort((a, b) => pos(a.position) - pos(b.position))
      .map((entry) => {
        const item: SessionEntry = {
          exerciseName: entry.exercise_name,
          sets: (setsByEntry.get(entry.id) ?? [])
            .sort((a, b) => pos(a.position) - pos(b.position))
            .map((set) => {
              const performed: SessionEntry['sets'][number] = {
                weight: numOr(set.weight, 0),
                reps: numOr(set.reps, 0),
                done: set.done === true,
              };
              const repsMax = num(set.reps_max);
              if (repsMax !== undefined) performed.repsMax = repsMax;
              const durationSec = num(set.duration_sec);
              if (durationSec !== undefined) performed.durationSec = durationSec;
              if (set.note) performed.note = set.note;
              if (set.extra === true) performed.extra = true;
              return performed;
            }),
        };
        if (entry.exercise_id) item.exerciseId = entry.exercise_id;
        if (entry.note) item.note = entry.note;
        return item;
      });

    const result: Session = {
      id: session.id,
      date: session.date,
      dayName: session.day_name,
      status: session.status === 'in-progress' ? 'in-progress' : 'completed',
      entries,
    };
    if (session.routine_id) result.routineId = session.routine_id;
    if (session.day_id) result.dayId = session.day_id;
    return result;
  });
}

// ---------------------------------------------------------------- catálogo y ajustes

export function exerciseToRow(exercise: Exercise, userId: string): ExerciseRow {
  return {
    user_id: userId,
    id: exercise.id,
    name: exercise.name,
    muscle_group: exercise.muscleGroup ?? null,
    load_type: exercise.load ?? null,
    unilateral: exercise.unilateral === true,
    increment: exercise.increment ?? null,
    created_at: exercise.createdAt,
  };
}

export function exercisesFromRows(rows: ExerciseRow[]): Exercise[] {
  return rows.map((row) => {
    const exercise: Exercise = { id: row.id, name: row.name, createdAt: row.created_at ?? '' };
    if (row.muscle_group) exercise.muscleGroup = row.muscle_group;
    if (row.load_type) exercise.load = row.load_type;
    if (row.unilateral === true) exercise.unilateral = true;
    const increment = num(row.increment);
    if (increment !== undefined) exercise.increment = increment;
    return exercise;
  });
}

export function settingsToRow(settings: Settings, userId: string): SettingsRow {
  return {
    user_id: userId,
    unit: settings.unit,
    rest_presets: settings.restPresets,
    active_routine_id: settings.activeRoutineId ?? null,
    theme: settings.theme,
    progression_increment: settings.progressionIncrement,
    bodyweight: settings.bodyweight ?? null,
  };
}

export function settingsFromRow(row: SettingsRow | null): Settings {
  if (!row) return { ...DEFAULT_SETTINGS };
  const presets = Array.isArray(row.rest_presets)
    ? row.rest_presets.map((value) => numOr(value, 60)).filter((value) => value > 0)
    : [];
  const settings: Settings = {
    unit: row.unit === 'lb' ? 'lb' : 'kg',
    restPresets: presets.length > 0 ? presets : DEFAULT_SETTINGS.restPresets,
    theme: row.theme === 'light' || row.theme === 'dark' ? row.theme : 'auto',
    progressionIncrement: numOr(row.progression_increment, DEFAULT_SETTINGS.progressionIncrement),
  };
  if (row.active_routine_id) settings.activeRoutineId = row.active_routine_id;
  const bodyweight = num(row.bodyweight);
  if (bodyweight !== undefined) settings.bodyweight = bodyweight;
  return settings;
}

// ---------------------------------------------------------------- diferencias

export interface EntityDiff<T> {
  added: T[];
  changed: T[];
  removed: string[];
}

/** Compara lo último subido con el estado actual para subir solo lo que cambió. */
export function diffEntities<T>(
  pushed: Map<string, string>,
  next: T[],
  keyOf: (value: T) => string,
): EntityDiff<T> {
  const diff: EntityDiff<T> = { added: [], changed: [], removed: [] };
  const seen = new Set<string>();
  for (const value of next) {
    const key = keyOf(value);
    seen.add(key);
    const json = JSON.stringify(value);
    const previous = pushed.get(key);
    if (previous === undefined) diff.added.push(value);
    else if (previous !== json) diff.changed.push(value);
  }
  for (const key of pushed.keys()) {
    if (!seen.has(key)) diff.removed.push(key);
  }
  return diff;
}
