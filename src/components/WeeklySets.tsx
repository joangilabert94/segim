import { useState } from 'preact/hooks';
import type { Exercise, Session } from '../models';
import { fmtDate, plural, todayISO } from '../services/format';
import { addDays, weekStart, weeklySetsByGroup } from '../services/weeklyVolume';

interface Props {
  sessions: Session[];
  exercises: Exercise[];
}

export function WeeklySets({ sessions, exercises }: Props) {
  const thisWeek = weekStart(todayISO());
  const [week, setWeek] = useState(thisWeek);
  const rows = weeklySetsByGroup(sessions, exercises, week);
  const max = Math.max(1, ...rows.map((row) => Math.max(row.sets, row.previous)));
  const total = rows.reduce((sum, row) => sum + row.sets, 0);
  const title =
    week === thisWeek
      ? 'Esta semana'
      : week === addDays(thisWeek, -7)
        ? 'Semana pasada'
        : `Semana del ${fmtDate(week)}`;

  return (
    <div class="card">
      <div class="weekly-head">
        <button
          class="icon-btn"
          aria-label="Semana anterior"
          onClick={() => setWeek(addDays(week, -7))}
        >
          ‹
        </button>
        <div class="weekly-title">
          <b>{title}</b>
          <span>
            {fmtDate(week)} – {fmtDate(addDays(week, 6))} · {plural(total, 'serie', 'series')}
          </span>
        </div>
        <button
          class="icon-btn"
          aria-label="Semana siguiente"
          disabled={week >= thisWeek}
          onClick={() => setWeek(addDays(week, 7))}
        >
          ›
        </button>
      </div>
      {rows.length === 0 ? (
        <p class="hint">Sin series hechas esta semana ni la anterior.</p>
      ) : (
        <ul class="weekly-list">
          {rows.map((row) => {
            const delta = row.sets - row.previous;
            return (
              <li key={row.group}>
                <span class="weekly-group">{row.group}</span>
                <span class="weekly-bar">
                  <span style={`width:${(row.sets / max) * 100}%`} />
                </span>
                <b class="weekly-n">{row.sets}</b>
                <span class="weekly-delta">
                  {delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '='}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p class="hint" style="margin-top:10px">
        Series hechas de lunes a domingo y diferencia con la semana anterior. El grupo es el del
        ejercicio en el catálogo.
      </p>
    </div>
  );
}
