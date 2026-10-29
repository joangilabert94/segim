export type Unit = 'kg' | 'lb';

export type ThemeMode = 'auto' | 'light' | 'dark';

export type ResolvedTheme = 'light' | 'dark';

export interface Exercise {
  id: string;
  name: string;
  muscleGroup?: string;
  createdAt: string;
}

export interface PlannedSet {
  weight?: number;
  reps: number;
  repsMax?: number;
  durationSec?: number;
  note?: string;
}

export interface RoutineExercise {
  id: string;
  exerciseId?: string;
  name: string;
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
  sourceRoutineId?: string;
}

export interface PerformedSet {
  weight: number;
  reps: number;
  repsMax?: number; // solo datos antiguos: la sesión ya no admite rangos
  durationSec?: number;
  done: boolean;
  note?: string;
  extra?: boolean;
}

export type SetMode = 'fixed' | 'range' | 'timed';

// Al cambiar de modo pueden quedar repsMax y durationSec de residuo: este orden decide.
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
  exerciseId?: string;
  exerciseName: string;
  note?: string;
  sets: PerformedSet[];
}

export interface Session {
  id: string;
  // YYYY-MM-DD, sin duración: no siempre se marca cuándo se empieza y se termina.
  date: string;
  routineId?: string;
  dayId?: string;
  dayName: string; // copia del nombre del día (la rutina puede cambiar)
  status: 'in-progress' | 'completed';
  entries: SessionEntry[];
}

export interface Settings {
  unit: Unit;
  restPresets: number[];
  activeRoutineId?: string;
  theme: ThemeMode;
  // Desactivada por defecto: cada subida es una petición a un servicio externo.
  autoBackup: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  unit: 'kg',
  restPresets: [60, 90, 120, 180, 240, 300],
  theme: 'auto',
  autoBackup: false,
};

export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  // iOS < 15.4 no tiene structuredClone; JSON basta para los datos planos de la app.
  return JSON.parse(JSON.stringify(value)) as T;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
