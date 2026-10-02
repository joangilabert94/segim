// Editor de rutina en 3 niveles: días → ejercicios → series planeadas.
// Cada serie planeada tiene su propio peso (opcional) y sus propias reps.

import { useState } from 'preact/hooks';
import type { Exercise, Routine } from '../models';
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
import { parseNumber } from '../services/format';

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

/** Intercambia dos elementos de un array (reordenación con ↑ ↓). */
function swap<T>(arr: T[], i: number, dir: -1 | 1): void {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

type NoteTarget = { day: number; ex: number; set: number } | null;

export function RoutineEditor({ id }: { id: string }) {
  const s = useStore();
  const [noteTarget, setNoteTarget] = useState<NoteTarget>(null);
  const [noteText, setNoteText] = useState('');
  const [confirmDeleteDay, setConfirmDeleteDay] = useState<number | null>(null);
  const [confirmDeleteRoutine, setConfirmDeleteRoutine] = useState(false);

  const routine = s.routines.find((r) => r.id === id);

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

  // ---- Días ----
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

  // ---- Ejercicios ----
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

  /** Elige un ejercicio del catálogo: vincula por id y copia nombre/grupo. */
  const linkExercise = (di: number, ei: number, picked: Exercise) =>
    patch((r) => {
      const ex = r.days[di].exercises[ei];
      ex.exerciseId = picked.id;
      ex.name = picked.name;
      if (picked.muscleGroup) ex.muscleGroup = picked.muscleGroup;
    });

  /** Crea (o recupera) el ejercicio en el catálogo y vincula. */
  const createAndLink = (di: number, ei: number, name: string) => {
    const ex = ensureExercise(name, routine.days[di]?.exercises[ei]?.muscleGroup);
    linkExercise(di, ei, ex);
  };

  /** Al salir del campo: propaga nombre/grupo al catálogo y al resto de rutinas. */
  const commitExercise = (di: number, ei: number) => {
    const ex = routine.days[di]?.exercises[ei];
    if (!ex?.exerciseId) return;
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

  // ---- Series planeadas ----
  const addPlannedSet = (di: number, ei: number) =>
    patch((r) => {
      const sets = r.days[di].exercises[ei].plannedSets;
      const last = sets[sets.length - 1];
      sets.push({ weight: last?.weight, reps: last?.reps ?? 10 });
    });

  const setPlannedWeight = (di: number, ei: number, si: number, text: string) =>
    patch((r) => {
      const n = parseNumber(text);
      r.days[di].exercises[ei].plannedSets[si].weight = n === null ? undefined : n;
    });

  const setPlannedReps = (di: number, ei: number, si: number, text: string) =>
    patch((r) => {
      const n = parseNumber(text);
      const set = r.days[di].exercises[ei].plannedSets[si];
      if (n !== null) set.reps = n;
    });

  const removePlannedSet = (di: number, ei: number, si: number) =>
    patch((r) => {
      r.days[di].exercises[ei].plannedSets.splice(si, 1);
    });

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
        <section class="editor-section" key={day.id}>
          <div class="editor-day-head">
            <input
              class="input"
              value={day.name}
              aria-label={`Nombre del día ${di + 1}`}
              onInput={(e) => renameDay(di, e.currentTarget.value)}
            />
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
              aria-label="Eliminar día"
              onClick={() => setConfirmDeleteDay(di)}
            >
              ✕
            </button>
          </div>

          {day.exercises.length === 0 && (
            <p class="hint" style="padding:4px 2px 10px">
              Este día aún no tiene ejercicios.
            </p>
          )}

          {day.exercises.map((ex, ei) => (
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
                {ex.plannedSets.map((set, si) => (
                  <div class="planned-set-row" key={si}>
                    <span class="label">Serie {si + 1}</span>
                    <label class="num-field">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={set.weight !== undefined ? String(set.weight) : ''}
                        placeholder="peso"
                        aria-label={`Peso planeado de la serie ${si + 1}`}
                        onChange={(e) => setPlannedWeight(di, ei, si, e.currentTarget.value)}
                      />
                      <span class="num-suffix">{s.settings.unit}</span>
                    </label>
                    <span class="times">×</span>
                    <label class="num-field num-reps">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={String(set.reps)}
                        aria-label={`Repeticiones planeadas de la serie ${si + 1}`}
                        onChange={(e) => setPlannedReps(di, ei, si, e.currentTarget.value)}
                      />
                    </label>
                    <button
                      class="note-indicator"
                      aria-label="Nota de la serie"
                      title={set.note ? set.note : 'Añadir nota a la serie'}
                      onClick={() => openSetNote(di, ei, si)}
                    >
                      {set.note ? '✎' : '＋'}
                    </button>
                    <button
                      class="icon-btn"
                      aria-label={`Eliminar serie ${si + 1}`}
                      onClick={() => removePlannedSet(di, ei, si)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {ex.plannedSets.length === 0 && (
                  <p class="hint">Sin series planeadas (podrás apuntarlas al entrenar).</p>
                )}
                <button class="btn btn-sm" onClick={() => addPlannedSet(di, ei)}>
                  ＋ Serie
                </button>
              </div>
            </div>
          ))}

          <button class="btn btn-block" style="margin-top:12px" onClick={() => addExercise(di)}>
            ＋ Añadir ejercicio
          </button>
        </section>
      ))}

      <button class="btn btn-primary btn-block" style="margin-top:14px" onClick={addDay}>
        ＋ Añadir día
      </button>

      <p class="autosave">Los cambios se guardan automáticamente.</p>

      <datalist id="muscle-groups">
        {MUSCLE_GROUPS.map((g) => (
          <option value={g} key={g} />
        ))}
      </datalist>

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
