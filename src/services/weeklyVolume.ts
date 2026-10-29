import type { Exercise, Session } from '../models';
import { findExercise } from './catalog';
import { parseISODate, todayISO } from './format';
import { normalizeName } from './previousSession';

export const NO_GROUP = 'Sin grupo';

export function addDays(date: string, days: number): string {
  const d = parseISODate(date);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

/** Lunes (YYYY-MM-DD) de la semana de `date`. */
export function weekStart(date: string = todayISO()): string {
  const day = (parseISODate(date).getDay() + 6) % 7;
  return addDays(date, -day);
}

export interface GroupSets {
  group: string;
  sets: number;
  previous: number;
}

/** Series hechas por grupo muscular en la semana que empieza en `monday` y en la anterior. */
export function weeklySetsByGroup(
  sessions: Session[],
  exercises: Exercise[],
  monday: string,
): GroupSets[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const labels = new Map<string, string>();

  const count = (from: string) => {
    const to = addDays(from, 6);
    const totals = new Map<string, number>();
    for (const session of sessions) {
      if (session.status !== 'completed' || session.date < from || session.date > to) continue;
      for (const entry of session.entries) {
        const exercise =
          (entry.exerciseId ? byId.get(entry.exerciseId) : undefined) ??
          findExercise(exercises, entry.exerciseName);
        const label = exercise?.muscleGroup?.trim() || NO_GROUP;
        const key = normalizeName(label);
        if (!labels.has(key)) labels.set(key, label);
        const sets = entry.sets.filter((set) => set.done).length;
        if (sets > 0) totals.set(key, (totals.get(key) ?? 0) + sets);
      }
    }
    return totals;
  };

  const current = count(monday);
  const previous = count(addDays(monday, -7));
  const noGroup = normalizeName(NO_GROUP);
  return [...new Set([...current.keys(), ...previous.keys()])]
    .map((key) => ({
      key,
      group: labels.get(key) ?? key,
      sets: current.get(key) ?? 0,
      previous: previous.get(key) ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(a.key === noGroup) - Number(b.key === noGroup) ||
        b.sets - a.sets ||
        a.group.localeCompare(b.group, 'es'),
    )
    .map(({ group, sets, previous: before }) => ({ group, sets, previous: before }));
}
