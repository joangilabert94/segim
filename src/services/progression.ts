// Progresión por ejercicio: 1RM estimado y serie temporal sesión a sesión,
// los datos que alimenta la gráfica de la pestaña Ejercicios.
// Solo cuentan sesiones COMPLETADAS y series marcadas como hechas.
// Identidad del ejercicio: la misma regla que el resto del historial
// (id del catálogo; si falta, nombre normalizado).

import type { Session } from '../models';
import { fmtDuration, fmtWeight } from './format';
import { findEntry, type ExerciseRef } from './previousSession';

/** Métricas que puede pintar la gráfica de progresión. */
export type ProgressMetric = 'e1rm' | 'weight' | 'duration' | 'reps';

/** Mejor valor de cada sesión: un punto por sesión con datos. */
export interface ProgressPoint {
  date: string; // YYYY-MM-DD de la sesión
  e1rm?: number; // mayor 1RM estimado de la sesión
  weight?: number; // mayor peso levantado (series con carga)
  durationSec?: number; // mayor duración (series cronometradas)
  reps?: number; // más reps conseguidas (series sin carga)
}

/** Orden canónico: así se elige la métrica por defecto y se listan las chips. */
const METRIC_ORDER: ProgressMetric[] = ['e1rm', 'weight', 'duration', 'reps'];

/** Campo del punto que almacena cada métrica (duration → durationSec). */
const FIELD_OF: Record<ProgressMetric, keyof ProgressPoint> = {
  e1rm: 'e1rm',
  weight: 'weight',
  duration: 'durationSec',
  reps: 'reps',
};

/** Etiqueta corta de cada métrica (chips y textos de la vista). */
export const METRIC_LABELS: Record<ProgressMetric, string> = {
  e1rm: '1RM',
  weight: 'Peso',
  duration: 'Tiempo',
  reps: 'Reps',
};

/**
 * 1RM estimado con la fórmula de Epley: peso × (1 + reps/30).
 * No aplica a series cronometradas (no tienen reps) ni sin carga externa
 * (peso 0: con solo peso corporal no hay 1RM que estimar).
 */
export function e1rmOf(set: {
  weight: number;
  reps: number;
  durationSec?: number;
}): number | undefined {
  if (set.durationSec !== undefined) return undefined;
  if (!(set.weight > 0)) return undefined;
  return set.weight * (1 + set.reps / 30);
}

/**
 * Serie temporal de un ejercicio: el mejor valor de cada sesión completada,
 * en orden cronológico ascendente. Las sesiones sin datos del ejercicio
 * (o sin ninguna serie hecha) no aportan punto.
 */
export function progressSeries(
  sessions: Session[],
  ref: ExerciseRef,
): ProgressPoint[] {
  const completed = sessions
    .filter((s) => s.status === 'completed')
    .sort((a, b) => a.date.localeCompare(b.date)); // orden estable: las mismas fechas conservan su orden

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

/** Métricas con al menos un dato, en orden canónico. */
export function availableMetrics(points: ProgressPoint[]): ProgressMetric[] {
  return METRIC_ORDER.filter((m) =>
    points.some((p) => p[FIELD_OF[m]] !== undefined),
  );
}

/** Métrica por defecto: la primera con datos (1RM → peso → tiempo → reps). */
export function defaultMetric(points: ProgressPoint[]): ProgressMetric | undefined {
  return availableMetrics(points)[0];
}

/**
 * Valores de una métrica con su fecha, en orden cronológico.
 * Los puntos sin dato de esa métrica se omiten (la línea no se rompe).
 */
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

/**
 * Valor de una métrica con formato: `133 kg` · `1:30` · `12`.
 * En la gráfica el eje muestra el número pelado; la unidad va en la cabecera.
 */
export function fmtMetricValue(
  value: number,
  metric: ProgressMetric,
  unit: string,
): string {
  if (metric === 'duration') return fmtDuration(Math.round(value));
  if (metric === 'reps') return `${Math.round(value)}`;
  return `${fmtWeight(Math.round(value * 10) / 10)} ${unit}`;
}

/**
 * Diferencia entre dos valores con signo: `+2,5 kg` · `−10 s` · `0 reps`.
 * Carga y 1RM con un decimal; tiempo y reps enteros.
 */
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
