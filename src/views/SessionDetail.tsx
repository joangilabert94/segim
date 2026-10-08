// Detalle de una sesión del historial: series, notas, métricas, editar y eliminar.

import { useState } from 'preact/hooks';
import { navigate } from '../router';
import { deleteSession, reopenSession, setSessionDate, useStore } from '../state';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { fmtDateLong, fmtReps, fmtVolume } from '../services/format';
import { doneSetsCount, setsCount, volumeOf } from '../services/stats';

export function SessionDetail({ id }: { id: string }) {
  const s = useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const session = s.sessions.find((x) => x.id === id);

  if (!session) {
    return (
      <div class="empty">
        <span class="empty-ico">🔍</span>
        <h3>Sesión no encontrada</h3>
        <button class="btn btn-primary" onClick={() => navigate('/historial')}>
          Volver al historial
        </button>
      </div>
    );
  }

  const routine = session.routineId
    ? s.routines.find((r) => r.id === session.routineId)
    : undefined;

  const edit = () => {
    reopenSession(session.id);
    navigate('/sesion');
  };

  const remove = () => {
    deleteSession(session.id);
    navigate('/historial');
  };

  return (
    <>
      <header class="view-head">
        <button class="back-btn" aria-label="Volver" onClick={() => navigate('/historial')}>
          ←
        </button>
        <h1>
          {session.dayName}
          <span class="sub">
            {fmtDateLong(session.date)}
            {routine ? ` · ${routine.name}` : ''}
            {session.status === 'in-progress' ? ' · en curso' : ''}
          </span>
        </h1>
      </header>

      <div class="stats-row">
        <div class="stat">
          <div class="stat-value">{session.entries.length}</div>
          <div class="stat-label">Ejercicios</div>
        </div>
        <div class="stat">
          <div class="stat-value">
            {doneSetsCount(session)}/{setsCount(session)}
          </div>
          <div class="stat-label">Series</div>
        </div>
        <div class="stat">
          <div class="stat-value">
            {fmtVolume(volumeOf(session), s.settings.unit).split(' ')[0]}
          </div>
          <div class="stat-label">Volumen {s.settings.unit}</div>
        </div>
      </div>

      {/* Fecha de realización editable: la sesión no guarda duración,
          así que la fecha es lo único que define cuándo se entrenó. */}
      <div class="card" style="margin-top:14px">
        <label class="field" for="session-date">
          <span class="field-label">Fecha de realización</span>
          <input
            id="session-date"
            class="input"
            type="date"
            value={session.date}
            onChange={(e) => setSessionDate(session.id, e.currentTarget.value)}
          />
        </label>
        <p class="hint" style="margin-top:8px">
          ¿La hiciste otro día? Corrígela aquí y el historial se reordena solo.
        </p>
      </div>

      <div class="section-title">Ejercicios</div>

      {session.entries.map((entry, ei) => (
        <div class="entry-block" key={ei}>
          <h3>{entry.exerciseName}</h3>
          <ul class="entry-sets">
            {entry.sets.map((set, si) => (
              <li key={si}>
                <span>
                  Serie {si + 1}
                  {set.extra && <span class="tag-extra"> extra</span>}
                </span>
                <span>
                  <b>
                    {set.weight} {s.settings.unit} ×{' '}
                    {set.durationSec !== undefined
                      ? `${set.durationSec} s`
                      : fmtReps(set.reps, set.repsMax)}
                  </b>{' '}
                  <span class={set.done ? 'ok' : ''}>{set.done ? '✓' : '—'}</span>
                  {set.note && <span title={set.note}> ✎</span>}
                </span>
              </li>
            ))}
          </ul>
          {entry.sets.some((x) => x.note) && (
            <div class="entry-note">
              {entry.sets
                .map((x, i) => (x.note ? `Serie ${i + 1}: ${x.note}` : null))
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
          {entry.note && <div class="entry-note">✎ {entry.note}</div>}
        </div>
      ))}

      <div class="btn-row" style="margin-top:18px">
        <button class="btn" style="flex:1" onClick={edit}>
          ✏️ Editar
        </button>
        <button class="btn btn-danger" style="flex:1" onClick={() => setConfirmDelete(true)}>
          🗑 Eliminar
        </button>
      </div>

      <p class="hint" style="margin-top:10px;text-align:center">
        Al editar se reabre la sesión como "en curso" y se cierra la que estuviera activa.
      </p>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar sesión"
        message={`Se borrará la sesión del ${fmtDateLong(session.date)}. No se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
