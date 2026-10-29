import type {
  Exercise,
  PerformedSet,
  PlannedSet,
  Routine,
  RoutineDay,
  RoutineExercise,
  Session,
  SessionEntry,
  Settings,
} from '../models';
import { DEFAULT_SETTINGS } from '../models';
import { normalizeThemeMode } from './theme';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const isNonNegative = (v: unknown): v is number => isFiniteNumber(v) && v >= 0;

const optionalString = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined;

const requiredString = (v: unknown, field: string, where: string): string => {
  if (typeof v !== 'string') {
    throw new Error(`${where} no tiene un "${field}" válido.`);
  }
  return v;
};

const requiredArray = (v: unknown, field: string, where: string): unknown[] => {
  if (!Array.isArray(v)) {
    throw new Error(`${where} no tiene un "${field}" válido.`);
  }
  return v;
};

export const isValidDateISO = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function parseExercise(v: unknown, where = 'Un ejercicio'): Exercise {
  if (!isObject(v)) throw new Error(`${where} no es un objeto válido.`);
  return {
    id: requiredString(v.id, 'id', where),
    name: requiredString(v.name, 'name', where),
    muscleGroup: optionalString(v.muscleGroup),
    createdAt:
      typeof v.createdAt === 'string' ? v.createdAt : new Date().toISOString(),
    ...(v.load === 'bodyweight' || v.load === 'assisted' ? { load: v.load } : {}),
    ...(v.unilateral === true ? { unilateral: true } : {}),
    ...(isFiniteNumber(v.increment) && v.increment > 0 ? { increment: v.increment } : {}),
  };
}

function parsePlannedSet(v: unknown, where: string): PlannedSet {
  if (!isObject(v)) throw new Error(`${where} no es una serie válida.`);
  if (!isNonNegative(v.reps)) {
    throw new Error(`${where} no tiene repeticiones válidas.`);
  }
  if (v.weight !== undefined && !isNonNegative(v.weight)) {
    throw new Error(`${where} tiene un peso no válido.`);
  }
  if (v.repsMax !== undefined && !isNonNegative(v.repsMax)) {
    throw new Error(`${where} tiene un rango de reps no válido.`);
  }
  if (v.durationSec !== undefined && !isNonNegative(v.durationSec)) {
    throw new Error(`${where} tiene una duración no válida.`);
  }
  return {
    ...(v.weight !== undefined ? { weight: v.weight } : {}),
    reps: Math.round(v.reps),
    ...(v.repsMax !== undefined ? { repsMax: Math.round(v.repsMax) } : {}),
    ...(v.durationSec !== undefined ? { durationSec: Math.round(v.durationSec) } : {}),
    ...(typeof v.note === 'string' ? { note: v.note } : {}),
  };
}

function parseRoutineExercise(v: unknown, where: string): RoutineExercise {
  if (!isObject(v)) throw new Error(`${where} no es un ejercicio válido.`);
  const plannedSets = requiredArray(v.plannedSets, 'plannedSets', where);
  return {
    id: requiredString(v.id, 'id', where),
    ...(typeof v.exerciseId === 'string' ? { exerciseId: v.exerciseId } : {}),
    name: requiredString(v.name, 'name', where),
    ...(typeof v.muscleGroup === 'string' ? { muscleGroup: v.muscleGroup } : {}),
    plannedSets: plannedSets.map((set, i) =>
      parsePlannedSet(set, `${where}, serie ${i + 1}`),
    ),
  };
}

function parseRoutineDay(v: unknown, where: string): RoutineDay {
  if (!isObject(v)) throw new Error(`${where} no es un día válido.`);
  const exercises = requiredArray(v.exercises, 'exercises', where);
  return {
    id: requiredString(v.id, 'id', where),
    name: requiredString(v.name, 'name', where),
    exercises: exercises.map((ex, i) =>
      parseRoutineExercise(ex, `${where}, ejercicio ${i + 1}`),
    ),
  };
}

export function parseRoutine(v: unknown, where = 'Una rutina'): Routine {
  if (!isObject(v)) throw new Error(`${where} no es un objeto válido.`);
  const days = requiredArray(v.days, 'days', where);
  const now = new Date().toISOString();
  return {
    id: requiredString(v.id, 'id', where),
    name: requiredString(v.name, 'name', where),
    days: days.map((day, i) => parseRoutineDay(day, `${where}, día ${i + 1}`)),
    archived: v.archived === true,
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : now,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : now,
    ...(typeof v.sourceRoutineId === 'string'
      ? { sourceRoutineId: v.sourceRoutineId }
      : {}),
  };
}

function parsePerformedSet(v: unknown, where: string): PerformedSet {
  if (!isObject(v)) throw new Error(`${where} no es una serie válida.`);
  if (!isNonNegative(v.weight) || !isNonNegative(v.reps)) {
    throw new Error(`${where} no tiene peso/reps válidos.`);
  }
  if (v.repsMax !== undefined && !isNonNegative(v.repsMax)) {
    throw new Error(`${where} tiene un rango de reps no válido.`);
  }
  if (v.durationSec !== undefined && !isNonNegative(v.durationSec)) {
    throw new Error(`${where} tiene una duración no válida.`);
  }
  return {
    weight: v.weight,
    reps: Math.round(v.reps),
    ...(v.repsMax !== undefined ? { repsMax: Math.round(v.repsMax) } : {}),
    ...(v.durationSec !== undefined ? { durationSec: Math.round(v.durationSec) } : {}),
    // Sin check explícito no está hecha: una copia incompleta no genera resultados fantasma.
    done: v.done === true,
    ...(typeof v.note === 'string' ? { note: v.note } : {}),
    ...(v.extra === true ? { extra: true } : {}),
  };
}

function parseSessionEntry(v: unknown, where: string): SessionEntry {
  if (!isObject(v)) throw new Error(`${where} no es un ejercicio válido.`);
  const sets = requiredArray(v.sets, 'sets', where);
  return {
    ...(typeof v.exerciseId === 'string' ? { exerciseId: v.exerciseId } : {}),
    exerciseName: requiredString(v.exerciseName, 'exerciseName', where),
    ...(typeof v.note === 'string' ? { note: v.note } : {}),
    sets: sets.map((set, i) => parsePerformedSet(set, `${where}, serie ${i + 1}`)),
  };
}

export function parseSession(v: unknown, where = 'Una sesión'): Session {
  if (!isObject(v)) throw new Error(`${where} no es un objeto válido.`);
  if (!isValidDateISO(v.date)) {
    throw new Error(`${where} no tiene una fecha válida (YYYY-MM-DD).`);
  }
  const entries = requiredArray(v.entries, 'entries', where);
  return {
    id: requiredString(v.id, 'id', where),
    date: v.date,
    ...(typeof v.routineId === 'string' ? { routineId: v.routineId } : {}),
    ...(typeof v.dayId === 'string' ? { dayId: v.dayId } : {}),
    dayName: requiredString(v.dayName, 'dayName', where),
    status: v.status === 'in-progress' ? 'in-progress' : 'completed',
    entries: entries.map((entry, i) =>
      parseSessionEntry(entry, `${where}, ejercicio ${i + 1}`),
    ),
  };
}

export function parseSettings(v: unknown): Settings {
  const raw = isObject(v) ? v : {};
  const presetsRaw = Array.isArray(raw.restPresets) ? raw.restPresets : [];
  const presets = presetsRaw
    .filter(isFiniteNumber)
    .map((n) => Math.min(600, Math.max(5, Math.round(n))))
    .slice(0, 6);
  return {
    ...DEFAULT_SETTINGS,
    unit: raw.unit === 'lb' ? 'lb' : 'kg',
    restPresets: presets.length > 0 ? presets : DEFAULT_SETTINGS.restPresets,
    theme: normalizeThemeMode(raw.theme),
    autoBackup: raw.autoBackup === true,
    progressionIncrement:
      isFiniteNumber(raw.progressionIncrement) && raw.progressionIncrement > 0
        ? raw.progressionIncrement
        : DEFAULT_SETTINGS.progressionIncrement,
    ...(isFiniteNumber(raw.bodyweight) && raw.bodyweight > 0 ? { bodyweight: raw.bodyweight } : {}),
    ...(typeof raw.activeRoutineId === 'string' && raw.activeRoutineId
      ? { activeRoutineId: raw.activeRoutineId }
      : {}),
  };
}

export function parseExerciseList(v: unknown): Exercise[] {
  if (v === undefined || v === null) return [];
  const list = requiredArray(v, 'exercises', 'La copia');
  return list.map((item, i) => parseExercise(item, `El ejercicio ${i + 1} de la copia`));
}
