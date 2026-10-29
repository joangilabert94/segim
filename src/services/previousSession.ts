import type { Session, SessionEntry } from '../models';

export interface ExerciseRef {
  exerciseId?: string;
  name: string;
}

export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function matchesExercise(a: ExerciseRef, b: ExerciseRef): boolean {
  if (a.exerciseId && b.exerciseId) return a.exerciseId === b.exerciseId;
  return normalizeName(a.name) === normalizeName(b.name);
}

export function refOfEntry(entry: SessionEntry): ExerciseRef {
  return { exerciseId: entry.exerciseId, name: entry.exerciseName };
}

const toRef = (ref: string | ExerciseRef): ExerciseRef =>
  typeof ref === 'string' ? { name: ref } : ref;

export function findEntry(
  session: Session,
  ref: string | ExerciseRef,
): SessionEntry | undefined {
  const target = toRef(ref);
  const matches = session.entries.filter((e) => matchesExercise(refOfEntry(e), target));
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];
  return {
    exerciseId: matches[0].exerciseId,
    exerciseName: matches[0].exerciseName,
    sets: matches.flatMap((e) => e.sets),
  };
}

export function findPreviousSession(
  sessions: Session[],
  ref: string | ExerciseRef,
  options: { beforeDate?: string; maxDate?: string; excludeId?: string } = {},
): Session | undefined {
  const target = toRef(ref);
  const { beforeDate, maxDate, excludeId } = options;
  const candidates = sessions
    .filter(
      (s) =>
        s.status === 'completed' &&
        s.id !== excludeId &&
        (beforeDate === undefined || s.date < beforeDate) &&
        (maxDate === undefined || s.date <= maxDate),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return candidates.find((s) => {
    const entry = findEntry(s, target);
    return entry !== undefined && entry.sets.some((set) => set.done);
  });
}
