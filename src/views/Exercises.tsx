import { useMemo, useState } from 'preact/hooks';
import type { Exercise, LoadType, PerformedSet, Unit } from '../models';
import {
  applyExerciseDefinition,
  deleteExerciseFromCatalog,
  ensureExercise,
  setExerciseTraining,
  useStore,
} from '../state';
import { findPreviousSession, normalizeName } from '../services/previousSession';
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
  type ProgressPoint,
} from '../services/progression';
import {
  fmtDateYear,
  fmtRelative,
  fmtReps,
  fmtWeight,
  fmtWeightInput,
  parseNumber,
} from '../services/format';
import { LOAD_LABELS, fmtLoadUnit, loadProfile, type LoadProfile } from '../services/load';
import { BottomSheet } from '../components/BottomSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ProgressChart } from '../components/ProgressChart';

interface EditState {
  id?: string;
  name: string;
  muscleGroup: string;
  load: LoadType;
  unilateral: boolean;
  increment: string;
}

const EMPTY: EditState = {
  name: '',
  muscleGroup: '',
  load: 'external',
  unilateral: false,
  increment: '',
};

const LOAD_HINTS: Record<LoadType, string> = {
  external: 'Barra, mancuernas, máquina o polea: apuntas el peso que mueves.',
  bodyweight: 'Dominadas, fondos…: apuntas el lastre (0 sin lastre).',
  assisted: 'Máquina o goma de asistencia: apuntas la ayuda; menos es mejor.',
};

const WEIGHT_METRIC: Record<LoadType, { label: string; caption: string }> = {
  external: { label: 'Peso', caption: 'Peso máximo · última sesión' },
  bodyweight: { label: 'Lastre', caption: 'Lastre máximo · última sesión' },
  assisted: { label: 'Asistencia', caption: 'Asistencia mínima · última sesión' },
};

const METRIC_CAPTIONS: Record<ProgressMetric, string> = {
  e1rm: '1RM estimado · última sesión',
  weight: 'Peso máximo · última sesión',
  duration: 'Mejor tiempo · última sesión',
  reps: 'Máx. reps · última sesión',
};

function fmtBest(best: PerformedSet, profile: LoadProfile, unit: Unit): string {
  const load = best.weight > 0 ? fmtLoadUnit(best.weight, profile, unit) : undefined;
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
  const [editError, setEditError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Exercise | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [metric, setMetric] = useState<ProgressMetric>('e1rm');

  const statsById = useMemo(() => {
    const map = new Map<
      string,
      { best: PerformedSet | undefined; points: ProgressPoint[]; lastDate?: string }
    >();
    for (const ex of s.exercises) {
      const ref = { exerciseId: ex.id, name: ex.name };
      const profile = loadProfile(ex, s.settings);
      map.set(ex.id, {
        best: bestOverallForExercise(s.sessions, ref, profile),
        points: progressSeries(s.sessions, ref, profile),
        lastDate: findPreviousSession(s.sessions, ref)?.date,
      });
    }
    return map;
  }, [s.sessions, s.exercises, s.settings]);

  const target = normalizeName(query);
  const list = s.exercises
    .filter((e) => target === '' || normalizeName(e.name).includes(target))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const usage = (id: string) =>
    s.routines.filter(
      (routine) =>
        !routine.archived &&
        routine.days.some((day) => day.exercises.some((ex) => ex.exerciseId === id)),
    ).length;

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
    let id = edit.id;
    if (id) {
      const applied = applyExerciseDefinition(id, {
        name,
        muscleGroup: edit.muscleGroup,
      });
      if (!applied) {
        setEditError('Ya existe otro ejercicio con ese nombre. Elige uno distinto.');
        return;
      }
    } else {
      id = ensureExercise(name, edit.muscleGroup).id;
    }
    const increment = parseNumber(edit.increment);
    setExerciseTraining(id, {
      load: edit.load,
      unilateral: edit.unilateral,
      increment: increment !== null && increment > 0 ? increment : null,
    });
    setEdit(null);
    setEditError(null);
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
        <button
          class="btn btn-primary"
          onClick={() => {
            setEditError(null);
            setEdit({ ...EMPTY });
          }}
        >
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
          <button
            class="btn btn-primary"
            onClick={() => {
              setEditError(null);
              setEdit({ ...EMPTY });
            }}
          >
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
            const usedBy = usage(ex.id);
            const profile = loadProfile(ex, s.settings);
            const weightMetric = WEIGHT_METRIC[profile.load];
            const stat = statsById.get(ex.id);
            const best = stat?.best;
            const points = stat?.points ?? [];
            const metrics = availableMetrics(points);
            const active = metrics.includes(metric) ? metric : defaultMetric(points);
            const isOpen = openIds.has(ex.id);
            const e1rms = metricSeries(points, 'e1rm');
            const lastE1rm = e1rms[e1rms.length - 1];
            const serie = active !== undefined ? metricSeries(points, active) : [];
            const latest = serie[serie.length - 1];
            const prev = serie[serie.length - 2];
            const delta = prev && latest ? latest.value - prev.value : undefined;
            // En asistidos, bajar la asistencia es mejorar: el color sigue a la mejora.
            const better =
              delta !== undefined && active === 'weight' && profile.load === 'assisted'
                ? -delta
                : delta;
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
                  {ex.load ? `${LOAD_LABELS[ex.load].toLowerCase()} · ` : ''}
                  {ex.unilateral ? 'por lado · ' : ''}
                  {usedBy > 0
                    ? `en ${usedBy} rutina${usedBy === 1 ? '' : 's'}`
                    : 'sin usar en rutinas'}
                </div>
                {stat?.lastDate && (
                  <div class="sub">
                    📅 Última vez: {fmtDateYear(stat.lastDate)} · {fmtRelative(stat.lastDate)}
                  </div>
                )}
                {best !== undefined && (
                  <div class="sub">
                    🏆 Mejor: {fmtBest(best, profile, s.settings.unit)}
                    {lastE1rm
                      ? ` · 📈 1RM ${fmtMetricValue(lastE1rm.value, 'e1rm', s.settings.unit)}`
                      : ''}
                  </div>
                )}
              </div>
              <button
                class="icon-btn"
                aria-label={`Editar ${ex.name}`}
                onClick={() => {
                  setEditError(null);
                  setEdit({
                    id: ex.id,
                    name: ex.name,
                    muscleGroup: ex.muscleGroup ?? '',
                    load: ex.load ?? 'external',
                    unilateral: ex.unilateral === true,
                    increment: ex.increment !== undefined ? fmtWeightInput(ex.increment) : '',
                  });
                }}
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
                          <span class="pv-label">
                            {active === 'weight' ? weightMetric.caption : METRIC_CAPTIONS[active]}
                          </span>
                        </div>
                        {delta !== undefined && (
                          <span
                            class={`progress-delta${
                              (better ?? 0) > 0 ? ' is-up' : (better ?? 0) < 0 ? ' is-down' : ''
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
                              {m === 'weight' ? weightMetric.label : METRIC_LABELS[m]}
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
                          1RM estimado con Epley: peso × (1 + reps/30).{' '}
                          {profile.load === 'external'
                            ? 'Solo series con carga.'
                            : 'Incluye tu peso corporal (Ajustes).'}
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
        onClose={() => {
          setEdit(null);
          setEditError(null);
        }}
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
        <span class="field-label">Tipo de carga</span>
        <div class="segmented segmented--full">
          {(['external', 'bodyweight', 'assisted'] as const).map((load) => (
            <button
              key={load}
              type="button"
              class={edit?.load === load ? 'is-active' : ''}
              aria-pressed={edit?.load === load}
              onClick={() => setEdit((cur) => (cur ? { ...cur, load } : cur))}
            >
              {LOAD_LABELS[load]}
            </button>
          ))}
        </div>
        <p class="hint" style="margin:6px 0 12px">{LOAD_HINTS[edit?.load ?? 'external']}</p>
        <div class="segmented segmented--full">
          <button
            type="button"
            class={edit?.unilateral ? '' : 'is-active'}
            aria-pressed={!edit?.unilateral}
            onClick={() => setEdit((cur) => (cur ? { ...cur, unilateral: false } : cur))}
          >
            Ambos lados a la vez
          </button>
          <button
            type="button"
            class={edit?.unilateral ? 'is-active' : ''}
            aria-pressed={edit?.unilateral === true}
            onClick={() => setEdit((cur) => (cur ? { ...cur, unilateral: true } : cur))}
          >
            Por lado
          </button>
        </div>
        <p class="hint" style="margin:6px 0 12px">
          Por lado: apuntas una serie con el peso y las reps de cada lado; cuenta doble en el
          volumen.
        </p>
        <label class="field">
          <span class="field-label">Incremento de la progresión ({s.settings.unit})</span>
          <input
            class="input"
            inputMode="decimal"
            value={edit?.increment ?? ''}
            placeholder={`${fmtWeight(s.settings.progressionIncrement)} (el general de Ajustes)`}
            onInput={(e) =>
              setEdit((cur) => (cur ? { ...cur, increment: e.currentTarget.value } : cur))
            }
          />
        </label>
        {editError && <div class="inline-msg is-error">{editError}</div>}
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
