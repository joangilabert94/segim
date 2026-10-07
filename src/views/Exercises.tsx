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
import { fmtReps } from '../services/format';
import { BottomSheet } from '../components/BottomSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface EditState {
  id?: string; // si existe, se renombra; si no, es uno nuevo
  name: string;
  muscleGroup: string;
}

const EMPTY: EditState = { name: '', muscleGroup: '' };

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
            const best = bestOverallForExercise(s.sessions, {
              exerciseId: ex.id,
              name: ex.name,
            });
            return (
            <div class="list-item" key={ex.id}>
              <div class="list-body">
                <div class="title">{ex.name}</div>
                <div class="sub">
                  {ex.muscleGroup ? `${ex.muscleGroup} · ` : ''}
                  {usage(ex.id) > 0
                    ? `en ${usage(ex.id)} rutina${usage(ex.id) === 1 ? '' : 's'}`
                    : 'sin usar en rutinas'}
                </div>
                {best !== undefined && (
                  <div class="sub">🏆 Mejor: {fmtBest(best, s.settings.unit)}</div>
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
