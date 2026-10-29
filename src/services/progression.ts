import type { Session } from '../models';
import { fmtDuration, fmtWeight } from './format';
import { findEntry, type ExerciseRef } from './previousSession';

export type ProgressMetric = 'e1rm' | 'weight' | 'duration' | 'reps';

export interface ProgressPoint {
  date: string;
  e1rm?: number;
  weight?: number;
  durationSec?: number;
  reps?: number;
}

const METRIC_ORDER: ProgressMetric[] = ['e1rm', 'weight', 'duration', 'reps'];

const FIELD_OF: Record<ProgressMetric, keyof ProgressPoint> = {
  e1rm: 'e1rm',
  weight: 'weight',
  duration: 'durationSec',
  reps: 'reps',
};

export const METRIC_LABELS: Record<ProgressMetric, string> = {
  e1rm: '1RM',
  weight: 'Peso',
  duration: 'Tiempo',
  reps: 'Reps',
};

export function e1rmOf(set: {
  weight: number;
  reps: number;
  durationSec?: number;
}): number | undefined {
  if (set.durationSec !== undefined) return undefined;
  if (!(set.weight > 0)) return undefined;
  // Fórmula de Epley.
  return set.weight * (1 + set.reps / 30);
}

export function progressSeries(
  sessions: Session[],
  ref: ExerciseRef,
): ProgressPoint[] {
  const completed = sessions
    .filter((s) => s.status === 'completed')
    .sort((a, b) => a.date.localeCompare(b.date));

  const points: ProgressPoint[] = [];
  for (const session of completed) {
    const entry = findEntry(session, ref);
    if (!entry) continue;

    let e1rm: number | undefined;
    let weight: number | undefined;
    let durationSec: number | undefined;
    let reps: number | undefined;

    for (const set of entry.sets) {
      if (!set.done) continue;
      const estimate = e1rmOf(set);
      if (estimate !== undefined && (e1rm === undefined || estimate > e1rm)) {
        e1rm = estimate;
      }
      if (set.durationSec !== undefined) {
        if (durationSec === undefined || set.durationSec > durationSec) {
          durationSec = set.durationSec;
        }
      } else {
        if (set.weight > 0 && (weight === undefined || set.weight > weight)) {
          weight = set.weight;
        }
        if (reps === undefined || set.reps > reps) reps = set.reps;
      }
    }

    const point: ProgressPoint = { date: session.date };
    if (e1rm !== undefined) point.e1rm = e1rm;
    if (weight !== undefined) point.weight = weight;
    if (durationSec !== undefined) point.durationSec = durationSec;
    if (reps !== undefined) point.reps = reps;
    if (
      e1rm === undefined &&
      weight === undefined &&
      durationSec === undefined &&
      reps === undefined
    ) {
      continue;
    }
    points.push(point);
  }
  return points;
}

export function availableMetrics(points: ProgressPoint[]): ProgressMetric[] {
  return METRIC_ORDER.filter((m) =>
    points.some((p) => p[FIELD_OF[m]] !== undefined),
  );
}

export function defaultMetric(points: ProgressPoint[]): ProgressMetric | undefined {
  return availableMetrics(points)[0];
}

export function metricSeries(
  points: ProgressPoint[],
  metric: ProgressMetric,
): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = [];
  const field = FIELD_OF[metric];
  for (const point of points) {
    const value = point[field];
    if (typeof value === 'number') out.push({ date: point.date, value });
  }
  return out;
}

export function fmtMetricValue(
  value: number,
  metric: ProgressMetric,
  unit: string,
): string {
  if (metric === 'duration') return fmtDuration(Math.round(value));
  if (metric === 'reps') return `${Math.round(value)}`;
  return `${fmtWeight(Math.round(value * 10) / 10)} ${unit}`;
}

export function fmtMetricDelta(
  delta: number,
  metric: ProgressMetric,
  unit: string,
): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '\u2212' : '';
  const abs = Math.abs(delta);
  const num =
    metric === 'duration' || metric === 'reps'
      ? `${Math.round(abs)}`
      : (Math.round(abs * 10) / 10).toLocaleString('es-ES');
  const suffix = metric === 'duration' ? ' s' : metric === 'reps' ? '' : ` ${unit}`;
  return `${sign}${num}${suffix}`;
}
