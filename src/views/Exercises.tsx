// Pestaña Ejercicios: gestiona el catálogo con identidad estable (id).

import { useState } from 'preact/hooks';
import type { Exercise, PerformedSet } from '../models';
import {
  applyExerciseDefinition,
  deleteExerciseFromCatalog,
  ensureExercise,
  useStore,
} from '../state';
import { normalizeName } from '../services/previousSession';
import { bestOverallForExercise } from '../services/bestResults';
import {
  METRIC_LABELS,
  availableMetrics,
  defaultMetric,
  fmtMetricDelta,
  fmtMetricValue,
  metricSeries,
  progressSeries,
  type ProgressMetric,
} from '../services/progression';
import { fmtReps } from '../services/format';
import { BottomSheet } from '../components/BottomSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ProgressChart } from '../components/ProgressChart';

interface EditState {
  id?: string; // si existe, se renombra; si no, es uno nuevo
  name: string;
  muscleGroup: string;
}

const EMPTY: EditState = { name: '', muscleGroup: '' };

/** Subtítulo del valor grande del panel de progresión, por métrica. */
const METRIC_CAPTIONS: Record<ProgressMetric, string> = {
  e1rm: '1RM estimado · última sesión',
  weight: 'Peso máximo · última sesión',
  duration: 'Mejor tiempo · última sesión',
  reps: 'Máx. reps · última sesión',
};

/** Referencia más exigente de un ejercicio: `6 × 120 kg` o `45 s`. */
function fmtBest(best: PerformedSet, unit: string): string {
  const load = best.weight > 0 ? `${best.weight} ${unit}` : undefined;
  if (best.durationSec !== undefined) {
    return load ? `${load} × ${best.durationSec} s` : `${best.durationSec} s`;
  }
  const reps = fmtReps(best.reps, best.repsMax);
  return load ? `${reps} × ${load}` : `${reps} reps`;
}

export function Exercises() {
  const s = useStore();
  const [query, setQuery] = useState('');
  const [edit, setEdit] = useState<EditState | null>(null);
  const [toDelete, setToDelete] = useState<Exercise | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set()); // ejercicios con gráfica abierta (independientes)
  const [metric, setMetric] = useState<ProgressMetric>('e1rm'); // métrica elegida (si hay datos)

  const target = normalizeName(query);
  const list = s.exercises
    .filter((e) => target === '' || normalizeName(e.name).includes(target))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  /** Nº de rutinas (sin archivar) que usan un ejercicio. */
  const usage = (id: string) =>
    s.routines.reduce(
      (total, r) =>
        total +
        r.days.reduce(
          (n, d) => n + d.exercises.filter((e) => e.exerciseId === id).length,
          0,
        ),
      0,
    );

  const toggleOpen = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () => {
    if (!edit) return;
    const name = edit.name.trim();
    if (!name) return;
    if (edit.id) {
      applyExerciseDefinition(edit.id, {
        name,
        muscleGroup: edit.muscleGroup,
      });
    } else {
      ensureExercise(name, edit.muscleGroup);
    }
    setEdit(null);
  };

  return (
    <>
      <header class="view-head">
        <h1>
          Ejercicios
          <span class="sub">
            {s.exercises.length} en el catálogo · identidad por id
          </span>
        </h1>
        <button class="btn btn-primary" onClick={() => setEdit({ ...EMPTY })}>
          ＋ Nuevo
        </button>
      </header>

      <input
        class="input"
        placeholder="Buscar ejercicio…"
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
      />

      {s.exercises.length === 0 ? (
        <div class="empty">
          <span class="empty-ico">💪</span>
          <h3>El catálogo está vacío</h3>
          <p>
            Se rellena solo cuando creas rutinas, o puedes añadir ejercicios a mano. Se usa
            para autocompletar y para comparar sesiones por igualdad de id.
          </p>
          <button class="btn btn-primary" onClick={() => setEdit({ ...EMPTY })}>
            Crear ejercicio
          </button>
        </div>
      ) : list.length === 0 ? (
        <div class="empty">
          <span class="empty-ico">🔍</span>
          <h3>Sin resultados</h3>
          <p>No hay ejercicios que coincidan con «{query}».</p>
        </div>
      ) : (
        <div style="margin-top:12px">
          {list.map((ex) => {
            const ref = { exerciseId: ex.id, name: ex.name };
            const best = bestOverallForExercise(s.sessions, ref);
            const points = progressSeries(s.sessions, ref);
            const metrics = availableMetrics(points);
            // Métrica elegida si este ejercicio tiene datos de ella; si no, la por defecto.
            const active = metrics.includes(metric) ? metric : defaultMetric(points);
            const isOpen = openIds.has(ex.id);
            const e1rms = metricSeries(points, 'e1rm');
            const lastE1rm = e1rms[e1rms.length - 1];
            const serie = active !== undefined ? metricSeries(points, active) : [];
            const latest = serie[serie.length - 1];
            const prev = serie[serie.length - 2];
            const delta = prev && latest ? latest.value - prev.value : undefined;
            return (
            <div class="list-item has-panel" key={ex.id}>
              <div class="list-body">
                <button
                  type="button"
                  class="list-toggle"
                  aria-expanded={isOpen}
                  aria-label={
                    isOpen
                      ? `Contraer la progresión de ${ex.name}`
                      : `Ver la progresión de ${ex.name}`
                  }
                  onClick={() => toggleOpen(ex.id)}
                >
                  <span class="day-caret" aria-hidden="true">
                    {isOpen ? '▾' : '▸'}
                  </span>
                  <span class="title">{ex.name}</span>
                </button>
                <div class="sub">
                  {ex.muscleGroup ? `${ex.muscleGroup} · ` : ''}
                  {usage(ex.id) > 0
                    ? `en ${usage(ex.id)} rutina${usage(ex.id) === 1 ? '' : 's'}`
                    : 'sin usar en rutinas'}
                </div>
                {best !== undefined && (
                  <div class="sub">
                    🏆 Mejor: {fmtBest(best, s.settings.unit)}
                    {lastE1rm
                      ? ` · 📈 1RM ${fmtMetricValue(lastE1rm.value, 'e1rm', s.settings.unit)}`
                      : ''}
                  </div>
                )}
              </div>
              <button
                class="icon-btn"
                aria-label={`Editar ${ex.name}`}
                onClick={() =>
                  setEdit({
                    id: ex.id,
                    name: ex.name,
                    muscleGroup: ex.muscleGroup ?? '',
                  })
                }
              >
                ✎
              </button>
              <button
                class="icon-btn"
                aria-label={`Eliminar ${ex.name} del catálogo`}
                onClick={() => setToDelete(ex)}
              >
                🗑
              </button>
              {isOpen && (
                <div class="progress-panel">
                  {active === undefined || latest === undefined ? (
                    <p class="progress-empty">
                      Todavía sin datos: registra una sesión con este ejercicio y aquí
                      verás su progresión.
                    </p>
                  ) : (
                    <>
                      <div class="progress-head">
                        <div class="progress-value">
                          <span class="pv-num">
                            {fmtMetricValue(latest.value, active, s.settings.unit)}
                          </span>
                          <span class="pv-label">{METRIC_CAPTIONS[active]}</span>
                        </div>
                        {delta !== undefined && (
                          <span
                            class={`progress-delta${
                              delta > 0 ? ' is-up' : delta < 0 ? ' is-down' : ''
                            }`}
                          >
                            {fmtMetricDelta(delta, active, s.settings.unit)}
                          </span>
                        )}
                      </div>
                      {metrics.length > 1 && (
                        <div class="segmented segmented--full">
                          {metrics.map((m) => (
                            <button
                              type="button"
                              key={m}
                              class={m === active ? 'is-active' : ''}
                              aria-pressed={m === active}
                              onClick={() => setMetric(m)}
                            >
                              {METRIC_LABELS[m]}
                            </button>
                          ))}
                        </div>
                      )}
                      <ProgressChart
                        points={points}
                        metric={active}
                        unit={s.settings.unit}
                        label={ex.name}
                      />
                      {active === 'e1rm' && (
                        <p class="progress-note">
                          1RM estimado con Epley: peso × (1 + reps/30). Solo series con
                          carga.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      <p class="autosave">
        Renombrar un ejercicio lo actualiza en todas las rutinas que lo usan. Las sesiones
        guardadas conservan el nombre con el que se entrenaron.
      </p>

      <BottomSheet
        open={edit !== null}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Editar ejercicio' : 'Nuevo ejercicio'}
      >
        <label class="field">
          <span class="field-label">Nombre</span>
          <input
            class="input"
            value={edit?.name ?? ''}
            onInput={(e) => setEdit((cur) => (cur ? { ...cur, name: e.currentTarget.value } : cur))}
          />
        </label>
        <label class="field">
          <span class="field-label">Grupo muscular</span>
          <input
            class="input"
            value={edit?.muscleGroup ?? ''}
            placeholder="Pecho, Espalda, Piernas…"
            onInput={(e) =>
              setEdit((cur) => (cur ? { ...cur, muscleGroup: e.currentTarget.value } : cur))
            }
          />
        </label>
        <button class="btn btn-primary btn-block" onClick={save}>
          Guardar
        </button>
      </BottomSheet>

      <ConfirmDialog
        open={toDelete !== null}
        title="Quitar del catálogo"
        message={`"${toDelete?.name ?? ''}" dejará de aparecer en el autocompletado. Las rutinas y sesiones conservan sus datos.`}
        confirmLabel="Quitar"
        danger
        onConfirm={() => {
          if (toDelete) deleteExerciseFromCatalog(toDelete.id);
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
