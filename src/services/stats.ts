// Métricas sencillas: volumen, racha y sesiones recientes.

import type { Session } from '../models';
import { daysBetween, todayISO } from './format';

/** Volumen de una sesión: Σ peso × reps de las series marcadas como hechas. */
export function volumeOf(session: Session): number {
  let total = 0;
  for (const entry of session.entries) {
    for (const set of entry.sets) {
      if (set.done) total += set.weight * set.reps;
    }
  }
  return total;
}

/** Nº total de series de una sesión. */
export function setsCount(session: Session): number {
  return session.entries.reduce((acc, e) => acc + e.sets.length, 0);
}

/** Nº de series marcadas como hechas. */
export function doneSetsCount(session: Session): number {
  return session.entries.reduce(
    (acc, e) => acc + e.sets.filter((s) => s.done).length,
    0,
  );
}

/** Sesiones completadas de los últimos `days` días (incluye hoy). */
export function sessionsInLast(sessions: Session[], days: number): Session[] {
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromISO = todayISO(from);
  return sessions.filter((s) => s.status === 'completed' && s.date >= fromISO);
}

/** Volumen total de los últimos `days` días. */
export function volumeInLast(sessions: Session[], days: number): number {
  return sessionsInLast(sessions, days).reduce((acc, s) => acc + volumeOf(s), 0);
}

/**
 * Racha de días consecutivos entrenados.
 * La racha vive si entrenaste hoy o ayer; si no, vale 0.
 */
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
