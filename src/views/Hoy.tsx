// Pantalla "Hoy": día sugerido, reanudar sesión, estadísticas y últimas sesiones.

import { useState } from 'preact/hooks';
import { navigate } from '../router';
import {
  startFreeSession,
  startSessionFromDay,
  useStore,
} from '../state';
import { suggestDay } from '../services/suggestDay';
import { fmtDate, fmtDateLong, greeting, fmtVolume, todayISO } from '../services/format';
import { sessionsInLast, streak, volumeInLast, setsCount } from '../services/stats';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function Hoy() {
  const s = useStore();
  const [pending, setPending] = useState<'day' | 'free' | null>(null);

  const active =
    s.routines.find((r) => r.id === s.settings.activeRoutineId && !r.archived) ??
    s.routines.find((r) => !r.archived);
  const day = active ? suggestDay(active, s.sessions) : undefined;
  const inProgress = s.sessions.find((x) => x.status === 'in-progress');
  const recent = s.sessions.filter((x) => x.status === 'completed').slice(0, 5);

  const sesiones30 = sessionsInLast(s.sessions, 30).length;
  const volumen30 = volumeInLast(s.sessions, 30);
  const racha = streak(s.sessions);

  const beginSessionNow = (target: 'day' | 'free') => {
    if (target === 'free') {
      startFreeSession();
      navigate('/sesion');
      return;
    }
    if (!active || !day) return;
    startSessionFromDay(active, day);
    navigate('/sesion');
  };

  const requestBegin = (target: 'day' | 'free') => {
    if (inProgress) {
      setPending(target);
      return;
    }
    beginSessionNow(target);
  };

  const handleConfirmNew = () => {
    const target = pending ?? 'day';
    setPending(null);
    beginSessionNow(target);
  };

  return (
    <>
      <header class="view-head">
        <h1>
          {greeting()}
          <span class="sub">{fmtDateLong(todayISO())}</span>
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

      {inProgress && (
        <div class="section-title">En curso</div>
      )}
      {inProgress && (
        <div class="card">
          <div class="card-title">
            🏃 {inProgress.dayName} <span class="chip chip--accent">sin finalizar</span>
          </div>
          <p class="card-sub">
            Empezada {fmtDate(inProgress.date)} · {setsCount(inProgress)} series
          </p>
          <div class="routine-actions">
            <button class="btn btn-primary btn-block" onClick={() => navigate('/sesion')}>
              Reanudar entrenamiento
            </button>
          </div>
        </div>
      )}

      <div class="section-title">Siguiente entrenamiento</div>

      {active && day ? (
        <div class="card">
          <div class="card-title">
            🎯 {day.name}
            {active && <span class="chip">{active.name}</span>}
          </div>
          <p class="card-sub">
            {day.exercises.length === 0
              ? 'Este día todavía no tiene ejercicios.'
              : `${day.exercises.length} ejercicios · ${day.exercises.reduce(
                  (a, e) => a + e.plannedSets.length,
                  0,
                )} series planeadas`}
          </p>

          {day.exercises.length > 0 && (
            <ul class="day-preview">
              {day.exercises.slice(0, 6).map((ex) => (
                <li key={ex.id}>
                  <b>{ex.name}</b>
                  <span class="sets-n">
                    {ex.plannedSets
                      .map((p) => `${p.weight !== undefined ? p.weight : '—'}×${p.reps}`)
                      .join(', ')}
                  </span>
                </li>
              ))}
              {day.exercises.length > 6 && (
                <li>
                  <span>…y {day.exercises.length - 6} más</span>
                </li>
              )}
            </ul>
          )}

          <div class="routine-actions" style="margin-top:16px">
            <button
              class="btn btn-primary btn-lg btn-block"
              disabled={day.exercises.length === 0}
              onClick={() => requestBegin('day')}
            >
              Empezar {day.name}
            </button>
            <button
              class="btn btn-block"
              onClick={() => requestBegin('free')}
            >
              Sesión libre (sin rutina)
            </button>
          </div>
        </div>
      ) : (
        <div class="card">
          <div class="empty" style="padding:18px 8px">
            <span class="empty-ico">📋</span>
            <h3>Crea tu primera rutina</h3>
            <p>Define tus días, ejercicios y las series con su peso y repeticiones.</p>
            <button class="btn btn-primary" onClick={() => navigate('/rutinas')}>
              Ir a Rutinas
            </button>
          </div>
        </div>
      )}

      <div class="section-title">Últimas sesiones</div>
      {recent.length === 0 ? (
        <p class="hint">Aún no has completado ninguna sesión.</p>
      ) : (
        recent.map((ses) => (
          <button
            key={ses.id}
            class="list-item"
            onClick={() => navigate(`/historial/${ses.id}`)}
          >
            <div class="list-date">
              <div class="d">{ses.date.slice(8, 10)}</div>
              <div class="w">{fmtDate(ses.date).split(' ')[1]}</div>
            </div>
            <div class="list-body">
              <div class="title">{ses.dayName}</div>
              <div class="sub">
                {ses.entries.length} ejercicios · {setsCount(ses)} series
              </div>
            </div>
            <span class="list-arrow">›</span>
          </button>
        ))
      )}

      <ConfirmDialog
        open={pending !== null}
        title="Ya hay un entrenamiento en curso"
        message={`"${inProgress?.dayName}" se cerrará como completada para empezar el nuevo. ¿Continuar?`}
        confirmLabel="Empezar otro"
        onConfirm={handleConfirmNew}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
