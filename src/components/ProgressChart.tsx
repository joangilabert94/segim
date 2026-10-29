import { fmtDate, fmtDuration, plural } from '../services/format';
import {
  fmtMetricValue,
  metricSeries,
  type ProgressMetric,
  type ProgressPoint,
} from '../services/progression';

const W = 320;
const H = 152;
const PAD = { left: 38, right: 10, top: 12, bottom: 24 };

function axisLabel(value: number, metric: ProgressMetric): string {
  if (metric === 'duration') return fmtDuration(Math.round(value));
  return `${Math.round(value)}`;
}

interface Props {
  points: ProgressPoint[];
  metric: ProgressMetric;
  unit: string;
  label: string;
}

export function ProgressChart({ points, metric, unit, label }: Props) {
  const data = metricSeries(points, metric);
  if (data.length === 0) return null;

  const values = data.map((d) => d.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const span = dataMax - dataMin;
  const pad = span > 0 ? span * 0.18 : Math.max(1, Math.abs(dataMax) * 0.06);
  const lo = dataMin - pad;
  const hi = dataMax + pad;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = data.length;
  const xAt = (i: number) =>
    n === 1 ? PAD.left + innerW / 2 : PAD.left + (i * innerW) / (n - 1);
  const yAt = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * innerH;

  const xs = data.map((_, i) => xAt(i));
  const ys = data.map((d) => yAt(d.value));
  const line = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');

  const grid = [hi, (hi + lo) / 2, lo].map((v) => ({ v, y: yAt(v) }));

  const first = data[0];
  const last = data[n - 1];
  const aria =
    n === 1
      ? `${label}: ${metric} ${fmtMetricValue(first.value, metric, unit)} el ${fmtDate(first.date)}`
      : `${label}: de ${fmtMetricValue(first.value, metric, unit)} el ${fmtDate(first.date)} a ${fmtMetricValue(last.value, metric, unit)} el ${fmtDate(last.date)}, en ${plural(n, 'sesión', 'sesiones')}`;

  return (
    <svg
      class="chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={aria}
      preserveAspectRatio="xMidYMid meet"
    >
      {grid.map((g, i) => (
        <g key={`g${i}`}>
          <line
            class="chart-grid"
            x1={PAD.left}
            x2={W - PAD.right}
            y1={g.y}
            y2={g.y}
          />
          <text
            class="chart-axis-label"
            x={PAD.left - 6}
            y={g.y + 3.5}
            textAnchor="end"
          >
            {axisLabel(g.v, metric)}
          </text>
        </g>
      ))}

      {n >= 2 && (
        <polygon
          class="chart-area"
          points={`${line} ${xs[n - 1]},${PAD.top + innerH} ${xs[0]},${PAD.top + innerH}`}
        />
      )}

      <polyline class="chart-line" points={line} />

      {xs.map((x, i) => (
        <circle
          key={`${data[i].date}-${i}`}
          class={i === n - 1 ? 'chart-dot chart-dot-last' : 'chart-dot'}
          cx={x}
          cy={ys[i]}
          r={i === n - 1 ? 4.5 : 3}
        />
      ))}

      <text
        class="chart-axis-label"
        x={xs[0]}
        y={H - 7}
        textAnchor={n === 1 ? 'middle' : 'start'}
      >
        {fmtDate(first.date)}
      </text>
      {n >= 2 && (
        <text class="chart-axis-label" x={xs[n - 1]} y={H - 7} textAnchor="end">
          {fmtDate(last.date)}
        </text>
      )}
    </svg>
  );
}
