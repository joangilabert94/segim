// Historial de sesiones agrupado por mes, con estadísticas de cabecera.

import { navigate } from '../router';
import { useStore } from '../state';
import { fmtDate, fmtMonth, fmtVolume, fmtWeekday, parseISODate } from '../services/format';
import { setsCount, sessionsInLast, streak, volumeInLast, volumeOf } from '../services/stats';

export function History() {
  const s = useStore();
  const sessions = s.sessions;

  const sesiones30 = sessionsInLast(sessions, 30).length;
  const volumen30 = volumeInLast(sessions, 30);
  const racha = streak(sessions);

  // Agrupación por mes, conservando el orden (sesiones ya ordenadas desc)
  const groups: { label: string; items: typeof sessions }[] = [];
  for (const ses of sessions) {
    const label = fmtMonth(ses.date);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(ses);
    else groups.push({ label, items: [ses] });
  }

  return (
    <>
      <header class="view-head">
        <h1>
          Historial
          <span class="sub">{sessions.length} sesiones guardadas</span>
        </h1>
      </header>

      <div class="stats-row">
        <div class="stat">
          <div class="stat-value">{racha}</div>
          <div class="stat-label">Racha</div>
        </div>
        <div class="stat">
          <div class="stat-value">{sesiones30}</div>
          <div class="stat-label">30 días</div>
        </div>
        <div class="stat">
          <div class="stat-value">{fmtVolume(volumen30, s.settings.unit).split(' ')[0]}</div>
          <div class="stat-label">Volumen 30 d</div>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div class="empty">
          <span class="empty-ico">📈</span>
          <h3>Aún no hay sesiones</h3>
          <p>Cuando termines tu primer entrenamiento aparecerá aquí con su fecha.</p>
          <button class="btn btn-primary" onClick={() => navigate('/')}>
            Ir a Hoy
          </button>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.label}>
            <div class="month-label">{group.label}</div>
            {group.items.map((ses) => {
              const d = parseISODate(ses.date);
              return (
                <button
                  key={ses.id}
                  class="list-item"
                  onClick={() => navigate(`/historial/${ses.id}`)}
                >
                  <div class="list-date">
                    <div class="d">{d.getDate()}</div>
                    <div class="w">{fmtWeekday(ses.date)}</div>
                  </div>
                  <div class="list-body">
                    <div class="title">
                      {ses.dayName}
                      {ses.status === 'in-progress' && (
                        <span class="chip chip--accent" style="margin-left:8px">
                          en curso
                        </span>
                      )}
                    </div>
                    <div class="sub">
                      {fmtDate(ses.date)} · {ses.entries.length} ejercicios ·{' '}
                      {setsCount(ses)} series
                      {ses.status === 'completed' &&
                        ` · ${fmtVolume(volumeOf(ses), s.settings.unit)}`}
                    </div>
                  </div>
                  <span class="list-arrow">›</span>
                </button>
              );
            })}
          </section>
        ))
      )}
    </>
  );
}
