import type { Exercise, LoadType, Settings, Unit } from '../models';
import { DEFAULT_SETTINGS } from '../models';
import { fmtWeight } from './format';

export interface LoadProfile {
  load: LoadType;
  unilateral: boolean;
  increment: number;
  bodyweight?: number;
}

export type ProfileLookup = (exerciseId: string | undefined) => LoadProfile;

type LoadSettings = Pick<Settings, 'progressionIncrement' | 'bodyweight'>;

export const EXTERNAL_LOAD: LoadProfile = {
  load: 'external',
  unilateral: false,
  increment: DEFAULT_SETTINGS.progressionIncrement,
};

export function loadProfile(exercise: Exercise | undefined, settings: LoadSettings): LoadProfile {
  return {
    load: exercise?.load ?? 'external',
    unilateral: exercise?.unilateral === true,
    increment: exercise?.increment ?? settings.progressionIncrement,
    ...(settings.bodyweight !== undefined ? { bodyweight: settings.bodyweight } : {}),
  };
}

export function profileLookup(exercises: Exercise[], settings: LoadSettings): ProfileLookup {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  return (exerciseId) => loadProfile(exerciseId ? byId.get(exerciseId) : undefined, settings);
}

/** Positivo si `a` es una carga más exigente que `b`. */
export function compareLoad(a: number, b: number, profile: Pick<LoadProfile, 'load'>): number {
  return profile.load === 'assisted' ? b - a : a - b;
}

/** Carga que se mueve de verdad, para 1RM y volumen; sin peso corporal no se puede saber. */
export function effectiveLoad(weight: number, profile: LoadProfile): number | undefined {
  if (profile.load === 'external') return weight;
  if (profile.bodyweight === undefined) return undefined;
  return profile.load === 'bodyweight'
    ? profile.bodyweight + weight
    : Math.max(0, profile.bodyweight - weight);
}

export function progressedWeight(weight: number, profile: LoadProfile): number {
  const next =
    profile.load === 'assisted' ? Math.max(0, weight - profile.increment) : weight + profile.increment;
  return Math.round(next * 100) / 100;
}

/** `60` · `PC` · `PC+10` · `PC−20` */
export function fmtLoad(weight: number | undefined, profile: Pick<LoadProfile, 'load'>): string {
  if (profile.load === 'external') return weight === undefined ? '—' : fmtWeight(weight);
  if (!weight) return 'PC';
  return `PC${profile.load === 'bodyweight' ? '+' : '−'}${fmtWeight(weight)}`;
}

/** `60 kg` · `PC` · `PC+10 kg` · `PC−20 kg` */
export function fmtLoadUnit(
  weight: number | undefined,
  profile: Pick<LoadProfile, 'load'>,
  unit: Unit,
): string {
  const text = fmtLoad(weight, profile);
  return text === 'PC' || text === '—' ? text : `${text} ${unit}`;
}

/** Signo que acompaña al peso de la serie: `+` lastre, `−` asistencia. */
export function loadSign(profile: Pick<LoadProfile, 'load'>): string {
  if (profile.load === 'bodyweight') return '+';
  if (profile.load === 'assisted') return '−';
  return '';
}

export function loadFieldLabel(profile: Pick<LoadProfile, 'load'>): string {
  if (profile.load === 'bodyweight') return 'Lastre';
  if (profile.load === 'assisted') return 'Asistencia';
  return 'Peso';
}

export const LOAD_LABELS: Record<LoadType, string> = {
  external: 'Normal',
  bodyweight: 'Peso corporal',
  assisted: 'Asistido',
};
