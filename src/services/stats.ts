import type { PerformedSet, Session } from '../models';
import { daysBetween, todayISO } from './format';
import { EXTERNAL_LOAD, effectiveLoad, type LoadProfile, type ProfileLookup } from './load';

const externalOnly: ProfileLookup = () => EXTERNAL_LOAD;

/** kg × reps de las series hechas; undefined si alguna no tiene carga conocida. */
export function setsVolume(sets: PerformedSet[], profile: LoadProfile): number | undefined {
  let total = 0;
  for (const set of sets) {
    if (!set.done || set.durationSec !== undefined) continue;
    const load = effectiveLoad(set.weight, profile);
    if (load === undefined) return undefined;
    total += load * (set.repsMax ?? set.reps) * (profile.unilateral ? 2 : 1);
  }
  return total;
}

export function volumeOf(session: Session, profileOf: ProfileLookup = externalOnly): number {
  return session.entries.reduce(
    (total, entry) => total + (setsVolume(entry.sets, profileOf(entry.exerciseId)) ?? 0),
    0,
  );
}

export function setsCount(session: Session): number {
  return session.entries.reduce((acc, e) => acc + e.sets.length, 0);
}

export function doneSetsCount(session: Session): number {
  return session.entries.reduce(
    (acc, e) => acc + e.sets.filter((s) => s.done).length,
    0,
  );
}

export function sessionsInLast(sessions: Session[], days: number): Session[] {
  const from = new Date();
  // Hoy cuenta como día 1: "30 días" debe abarcar exactamente 30 fechas, no 31.
  from.setDate(from.getDate() - (days - 1));
  const fromISO = todayISO(from);
  return sessions.filter((s) => s.status === 'completed' && s.date >= fromISO);
}

export function volumeInLast(
  sessions: Session[],
  days: number,
  profileOf: ProfileLookup = externalOnly,
): number {
  return sessionsInLast(sessions, days).reduce((acc, s) => acc + volumeOf(s, profileOf), 0);
}

export function streak(sessions: Session[]): number {
  const dates = [
    ...new Set(
      sessions.filter((s) => s.status === 'completed').map((s) => s.date),
    ),
  ].sort().reverse();

  if (dates.length === 0) return 0;

  const today = todayISO();
  if (daysBetween(dates[0], today) > 1) return 0;

  let count = 1;
  let cursor = dates[0];
  for (let i = 1; i < dates.length; i++) {
    if (daysBetween(dates[i], cursor) === 1) {
      count++;
      cursor = dates[i];
    } else {
      break;
    }
  }
  return count;
}
