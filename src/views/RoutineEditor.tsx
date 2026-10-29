import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Exercise, PerformedSet, PlannedSet, Routine, SetMode } from '../models';
import { setModeOf } from '../models';
import { navigate } from '../router';
import {
  applyExerciseDefinition,
  deleteRoutine,
  ensureExercise,
  patchRoutine,
  updateSettings,
  useStore,
} from '../state';
import { cloneRoutine } from '../services/cloneRoutine';
import { upsertRoutine } from '../state';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BottomSheet } from '../components/BottomSheet';
import { ExercisePicker } from '../components/ExercisePicker';
import { fmtReps, fmtWeight, fmtWeightInput, parseNumber, parseRepsRange } from '../services/format';
import {
  recentSince,
  setHistoryForExercise,
  suggestFromHistory,
} from '../services/bestResults';
import { findExercise, isExerciseShared } from '../services/catalog';

const MUSCLE_GROUPS = [
  'Pecho',
  'Espalda',
  'Hombros',
  'Piernas',
  'Glúteos',
  'Bíceps',
  'Tríceps',
  'Core',
  'Cardio',
];

function swap<T>(arr: T[], i: number, dir: -1 | 1): void {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

type NoteTarget = { day: number; ex: number; set: number } | null;

function modeChipText(set: PlannedSet): string {
  const mode = setModeOf(set);
  if (mode === 'timed') return '⏱ s';
  if (mode === 'range') return 'rango';
  return 'reps';
}

function suggestionHint(set: PlannedSet, unit: string): string {
  const weight = set.weight ? `${fmtWeight(set.weight)} ${unit} · ` : '';
  if (set.durationSec !== undefined) return `Sugerido: ${weight}${set.durationSec} s`;
  return `Sugerido: ${weight}${fmtReps(set.reps, set.repsMax)}`;
}

const samePlannedSet = (a: PlannedSet, b: PlannedSet) =>
  a.weight === b.weight &&
  a.reps === b.reps &&
  a.repsMax === b.repsMax &&
  a.durationSec === b.durationSec;

function modeChipAria(set: PlannedSet, n: number): string {
  const mode = setModeOf(set);
  if (mode === 'timed') return `La serie ${n} es cronometrada (${set.durationSec} s)`;
  if (mode === 'range') return `La serie ${n} tiene rango de repeticiones (${set.reps}-${set.repsMax})`;
  return `La serie ${n} tiene repeticiones fijas (${set.reps})`;
}

export function RoutineEditor({ id }: { id: string }) {
  const s = useStore();
  const [noteTarget, setNoteTarget] = useState<NoteTarget>(null);
  const [noteText, setNoteText] = useState('');
  const [modeTarget, setModeTarget] = useState<NoteTarget>(null);
  const [confirmDeleteDay, setConfirmDeleteDay] = useState<number | null>(null);
  const [confirmDeleteRoutine, setConfirmDeleteRoutine] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [renamingDay, setRenamingDay] = useState<string | null>(null);
  // Guarda lo tecleado tal cual ("1,", "4-") para no reescribirlo a media edición.
  const [setDrafts, setSetDrafts] = useState<Record<string, string>>({});
  // Con un ref inline, Preact lo reejecutaría en cada render y seleccionaría todo con cada tecla.
  const dayNameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!renamingDay) return;
    const el = dayNameInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [renamingDay]);

  const routine = s.routines.find((r) => r.id === id);

  // La firma de refs evita recalcular al escribir el nombre de la rutina (cada tecla re-renderiza).
  const refsKey = routine
    ? routine.days
        .flatMap((day) => day.exercises.map((ex) => `${ex.exerciseId ?? ''}|${ex.name}`))
        .join('§')
    : '';
  const historyByExercise = useMemo(() => {
    const map = new Map<string, PerformedSet[][]>();
    if (!routine) return map;
    const sinceDate = recentSince();
    for (const day of routine.days) {
      for (const ex of day.exercises) {
        map.set(
          ex.id,
          setHistoryForExercise(
            s.sessions,
            { exerciseId: ex.exerciseId, name: ex.name },
            { sinceDate },
          ),
        );
      }
    }
    return map;
  }, [s.sessions, refsKey]);

  if (!routine) {
    return (
      <div class="empty">
        <span class="empty-ico">🔍</span>
        <h3>Rutina no encontrada</h3>
        <button class="btn btn-primary" onClick={() => navigate('/rutinas')}>
          Volver a Rutinas
        </button>
      </div>
    );
  }

  const patch = (mutate: (draft: Routine) => void) => patchRoutine(id, mutate);

  const updateDraft = (key: string, value: string) =>
    setSetDrafts((drafts) => ({ ...drafts, [key]: value }));

  const clearDraft = (key: string) =>
    setSetDrafts((drafts) => {
      if (!(key in drafts)) return drafts;
      const next = { ...drafts };
      delete next[key];
      return next;
    });

  const currentMode: SetMode | null = modeTarget
    ? setModeOf(
        routine.days[modeTarget.day]?.exercises[modeTarget.ex]?.plannedSets[modeTarget.set] ?? {
          reps: 0,
        },
      )
    : null;

  const addDay = () =>
    patch((r) => {
      r.days.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: `Día ${r.days.length + 1}`,
        exercises: [],
      });
    });

  const renameDay = (di: number, name: string) =>
    patch((r) => {
      r.days[di].name = name;
    });

  const removeDay = (di: number) =>
    patch((r) => {
      r.days.splice(di, 1);
    });

  const moveDay = (di: number, dir: -1 | 1) => patch((r) => swap(r.days, di, dir));

  const toggleDay = (dayId: string) =>
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });

  const addExercise = (di: number) =>
    patch((r) => {
      r.days[di].exercises.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Nuevo ejercicio',
        plannedSets: [{ reps: 10 }],
      });
    });

  const renameExercise = (di: number, ei: number, name: string) =>
    patch((r) => {
      r.days[di].exercises[ei].name = name;
    });

  const linkExercise = (di: number, ei: number, picked: Exercise) =>
    patch((r) => {
      const ex = r.days[di].exercises[ei];
      ex.exerciseId = picked.id;
      ex.name = picked.name;
      if (picked.muscleGroup) ex.muscleGroup = picked.muscleGroup;
    });

  const createAndLink = (di: number, ei: number, name: string) => {
    const ex = ensureExercise(name, routine.days[di]?.exercises[ei]?.muscleGroup);
    linkExercise(di, ei, ex);
  };

  const replaceExercise = (di: number, ei: number, name: string) => {
    const created = ensureExercise(name);
    patch((r) => {
      const ex = r.days[di].exercises[ei];
      ex.exerciseId = created.id;
      ex.name = created.name;
      ex.muscleGroup = created.muscleGroup;
    });
  };

  const commitExercise = (di: number, ei: number) => {
    const ex = routine.days[di]?.exercises[ei];
    if (!ex) return;
    const trimmed = ex.name.trim();
    if (!trimmed) return;
    const existing = findExercise(s.exercises, trimmed);
    if (existing && existing.id !== ex.exerciseId) {
      linkExercise(di, ei, existing);
      return;
    }
    if (!ex.exerciseId) {
      const created = ensureExercise(trimmed, ex.muscleGroup);
      linkExercise(di, ei, created);
      return;
    }
    // Es otro ejercicio: renombrarlo le pasaría su historial. Se renombra en Ejercicios.
    if (!existing && isExerciseShared(ex.exerciseId, s.routines, s.sessions, ex.id)) {
      replaceExercise(di, ei, trimmed);
      return;
    }
    applyExerciseDefinition(ex.exerciseId, {
      name: ex.name,
      muscleGroup: ex.muscleGroup ?? '',
    });
  };

  const setMuscle = (di: number, ei: number, value: string) =>
    patch((r) => {
      r.days[di].exercises[ei].muscleGroup = value.trim() || undefined;
    });

  const removeExercise = (di: number, ei: number) =>
    patch((r) => {
      r.days[di].exercises.splice(ei, 1);
    });

  const moveExercise = (di: number, ei: number, dir: -1 | 1) =>
    patch((r) => swap(r.days[di].exercises, ei, dir));

  const addPlannedSet = (di: number, ei: number) => {
    setSetDrafts({});
    patch((r) => {
      const sets = r.days[di].exercises[ei].plannedSets;
      const last = sets[sets.length - 1];
      sets.push({
        weight: last?.weight,
        reps: last?.reps ?? 10,
        ...(last?.repsMax !== undefined ? { repsMax: last.repsMax } : {}),
        ...(last?.durationSec !== undefined ? { durationSec: last.durationSec } : {}),
      });
    });
  };

  const setPlannedWeight = (di: number, ei: number, si: number, text: string) =>
    patch((r) => {
      const n = parseNumber(text);
      r.days[di].exercises[ei].plannedSets[si].weight = n === null ? undefined : n;
    });

  const setPlannedReps = (di: number, ei: number, si: number, text: string) =>
    patch((r) => {
      const next = parseRepsRange(text);
      const set = r.days[di].exercises[ei].plannedSets[si];
      if (next === null) return;
      set.reps = next.reps;
      if (next.repsMax !== undefined) set.repsMax = next.repsMax;
      else delete set.repsMax;
    });

  const setPlannedDuration = (di: number, ei: number, si: number, text: string) =>
    patch((r) => {
      const n = parseNumber(text);
      const set = r.days[di].exercises[ei].plannedSets[si];
      if (n !== null) set.durationSec = Math.max(1, Math.round(n));
    });

  const updatePlanFromBest = (di: number, ei: number) => {
    const ex = routine.days[di]?.exercises[ei];
    if (!ex) return;
    const history = historyByExercise.get(ex.id) ?? [];
    patch((r) => {
      const target = r.days[di]?.exercises[ei];
      if (!target) return;
      target.plannedSets = target.plannedSets.map((p, i) => suggestFromHistory(p, history[i]));
    });
  };

  const applyPlannedMode = (mode: SetMode) => {
    if (!modeTarget) return;
    const { day: di, ex: ei, set: si } = modeTarget;
    setSetDrafts({});
    patch((r) => {
      const set = r.days[di]?.exercises[ei]?.plannedSets[si];
      if (!set) return;
      if (mode === 'fixed') {
        delete set.repsMax;
        delete set.durationSec;
      } else if (mode === 'range') {
        delete set.durationSec;
        if (set.repsMax === undefined || set.repsMax <= set.reps) set.repsMax = set.reps + 2;
      } else if (set.durationSec === undefined) {
        set.durationSec = 30;
      }
    });
    setModeTarget(null);
  };

  const removePlannedSet = (di: number, ei: number, si: number) => {
    setSetDrafts({});
    patch((r) => {
      r.days[di].exercises[ei].plannedSets.splice(si, 1);
    });
  };

  const movePlannedSet = (di: number, ei: number, si: number, dir: -1 | 1) => {
    // Los borradores van indexados por posición: al reordenar dejan de valer.
    setSetDrafts({});
    patch((r) => swap(r.days[di].exercises[ei].plannedSets, si, dir));
  };

  const openSetNote = (di: number, ei: number, si: number) => {
    setNoteText(routine.days[di]?.exercises[ei]?.plannedSets[si]?.note ?? '');
    setNoteTarget({ day: di, ex: ei, set: si });
  };

  const saveSetNote = () => {
    if (!noteTarget) return;
    const text = noteText.trim();
    patch((r) => {
      const set = r.days[noteTarget.day]?.exercises[noteTarget.ex]?.plannedSets[noteTarget.set];
      if (set) set.note = text || undefined;
    });
    setNoteTarget(null);
  };

  const clone = () => {
    const copy = cloneRoutine(routine);
    upsertRoutine(copy);
    navigate(`/rutinas/${copy.id}`);
  };

  return (
    <>
      <header class="view-head">
        <button class="back-btn" aria-label="Volver" onClick={() => navigate('/rutinas')}>
          ←
        </button>
        <div style="flex:1;min-width:0">
          <input
            class="input input-title"
            value={routine.name}
            aria-label="Nombre de la rutina"
            onInput={(e) => patch((r) => void (r.name = e.currentTarget.value))}
          />
        </div>
      </header>

      <div class="btn-row">
        <button class="btn btn-sm" onClick={clone}>
          ⧉ Clonar rutina
        </button>
        {s.settings.activeRoutineId !== routine.id && (
          <button
            class="btn btn-sm"
            onClick={() => updateSettings({ activeRoutineId: routine.id })}
          >
            ★ Hacer activa
          </button>
        )}
        <button
          class="btn btn-sm btn-danger"
          style="margin-left:auto"
          onClick={() => setConfirmDeleteRoutine(true)}
        >
          🗑 Eliminar
        </button>
      </div>

      {routine.days.length === 0 && (
        <div class="empty">
          <span class="empty-ico">🗓</span>
          <h3>Sin días</h3>
          <p>Añade un día para empezar a montar la rutina.</p>
        </div>
      )}

      {routine.days.map((day, di) => (
        <section
          class={`editor-section${collapsedDays.has(day.id) ? ' is-collapsed' : ''}`}
          key={day.id}
        >
          <div class="editor-day-head">
            {renamingDay === day.id ? (
              <input
                class="input"
                ref={dayNameInputRef}
                placeholder="Nombre del día"
                value={day.name}
                aria-label={`Nombre del día ${di + 1}`}
                onInput={(e) => renameDay(di, e.currentTarget.value)}
                onBlur={() => setRenamingDay(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
                }}
              />
            ) : (
              <button
                type="button"
                class="day-toggle"
                aria-expanded={!collapsedDays.has(day.id)}
                title={collapsedDays.has(day.id) ? 'Desplegar día' : 'Plegar día'}
                onClick={() => toggleDay(day.id)}
              >
                <span class="day-caret" aria-hidden="true">
                  {collapsedDays.has(day.id) ? '▸' : '▾'}
                </span>
                <span class={`day-name${day.name.trim() ? '' : ' is-placeholder'}`}>
                  {day.name.trim() || 'Día sin nombre'}
                </span>
              </button>
            )}
            <div class="day-actions">
              <button
                class="icon-btn"
                aria-label="Subir día"
                disabled={di === 0}
                onClick={() => moveDay(di, -1)}
              >
                ↑
              </button>
              <button
                class="icon-btn"
                aria-label="Bajar día"
                disabled={di === routine.days.length - 1}
                onClick={() => moveDay(di, 1)}
              >
                ↓
              </button>
              <button
                class="icon-btn"
                aria-label="Renombrar día"
                title="Renombrar día"
                onClick={() => setRenamingDay(day.id)}
              >
                ✎
              </button>
              <button
                class="icon-btn"
                aria-label="Eliminar día"
                onClick={() => setConfirmDeleteDay(di)}
              >
                ✕
              </button>
            </div>
          </div>

          {day.exercises.length === 0 && (
            <p class="hint" style="padding:4px 2px 10px">
              Este día aún no tiene ejercicios.
            </p>
          )}

          {day.exercises.map((ex, ei) => {
            const history = historyByExercise.get(ex.id) ?? [];
            const suggestions = ex.plannedSets.map((p, i) => suggestFromHistory(p, history[i]));
            const canUpdate = suggestions.some((sug, i) => !samePlannedSet(sug, ex.plannedSets[i]));
            return (
            <div class="exercise-edit" key={ex.id}>
              <div class="exercise-edit-head">
                <ExercisePicker
                  exercises={s.exercises}
                  value={ex.name}
                  placeholder="Ejercicio"
                  onName={(name) => renameExercise(di, ei, name)}
                  onPick={(picked) => linkExercise(di, ei, picked)}
                  onCreate={(name) => createAndLink(di, ei, name)}
                  onCommit={() => commitExercise(di, ei)}
                />
                <button
                  class="icon-btn"
                  aria-label="Subir ejercicio"
                  disabled={ei === 0}
                  onClick={() => moveExercise(di, ei, -1)}
                >
                  ↑
                </button>
                <button
                  class="icon-btn"
                  aria-label="Bajar ejercicio"
                  disabled={ei === day.exercises.length - 1}
                  onClick={() => moveExercise(di, ei, 1)}
                >
                  ↓
                </button>
                <button
                  class="icon-btn"
                  aria-label="Eliminar ejercicio"
                  onClick={() => removeExercise(di, ei)}
                >
                  ✕
                </button>
              </div>

              <div class="exercise-edit-head">
                <input
                  class="input muscle-input"
                  list="muscle-groups"
                  value={ex.muscleGroup ?? ''}
                  placeholder="Grupo muscular"
                  aria-label="Grupo muscular"
                  onInput={(e) => setMuscle(di, ei, e.currentTarget.value)}
                  onChange={() => commitExercise(di, ei)}
                />
              </div>

              <div class="planned-sets">
                {ex.plannedSets.map((set, si) => {
                  const weightKey = `${ex.id}-${si}-w`;
                  const repsKey = `${ex.id}-${si}-r`;
                  const durKey = `${ex.id}-${si}-d`;
                  return (
                  <div class="set-block" key={si}>
                  <div class="planned-set-row">
                    <span class="label">
                      Serie {si + 1}
                      <button
                        class={`mode-chip${setModeOf(set) === 'timed' ? ' is-timed' : ''}`}
                        aria-label={`${modeChipAria(set, si + 1)}: toca para cambiar el tipo de serie`}
                        title="Cambiar el tipo de serie"
                        onClick={() => setModeTarget({ day: di, ex: ei, set: si })}
                      >
                        {modeChipText(set)}
                      </button>
                    </span>
                    <label class="num-field">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={
                          setDrafts[weightKey] ??
                          (set.weight !== undefined ? fmtWeightInput(set.weight) : '')
                        }
                        placeholder="peso"
                        aria-label={`Peso planeado de la serie ${si + 1}`}
                        onInput={(e) => {
                          updateDraft(weightKey, e.currentTarget.value);
                          setPlannedWeight(di, ei, si, e.currentTarget.value);
                        }}
                        onBlur={() => clearDraft(weightKey)}
                      />
                      <span class="num-suffix">{s.settings.unit}</span>
                    </label>
                    <span class="times">×</span>
                    {set.durationSec !== undefined ? (
                      <label class="num-field num-dur">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={setDrafts[durKey] ?? String(set.durationSec)}
                          aria-label={`Duración planeada de la serie ${si + 1} en segundos`}
                          onInput={(e) => {
                            updateDraft(durKey, e.currentTarget.value);
                            setPlannedDuration(di, ei, si, e.currentTarget.value);
                          }}
                          onBlur={() => clearDraft(durKey)}
                        />
                        <span class="num-suffix">s</span>
                      </label>
                    ) : (
                      <label class="num-field num-reps">
                        <input
                          type="text"
                          inputMode={
                            set.repsMax !== undefined && set.repsMax > set.reps
                              ? 'text'
                              : 'numeric'
                          }
                          value={setDrafts[repsKey] ?? fmtReps(set.reps, set.repsMax)}
                          aria-label={`Repeticiones planeadas de la serie ${si + 1}`}
                          onInput={(e) => {
                            updateDraft(repsKey, e.currentTarget.value);
                            setPlannedReps(di, ei, si, e.currentTarget.value);
                          }}
                          onBlur={() => clearDraft(repsKey)}
                        />
                      </label>
                    )}
                    <button
                      class="note-indicator"
                      aria-label="Nota de la serie"
                      title={set.note ? set.note : 'Añadir nota a la serie'}
                      onClick={() => openSetNote(di, ei, si)}
                    >
                      {set.note ? '✎' : '＋'}
                    </button>
                    <span class="set-move">
                      <button
                        class="icon-btn set-move-btn"
                        aria-label={`Subir serie ${si + 1}`}
                        disabled={si === 0}
                        onClick={() => movePlannedSet(di, ei, si, -1)}
                      >
                        ↑
                      </button>
                      <button
                        class="icon-btn set-move-btn"
                        aria-label={`Bajar serie ${si + 1}`}
                        disabled={si === ex.plannedSets.length - 1}
                        onClick={() => movePlannedSet(di, ei, si, 1)}
                      >
                        ↓
                      </button>
                    </span>
                    <button
                      class="icon-btn"
                      aria-label={`Eliminar serie ${si + 1}`}
                      onClick={() => removePlannedSet(di, ei, si)}
                    >
                      ✕
                    </button>
                    </div>
                    {!samePlannedSet(suggestions[si], set) && (
                      <p class="hint best-hint">
                        {suggestionHint(suggestions[si], s.settings.unit)}
                      </p>
                    )}
                  </div>
                    );
                  })}
                {ex.plannedSets.length === 0 && (
                  <p class="hint">Sin series planeadas (podrás apuntarlas al entrenar).</p>
                )}
                <div class="set-actions">
                  <button class="btn btn-sm" onClick={() => addPlannedSet(di, ei)}>
                    ＋ Serie
                  </button>
                  <button
                    class="btn btn-sm"
                    disabled={!canUpdate}
                    aria-label={`Actualizar plan de ${ex.name} con los mejores resultados`}
                    title="Aplica al plan tus mejores resultados de las últimas 8 semanas que lo superen"
                    onClick={() => updatePlanFromBest(di, ei)}
                  >
                    ⬆️ Actualizar plan
                  </button>
                </div>
              </div>
            </div>
            );
          })}

          <button class="btn btn-block" style="margin-top:12px" onClick={() => addExercise(di)}>
            ＋ Añadir ejercicio
          </button>
        </section>
      ))}

      <button class="btn btn-primary btn-block" style="margin-top:14px" onClick={addDay}>
        ＋ Añadir día
      </button>

      <p class="autosave">
        Los cambios se guardan automáticamente. Para renombrar un ejercicio en todas las rutinas,
        hazlo desde la pestaña Ejercicios.
      </p>

      <datalist id="muscle-groups">
        {MUSCLE_GROUPS.map((g) => (
          <option value={g} key={g} />
        ))}
      </datalist>

      <BottomSheet
        open={modeTarget !== null}
        onClose={() => setModeTarget(null)}
        title={`Tipo de serie${modeTarget !== null ? ` ${modeTarget.set + 1}` : ''}`}
      >
        <button
          class="sheet-action"
          aria-pressed={currentMode === 'fixed'}
          onClick={() => applyPlannedMode('fixed')}
        >
          {currentMode === 'fixed' ? '✓ ' : ''}♯ Por repeticiones (número fijo)
        </button>
        <button
          class="sheet-action"
          aria-pressed={currentMode === 'range'}
          onClick={() => applyPlannedMode('range')}
        >
          {currentMode === 'range' ? '✓ ' : ''}↔ Rango de repeticiones (4-6)
        </button>
        <button
          class="sheet-action"
          aria-pressed={currentMode === 'timed'}
          onClick={() => applyPlannedMode('timed')}
        >
          {currentMode === 'timed' ? '✓ ' : ''}⏱ Cronometrada (segundos)
        </button>
        <p class="hint" style="margin-top:8px">
          En un rango (4-6) fijas las mínimas y las máximas de la serie; en la sesión
          apuntarás siempre el número exacto que consigas.
        </p>
      </BottomSheet>

      <BottomSheet
        open={noteTarget !== null}
        onClose={() => setNoteTarget(null)}
        title="Nota de la serie"
      >
        <textarea
          class="input"
          placeholder="Ej.: última serie al fallo, bajada lenta…"
          value={noteText}
          onInput={(e) => setNoteText(e.currentTarget.value)}
        />
        <button class="btn btn-primary btn-block" onClick={saveSetNote}>
          Guardar nota
        </button>
      </BottomSheet>

      <ConfirmDialog
        open={confirmDeleteDay !== null}
        title="Eliminar día"
        message={`"${confirmDeleteDay !== null ? routine.days[confirmDeleteDay]?.name : ''}" y todos sus ejercicios se eliminarán. ¿Continuar?`}
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          if (confirmDeleteDay !== null) removeDay(confirmDeleteDay);
          setConfirmDeleteDay(null);
        }}
        onCancel={() => setConfirmDeleteDay(null)}
      />

      <ConfirmDialog
        open={confirmDeleteRoutine}
        title="Eliminar rutina"
        message={`"${routine.name}" se eliminará. Las sesiones ya registradas no se tocan.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          deleteRoutine(routine.id);
          navigate('/rutinas');
        }}
        onCancel={() => setConfirmDeleteRoutine(false)}
      />
    </>
  );
}
