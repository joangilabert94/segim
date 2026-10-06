// Lista de rutinas: crear, editar, clonar, activar, archivar y eliminar.

import { useRef, useState } from 'preact/hooks';
import { navigate } from '../router';
import {
  createRoutine,
  deleteRoutine,
  exportRoutines,
  importRoutines,
  patchRoutine,
  updateSettings,
  useStore,
} from '../state';
import { cloneRoutine } from '../services/cloneRoutine';
import { upsertRoutine } from '../state';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function Routines() {
  const s = useStore();
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCreate = () => {
    const routine = createRoutine();
    navigate(`/rutinas/${routine.id}`);
  };

  const handleExport = () => {
    try {
      const n = exportRoutines();
      setMessage({
        kind: 'ok',
        text: `${n} rutina${n === 1 ? '' : 's'} exportada${n === 1 ? '' : 's'} (solo rutinas y sus ejercicios: sin sesiones ni ajustes).`,
      });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No se pudo exportar.' });
    }
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const res = importRoutines(await file.text());
      const partes: string[] = [];
      if (res.added) partes.push(`${res.added} añadida${res.added === 1 ? '' : 's'}`);
      if (res.skipped) partes.push(`${res.skipped} ya existía${res.skipped === 1 ? '' : 'n'}`);
      if (res.exercisesAdded) {
        partes.push(`${res.exercisesAdded} ejercicio${res.exercisesAdded === 1 ? '' : 's'} nuevo${res.exercisesAdded === 1 ? '' : 's'} en el catálogo`);
      }
      setMessage({
        kind: 'ok',
        text:
          partes.length > 0
            ? `Importación: ${partes.join(', ')}.`
            : 'Nada nuevo: ya tienes esas rutinas.',
      });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No se pudo importar.' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClone = (id: string) => {
    const source = s.routines.find((r) => r.id === id);
    if (!source) return;
    const copy = cloneRoutine(source);
    upsertRoutine(copy);
    navigate(`/rutinas/${copy.id}`);
  };

  const activeId = s.settings.activeRoutineId;

  return (
    <>
      <header class="view-head">
        <h1>
          Rutinas
          <span class="sub">
            {s.routines.length === 0
              ? 'Crea tu primera rutina'
              : `${s.routines.length} rutina${s.routines.length === 1 ? '' : 's'}`}
          </span>
        </h1>
        <button class="btn btn-primary" onClick={handleCreate}>
          ＋ Nueva
        </button>
      </header>

      <div class="btn-row" style="margin-bottom:6px">
        <button class="btn btn-sm" onClick={handleExport}>
          ⬇️ Exportar rutinas
        </button>
        <button class="btn btn-sm" onClick={() => fileRef.current?.click()}>
          ⬆️ Importar rutinas
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style="display:none"
          onChange={(e) => handleImport(e.currentTarget.files?.[0])}
        />
      </div>
      <p class="hint" style="margin-bottom:14px">
        Comparte tus rutinas entre dispositivos: el fichero lleva rutinas y sus ejercicios,
        nunca sesiones ni ajustes.
      </p>
      {message && <div class={`inline-msg is-${message.kind}`}>{message.text}</div>}

      {s.routines.length === 0 ? (
        <div class="empty">
          <span class="empty-ico">📋</span>
          <h3>Sin rutinas todavía</h3>
          <p>
            Crea una rutina con varios días (por ejemplo Push / Pull / Legs), define sus
            ejercicios y las series con peso y repeticiones.
          </p>
          <button class="btn btn-primary" onClick={handleCreate}>
            Crear mi primera rutina
          </button>
        </div>
      ) : (
        s.routines.map((routine) => {
          const nExercises = routine.days.reduce((a, d) => a + d.exercises.length, 0);
          const isActive = activeId === routine.id;
          return (
            <div class="card" key={routine.id}>
              <div class="routine-card-head">
                <div class="card-title" style="flex-direction:column;align-items:flex-start;gap:4px">
                  <span>{routine.name}</span>
                  <span style="display:flex;gap:6px;flex-wrap:wrap">
                    {isActive && <span class="chip chip--accent">Activa</span>}
                    {routine.sourceRoutineId && <span class="chip">copia</span>}
                    {routine.archived && <span class="chip chip--danger">archivada</span>}
                  </span>
                </div>
              </div>
              <p class="card-sub">
                {routine.days.length} día{routine.days.length === 1 ? '' : 's'} · {nExercises}{' '}
                ejercicios
              </p>

              <div class="routine-actions">
                <button class="btn btn-sm" onClick={() => navigate(`/rutinas/${routine.id}`)}>
                  ✏️ Editar
                </button>
                <button class="btn btn-sm" onClick={() => handleClone(routine.id)}>
                  ⧉ Clonar
                </button>
                {!isActive && (
                  <button
                    class="btn btn-sm"
                    onClick={() => updateSettings({ activeRoutineId: routine.id })}
                  >
                    ★ Hacer activa
                  </button>
                )}
                <button
                  class="btn btn-sm"
                  onClick={() => patchRoutine(routine.id, (r) => void (r.archived = !r.archived))}
                >
                  {routine.archived ? '♻️ Desarchivar' : '📦 Archivar'}
                </button>
                <button
                  class="btn btn-sm btn-danger"
                  onClick={() => setConfirmDelete({ id: routine.id, name: routine.name })}
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Eliminar rutina"
        message={`"${confirmDelete?.name ?? ''}" se eliminará. Las sesiones ya registradas no se tocan.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          if (confirmDelete) deleteRoutine(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}
