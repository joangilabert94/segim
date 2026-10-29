import { describe, expect, it } from 'vitest';
import type { PerformedSet, Session } from '../src/models';
import {
  availableMetrics,
  defaultMetric,
  e1rmOf,
  fmtMetricValue,
  metricSeries,
  progressSeries,
} from '../src/services/progression';

function makeSession(over: Partial<Session>): Session {
  return {
    id: 's1',
    date: '2026-09-28',
    dayName: 'Día 1',
    status: 'completed',
    entries: [],
    ...over,
  };
}

function makeSet(over: Partial<PerformedSet> = {}): PerformedSet {
  return { weight: 100, reps: 10, done: true, ...over };
}

function sessionWith(
  id: string,
  date: string,
  sets: PerformedSet[],
  over: Partial<Session> = {},
): Session {
  return makeSession({
    id,
    date,
    entries: [
      {
        exerciseId: 'ex-press',
        exerciseName: 'Press banca',
        sets,
      },
    ],
    ...over,
  });
}

const REF = { exerciseId: 'ex-press', name: 'Press banca' };

describe('e1rmOf — fórmula de Epley', () => {
  it('peso × (1 + reps/30)', () => {
    expect(e1rmOf({ weight: 100, reps: 10 })).toBeCloseTo(133.333, 2);
    expect(e1rmOf({ weight: 60, reps: 0 })).toBe(60);
    expect(e1rmOf({ weight: 90, reps: 5 })).toBeCloseTo(105, 5);
  });

  it('series cronometradas: sin 1RM', () => {
    expect(e1rmOf({ weight: 20, reps: 10, durationSec: 30 })).toBeUndefined();
  });

  it('sin carga externa (peso 0): sin 1RM', () => {
    expect(e1rmOf({ weight: 0, reps: 12 })).toBeUndefined();
  });
});

describe('progressSeries', () => {
  it('una punto por sesión, en orden cronológico ascendente', () => {
    const sessions = [
      sessionWith('s3', '2026-10-10', [makeSet({ weight: 110, reps: 8 })]),
      sessionWith('s1', '2026-09-28', [makeSet({ weight: 100, reps: 10 })]),
      sessionWith('s2', '2026-10-03', [makeSet({ weight: 105, reps: 9 })]),
    ];
    const points = progressSeries(sessions, REF);
    expect(points.map((p) => p.date)).toEqual([
      '2026-09-28',
      '2026-10-03',
      '2026-10-10',
    ]);
    expect(points[0].e1rm).toBeCloseTo(133.333, 2);
    expect(points[2].weight).toBe(110);
  });

  it('ignora sesiones en curso y series no marcadas como hechas', () => {
    const sessions = [
      sessionWith('s1', '2026-09-28', [makeSet({ done: false })]),
      sessionWith('s2', '2026-10-03', [makeSet({ done: false })], {
        status: 'in-progress',
      }),
      sessionWith('s3', '2026-10-10', [makeSet({ weight: 100, reps: 10 })]),
    ];
    const points = progressSeries(sessions, REF);
    expect(points).toHaveLength(1);
    expect(points[0].date).toBe('2026-10-10');
  });

  it('el mejor valor de cada sesión (no la primera serie)', () => {
    const points = progressSeries(
      [
        sessionWith('s1', '2026-09-28', [
          makeSet({ weight: 100, reps: 8 }),
          makeSet({ weight: 100, reps: 10 }),
          makeSet({ weight: 95, reps: 12 }),
        ]),
      ],
      REF,
    );
    expect(points).toHaveLength(1);
    expect(points[0].e1rm).toBeCloseTo(133.333, 2);
    expect(points[0].weight).toBe(100);
    expect(points[0].reps).toBe(12);
  });

  it('identidad: id del catálogo aunque el nombre cambie; si no, nombre normalizado', () => {
    const sessions = [
      sessionWith('s1', '2026-09-28', [makeSet({ weight: 100, reps: 10 })]),
      makeSession({
        id: 's2',
        date: '2026-10-05',
        entries: [
          {
            exerciseName: 'Press  banca',
            sets: [makeSet({ weight: 90, reps: 10 })],
          },
        ],
      }),
    ];
    const byId = progressSeries(sessions, { exerciseId: 'ex-press', name: 'Otro' });
    expect(byId.map((p) => p.date)).toEqual(['2026-09-28']);

    const byName = progressSeries(sessions, { name: 'press banca' });
    expect(byName.map((p) => p.date)).toEqual(['2026-09-28', '2026-10-05']);
  });

  it('series cronometradas aportan durationSec y nunca e1RM ni peso', () => {
    const points = progressSeries(
      [
        sessionWith('s1', '2026-09-28', [
          makeSet({ weight: 0, reps: 0, durationSec: 30 }),
          makeSet({ weight: 0, reps: 0, durationSec: 45 }),
        ]),
      ],
      REF,
    );
    expect(points).toHaveLength(1);
    expect(points[0].durationSec).toBe(45);
    expect(points[0].e1rm).toBeUndefined();
    expect(points[0].weight).toBeUndefined();
    expect(points[0].reps).toBeUndefined();
  });

  it('una sesión sin series hechas del ejercicio no aporta punto', () => {
    const points = progressSeries(
      [
        sessionWith('s1', '2026-09-28', [makeSet({ done: false })]),
        makeSession({ id: 's2', date: '2026-10-03' }),
        sessionWith('s3', '2026-10-10', [makeSet({ weight: 100, reps: 10 })]),
      ],
      REF,
    );
    expect(points.map((p) => p.date)).toEqual(['2026-10-10']);
  });
});

describe('fmtMetricValue', () => {
  it('usa coma decimal y la unidad', () => {
    expect(fmtMetricValue(133.33, 'e1rm', 'kg')).toBe('133,3 kg');
    expect(fmtMetricValue(120, 'weight', 'lb')).toBe('120 lb');
  });

  it('tiempo y reps sin decimales', () => {
    expect(fmtMetricValue(90, 'duration', 'kg')).toBe('1:30');
    expect(fmtMetricValue(12, 'reps', 'kg')).toBe('12');
  });
});

describe('métricas disponibles', () => {
  const weighted = progressSeries(
    [sessionWith('s1', '2026-09-28', [makeSet({ weight: 100, reps: 10 })])],
    REF,
  );
  const timed = progressSeries(
    [
      sessionWith('s1', '2026-09-28', [
        makeSet({ weight: 0, reps: 0, durationSec: 30 }),
      ]),
    ],
    REF,
  );

  it('con carga hay 1RM y peso; por defecto 1RM', () => {
    expect(availableMetrics(weighted)).toEqual(['e1rm', 'weight', 'reps']);
    expect(defaultMetric(weighted)).toBe('e1rm');
  });

  it('solo cronometradas: tiempo y por defecto duration', () => {
    expect(availableMetrics(timed)).toEqual(['duration']);
    expect(defaultMetric(timed)).toBe('duration');
  });

  it('sin datos: sin métricas', () => {
    expect(availableMetrics([])).toEqual([]);
    expect(defaultMetric([])).toBeUndefined();
  });

  it('metricSeries omite los puntos sin dato de la métrica', () => {
    const series = metricSeries(
      [
        { date: '2026-09-28', e1rm: 133 },
        { date: '2026-10-05', durationSec: 45 },
        { date: '2026-10-12', e1rm: 140 },
      ],
      'e1rm',
    );
    expect(series).toEqual([
      { date: '2026-09-28', value: 133 },
      { date: '2026-10-12', value: 140 },
    ]);
  });
});
