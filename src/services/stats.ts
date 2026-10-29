import type { Session } from '../models';
import { daysBetween, todayISO } from './format';

export function volumeOf(session: Session): number {
  let total = 0;
  for (const entry of session.entries) {
    for (const set of entry.sets) {
      if (set.done && set.durationSec === undefined) {
        total += set.weight * (set.repsMax ?? set.reps);
      }
    }
  }
  return total;
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

export function volumeInLast(sessions: Session[], days: number): number {
  return sessionsInLast(sessions, days).reduce((acc, s) => acc + volumeOf(s), 0);
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
