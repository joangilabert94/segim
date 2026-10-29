import type { PerformedSet, Session, Unit } from '../models';
import { fmtVolume, fmtWeight } from './format';
import { compareLoad, fmtLoadUnit, type LoadProfile, type ProfileLookup } from './load';
import { findEntry, matchesExercise, refOfEntry, type ExerciseRef } from './previousSession';
import { e1rmOf } from './progression';
import { setsVolume } from './stats';

export type RecordKind = 'weight' | 'e1rm' | 'reps' | 'volume';

export interface ExerciseRecord {
  exerciseId?: string;
  exerciseName: string;
  kind: RecordKind;
  value: number;
  previous: number;
  /** Carga de la serie del récord de reps. */
  weight?: number;
}

const liftedSets = (sets: PerformedSet[]) =>
  sets.filter((set) => set.done && set.durationSec === undefined);

function hardest(sets: PerformedSet[], profile: LoadProfile): number | undefined {
  return sets.reduce<number | undefined>(
    (best, set) =>
      best === undefined || compareLoad(set.weight, best, profile) > 0 ? set.weight : best,
    undefined,
  );
}

function maxOf(values: (number | undefined)[]): number | undefined {
  return values.reduce<number | undefined>(
    (max, value) => (value !== undefined && (max === undefined || value > max) ? value : max),
    undefined,
  );
}

function exerciseRecords(
  ref: ExerciseRef,
  current: PerformedSet[],
  earlier: Session[],
  profile: LoadProfile,
): Omit<ExerciseRecord, 'exerciseId' | 'exerciseName'>[] {
  const now = liftedSets(current);
  const pastEntries = earlier.flatMap((s) => {
    const entry = findEntry(s, ref);
    return entry ? [entry.sets] : [];
  });
  const past = pastEntries.flatMap(liftedSets);
  if (now.length === 0 || past.length === 0) return [];

  const records: Omit<ExerciseRecord, 'exerciseId' | 'exerciseName'>[] = [];

  const weight = hardest(now, profile);
  const previousWeight = hardest(past, profile);
  if (
    weight !== undefined &&
    previousWeight !== undefined &&
    compareLoad(weight, previousWeight, profile) > 0
  ) {
    records.push({ kind: 'weight', value: weight, previous: previousWeight });
  }

  const e1rm = maxOf(now.map((set) => e1rmOf(set, profile)));
  const previousE1rm = maxOf(past.map((set) => e1rmOf(set, profile)));
  if (e1rm !== undefined && previousE1rm !== undefined && e1rm > previousE1rm + 1e-9) {
    records.push({ kind: 'e1rm', value: e1rm, previous: previousE1rm });
  }

  // Solo con un peso ya levantado antes: si es nuevo, el récord es el de peso.
  let repsRecord: Omit<ExerciseRecord, 'exerciseId' | 'exerciseName'> | undefined;
  for (const set of now) {
    const previousReps = maxOf(
      past.filter((p) => compareLoad(p.weight, set.weight, profile) >= 0).map((p) => p.reps),
    );
    if (previousReps === undefined || set.reps <= previousReps) continue;
    if (
      !repsRecord ||
      compareLoad(set.weight, repsRecord.weight as number, profile) > 0 ||
      (set.weight === repsRecord.weight && set.reps > repsRecord.value)
    ) {
      repsRecord = { kind: 'reps', value: set.reps, previous: previousReps, weight: set.weight };
    }
  }
  if (repsRecord) records.push(repsRecord);

  const volume = setsVolume(current, profile);
  const previousVolume = maxOf(pastEntries.map((sets) => setsVolume(sets, profile)));
  if (volume !== undefined && previousVolume !== undefined && volume > previousVolume) {
    records.push({ kind: 'volume', value: volume, previous: previousVolume });
  }
  return records;
}

/**
 * Récords de una sesión contra todas las completadas anteriores (o del mismo
 * día). La primera vez que se hace un ejercicio no hay récord.
 */
export function sessionRecords(
  session: Session,
  sessions: Session[],
  profileOf: ProfileLookup,
): ExerciseRecord[] {
  const earlier = sessions.filter(
    (s) => s.status === 'completed' && s.id !== session.id && s.date <= session.date,
  );
  const seen: ExerciseRef[] = [];
  const records: ExerciseRecord[] = [];
  for (const entry of session.entries) {
    const ref = refOfEntry(entry);
    if (seen.some((other) => matchesExercise(other, ref))) continue;
    seen.push(ref);
    const combined = findEntry(session, ref);
    if (!combined) continue;
    for (const record of exerciseRecords(ref, combined.sets, earlier, profileOf(entry.exerciseId))) {
      records.push({ exerciseId: entry.exerciseId, exerciseName: entry.exerciseName, ...record });
    }
  }
  return records;
}

export function describeRecord(
  record: ExerciseRecord,
  profile: LoadProfile,
  unit: Unit,
): { label: string; value: string; previous: string } {
  const load = (weight: number) => fmtLoadUnit(weight, profile, unit);
  switch (record.kind) {
    case 'weight':
      return {
        label:
          profile.load === 'assisted'
            ? 'Menos asistencia'
            : profile.load === 'bodyweight'
              ? 'Más lastre'
              : 'Peso máximo',
        value: load(record.value),
        previous: load(record.previous),
      };
    case 'e1rm':
      return {
        label: '1RM estimado',
        value: `${fmtWeight(Math.round(record.value * 10) / 10)} ${unit}`,
        previous: `${fmtWeight(Math.round(record.previous * 10) / 10)} ${unit}`,
      };
    case 'reps':
      return {
        label: 'Más reps',
        value: `${record.value} × ${load(record.weight ?? 0)}`,
        previous: `${record.previous}`,
      };
    case 'volume':
      return {
        label: 'Volumen',
        value: fmtVolume(record.value, unit),
        previous: fmtVolume(record.previous, unit),
      };
  }
}
