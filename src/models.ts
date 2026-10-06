// Tipos de datos de la aplicación.
// Todo lo planeado y lo realizado se guarda serie a serie:
// cada serie tiene su propio peso y sus propias reps… o su duración,
// cuando es una serie cronometrada (isometría: plancha 30 s, etc.).
// Regla: si `durationSec` existe, manda él y `reps` se ignora.

export type Unit = 'kg' | 'lb';

/**
 * Preferencia de tema: `auto` sigue el modo del dispositivo
 * (`prefers-color-scheme`); `light` y `dark` lo fuerzan.
 */
export type ThemeMode = 'auto' | 'light' | 'dark';

/** Tema ya resuelto, el que realmente se pinta en el documento. */
export type ResolvedTheme = 'light' | 'dark';

/**
 * Ejercicio del catálogo. Su `id` es la identidad ESTABLE: la comparación
 * entre sesiones y los vínculos rutina↔sesión usan el id, no el nombre.
 */
export interface Exercise {
  id: string;
  name: string;
  muscleGroup?: string;
  createdAt: string;
}

/** Serie planeada dentro de un ejercicio de una rutina. */
export interface PlannedSet {
  weight?: number; // peso objetivo de ESTA serie (opcional)
  reps: number; // reps planeadas de ESTA serie (mínimo si hay rango)
  repsMax?: number; // si existe y > reps, la serie es un rango: 4-6
  durationSec?: number; // si existe, la serie es cronometrada (segundos)
  note?: string;
}

export interface RoutineExercise {
  id: string;
  exerciseId?: string; // vínculo con el catálogo (opcional en datos antiguos)
  name: string; // copia denormalizada para mostrar
  muscleGroup?: string;
  plannedSets: PlannedSet[];
}

export interface RoutineDay {
  id: string;
  name: string;
  exercises: RoutineExercise[];
}

export interface Routine {
  id: string;
  name: string;
  days: RoutineDay[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  sourceRoutineId?: string; // si fue clonada, rutina de origen
}

/** Serie realizada dentro de una sesión. */
export interface PerformedSet {
  weight: number; // peso real de ESTA serie
  reps: number; // reps reales de ESTA serie (mínimo si hay rango)
  repsMax?: number; // si existe y > reps, la serie es un rango: 4-6
  durationSec?: number; // si existe, la serie es cronometrada (segundos)
  done: boolean;
  note?: string;
  extra?: boolean; // serie añadida sobre la marcha (no planificada)
}

/** Cómo se expresan las reps de una serie. */
export type SetMode = 'fixed' | 'range' | 'timed';

/**
 * Modo de una serie: cronometrada > rango > número fijo.
 * Una serie puede conservar repsMax y durationSec como residuo al cambiar
 * de modo; este helper decide qué se muestra y qué se edita.
 */
export function setModeOf(set: {
  reps: number;
  repsMax?: number;
  durationSec?: number;
}): SetMode {
  if (set.durationSec !== undefined) return 'timed';
  if (set.repsMax !== undefined && set.repsMax > set.reps) return 'range';
  return 'fixed';
}

export interface SessionEntry {
  exerciseId?: string; // vínculo con el catálogo (opcional en datos antiguos)
  exerciseName: string; // copia plana; sin id, la identidad es el nombre normalizado
  note?: string;
  sets: PerformedSet[];
}

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD (fecha de la sesión, obligatoria)
  routineId?: string;
  dayId?: string;
  dayName: string; // copia del nombre del día (la rutina puede cambiar)
  status: 'in-progress' | 'completed';
  startedAt: string; // ISO con hora
  completedAt?: string;
  entries: SessionEntry[];
}

export interface Settings {
  unit: Unit;
  restPresets: number[]; // 6 duraciones en segundos
  activeRoutineId?: string;
  theme: ThemeMode; // por defecto, el del dispositivo
}

export const DEFAULT_SETTINGS: Settings = {
  unit: 'kg',
  restPresets: [60, 90, 120, 180, 240, 300],
  theme: 'auto',
};

/** Identificador único (uuid cuando está disponible). */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
