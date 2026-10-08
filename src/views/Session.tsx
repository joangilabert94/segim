// Modo entrenamiento: comparación Plan · Anterior · Hoy por serie,
// notas, series extra, cronómetro opcional y guardado incremental.

import { useState } from 'preact/hooks';
import type { Exercise, PerformedSet, Session, SetMode } from '../models';
import { setModeOf } from '../models';
import { navigate } from '../router';
import {
  ensureExercise,
  finalizeSession,
  patchSession,
  setSessionDate,
  useStore,
} from '../state';
import {
  findEntry,
  findPreviousSession,
  matchesExercise,
  refOfEntry,
} from '../services/previousSession';
import { fmtDate, fmtRelative, todayISO } from '../services/format';
import { doneSetsCount, setsCount } from '../services/stats';
import { SeriesRow } from '../components/SeriesRow';
import { ExercisePicker } from '../components/ExercisePicker';
import { BottomSheet } from '../components/BottomSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RestControls } from '../components/RestControls';

type SheetState =
  | null
  | { kind: 'serie'; entry: number; set: number }
  | { kind: 'serie-note'; entry: number; set: number }
  | { kind: 'entry-note'; entry: number }
  | { kind: 'add-exercise' };

/** Tipos de serie permitidos en una sesión: el rango (4-6) es solo del plan. */
type SessionSetMode = Exclude<SetMode, 'range'>;

export function SessionView() {
  const s = useStore();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [noteText, setNoteText] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [pickedExercise, setPickedExercise] = useState<Exercise | null>(null);
  const [confirmDeleteSet, setConfirmDeleteSet] = useState<{ entry: number; set: number } | null>(
    null,
  );
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<number | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateText, setDateText] = useState('');

  const session = s.sessions.find((x) => x.status === 'in-progress');

  if (!session) {
    return (
      <div class="empty">
        <span class="empty-ico">🏋️</span>
        <h3>No hay ningún entrenamiento en curso</h3>
        <p>Empieza uno desde la pantalla de Hoy.</p>
        <button class="btn btn-primary" onClick={() => navigate('/')}>
          Ir a Hoy
        </button>
      </div>
    );
  }

  const routine = session.routineId
    ? s.routines.find((r) => r.id === session.routineId)
    : undefined;
  const day = routine && session.dayId ? routine.days.find((d) => d.id === session.dayId) : undefined;

  const total = setsCount(session);
  const done = doneSetsCount(session);

  // Datos de comparación por entrada (ejercicio)
  const comparisons = session.entries.map((entry) => {
    const ref = refOfEntry(entry);
    const prevSession = findPreviousSession(s.sessions, ref, {
      excludeId: session.id,
    });
    const prevEntry = prevSession ? findEntry(prevSession, ref) : undefined;
    const plannedEx = day?.exercises.find((e) =>
      matchesExercise(ref, { exerciseId: e.exerciseId, name: e.name }),
    );
    return { prevSession, prevEntry, plannedEx };
  });

  const patchSet = (ei: number, si: number, patch: Partial<PerformedSet>) => {
    patchSession(session.id, (draft) => {
      const target = draft.entries[ei]?.sets[si];
      if (target) Object.assign(target, patch);
    });
  };

  const patchEntry = (ei: number, mutate: (entry: Session['entries'][number]) => void) => {
    patchSession(session.id, (draft) => {
      if (draft.entries[ei]) mutate(draft.entries[ei]);
    });
  };

  const addSet = (ei: number) => {
    patchEntry(ei, (entry) => {
      const last = entry.sets[entry.sets.length - 1];
      entry.sets.push({
        weight: last?.weight ?? 0,
        reps: last?.reps ?? 10,
        done: false,
        extra: true,
        ...(last?.repsMax !== undefined ? { repsMax: last.repsMax } : {}),
        ...(last?.durationSec !== undefined ? { durationSec: last.durationSec } : {}),
      });
    });
  };

  const removeSet = (ei: number, si: number) => {
    patchEntry(ei, (entry) => {
      if (entry.sets.length > 1) entry.sets.splice(si, 1);
      else {
        entry.sets[0].done = false;
        entry.sets[0].note = undefined;
      }
    });
  };

  const copyPlanToSet = (ei: number, si: number) => {
    const planned = comparisons[ei].plannedEx?.plannedSets[si];
    if (!planned) return;
    patchEntry(ei, (entry) => {
      const target = entry.sets[si];
      if (!target) return;
      target.weight = planned.weight ?? target.weight;
      // Copia la sugerencia del plan (rango incluido); al editarla se hará fija.
      target.reps = planned.reps;
      if (planned.repsMax !== undefined) target.repsMax = planned.repsMax;
      else delete target.repsMax;
      if (planned.durationSec !== undefined) target.durationSec = planned.durationSec;
      else delete target.durationSec;
    });
  };

  const applySetToAll = (ei: number, si: number) => {
    const source = session.entries[ei].sets[si];
    patchEntry(ei, (entry) => {
      entry.sets.forEach((set) => {
        set.weight = source.weight;
        set.reps = source.reps;
        if (source.repsMax !== undefined) set.repsMax = source.repsMax;
        else delete set.repsMax;
        if (source.durationSec !== undefined) set.durationSec = source.durationSec;
        else delete set.durationSec;
      });
    });
  };

  /** Cambia el tipo de serie de la sesión: fijo o cronometrada (sin rango). */
  const applySetMode = (ei: number, si: number, mode: SessionSetMode) => {
    patchEntry(ei, (entry) => {
      const set = entry.sets[si];
      if (!set) return;
      if (mode === 'fixed') {
        // También limpia un rango heredado de versiones antiguas.
        delete set.repsMax;
        delete set.durationSec;
      } else if (set.durationSec === undefined) {
        set.durationSec = 30;
      }
    });
  };

  const addExercise = () => {
    const name = exerciseName.trim();
    if (!name) return;
    // Vínculo estable: el elegido del catálogo o el existente/creado por nombre
    const known =
      pickedExercise && pickedExercise.name.trim().toLowerCase() === name.toLowerCase()
        ? pickedExercise
        : ensureExercise(name);
    const ref = { exerciseId: known.id, name: known.name };
    patchSession(session.id, (draft) => {
      const prev = findPreviousSession(s.sessions, ref, {
        excludeId: session.id,
      });
      const prevEntry = prev ? findEntry(prev, ref) : undefined;
      draft.entries.push({
        exerciseId: known.id,
        exerciseName: known.name,
        sets: (prevEntry?.sets ?? []).map((set) => ({
          weight: set.weight,
          reps: set.reps,
          done: false,
          ...(set.repsMax !== undefined ? { repsMax: set.repsMax } : {}),
          ...(set.durationSec !== undefined ? { durationSec: set.durationSec } : {}),
        })),
      });
    });
    setExerciseName('');
    setPickedExercise(null);
    setSheet(null);
  };

  const openNoteSheet = (kind: 'serie-note' | 'entry-note', entry: number, set?: number) => {
    const current =
      kind === 'serie-note'
        ? session.entries[entry]?.sets[set ?? 0]?.note
        : session.entries[entry]?.note;
    setNoteText(current ?? '');
    setSheet({ kind, entry, ...(set !== undefined ? { set } : {}) } as SheetState);
  };

  const saveNote = () => {
    if (!sheet) return;
    const text = noteText.trim();
    if (sheet.kind === 'serie-note') {
      patchSet(sheet.entry, sheet.set, { note: text || undefined });
    } else if (sheet.kind === 'entry-note') {
      patchEntry(sheet.entry, (e) => {
        e.note = text || undefined;
      });
    }
    setSheet(null);
  };

  const finalize = () => {
    finalizeSession(session.id);
    navigate(`/historial/${session.id}`);
  };

  // Menú de serie: fijo o cronometrada. El rango (4-6) es solo del plan.
  const serieSet =
    sheet?.kind === 'serie' ? session.entries[sheet.entry]?.sets[sheet.set] : undefined;
  const serieMode: SetMode = serieSet ? setModeOf(serieSet) : 'fixed';
  const allModeOptions: { mode: SessionSetMode; label: string }[] = [
    { mode: 'fixed', label: '♯ Pasar a número fijo' },
    { mode: 'timed', label: '⏱ Pasar a cronometrada (s)' },
  ];
  const modeOptions = allModeOptions.filter((o) => o.mode !== serieMode);

  return (
    <>
      <header class="view-head">
        <button class="back-btn" aria-label="Salir (se guarda solo)" onClick={() => navigate('/')}>
          ←
        </button>
        <h1>
          {session.dayName}
          <span class="sub">
            {fmtDate(session.date)}
            {routine ? ` · ${routine.name}` : ' · sin rutina'}
            {session.date !== todayISO() ? ' · reabierta' : ''}
          </span>
        </h1>
        <button
          class="icon-btn"
          aria-label="Cambiar la fecha de la sesión"
          onClick={() => {
            setDateText(session.date);
            setDateOpen(true);
          }}
        >
          📅
        </button>
      </header>

      <div class="session-progress">
        <div class="bar">
          <span style={`width:${total === 0 ? 0 : Math.round((done / total) * 100)}%`} />
        </div>
        <span class="count">
          {done}/{total} series
        </span>
      </div>

      {session.entries.length === 0 && (
        <div class="card">
          <div class="empty" style="padding:16px 8px">
            <span class="empty-ico">➕</span>
            <h3>Sin ejercicios</h3>
            <p>Añade el primero para empezar a registrar series.</p>
          </div>
        </div>
      )}

      {session.entries.map((entry, ei) => {
        const { prevSession, prevEntry, plannedEx } = comparisons[ei];
        const entryDone = entry.sets.filter((st) => st.done).length;
        return (
          <article class="exercise-card" key={`${ei}-${entry.exerciseName}`}>
            <div class="exercise-head">
              <div class="ex-names">
                <h3>{entry.exerciseName}</h3>
                <div class="ex-meta">
                  <span>
                    {entryDone}/{entry.sets.length} series
                  </span>
                  {plannedEx?.muscleGroup && <span>· {plannedEx.muscleGroup}</span>}
                  {prevSession && (
                    <span class="prev-hint">Ant. {fmtRelative(prevSession.date)}</span>
                  )}
                </div>
              </div>
              <button
                class="icon-btn"
                aria-label={`Opciones de ${entry.exerciseName}`}
                onClick={() => openNoteSheet('entry-note', ei)}
              >
                ⋮
              </button>
            </div>

            <div class="exercise-progress">
              <span
                style={`width:${
                  entry.sets.length === 0
                    ? 0
                    : Math.round((entryDone / entry.sets.length) * 100)
                }%`}
              />
            </div>

            {entry.note && <div class="exercise-note">✎ {entry.note}</div>}

            <div class="series-list">
              {entry.sets.map((set, si) => (
                <SeriesRow
                  key={si}
                  index={si}
                  unit={s.settings.unit}
                  performed={set}
                  planned={plannedEx?.plannedSets[si]}
                  previousSet={prevEntry?.sets[si]}
                  previousDate={prevEntry ? prevSession?.date : undefined}
                  onPatch={(patch) => patchSet(ei, si, patch)}
                  onMenu={() => setSheet({ kind: 'serie', entry: ei, set: si })}
                />
              ))}
            </div>

            <div class="exercise-foot">
              <button class="btn btn-sm" onClick={() => addSet(ei)}>
                ＋ Serie
              </button>
              <button class="btn btn-sm" onClick={() => openNoteSheet('entry-note', ei)}>
                ✎ Nota
              </button>
              <button
                class="btn btn-sm"
                style="margin-left:auto"
                onClick={() => setConfirmDeleteEntry(ei)}
              >
                🗑
              </button>
            </div>
          </article>
        );
      })}

      <button class="btn btn-block" style="margin-top:14px" onClick={() => setSheet({ kind: 'add-exercise' })}>
        ＋ Añadir ejercicio
      </button>

      <p class="autosave">Todo se guarda automáticamente en este dispositivo.</p>

      <RestControls presets={s.settings.restPresets} />

      <div class="session-bar">
        <button class="btn btn-primary btn-lg" onClick={finalize}>
          Finalizar sesión
        </button>
      </div>

      {/* Menú de opciones de serie */}
      <BottomSheet
        open={sheet?.kind === 'serie'}
        onClose={() => setSheet(null)}
        title={
          sheet?.kind === 'serie'
            ? `Serie ${sheet.set + 1} · ${session.entries[sheet.entry]?.exerciseName}`
            : ''
        }
      >
        {sheet?.kind === 'serie' && (
          <>
            <button class="sheet-action" onClick={() => openNoteSheet('serie-note', sheet.entry, sheet.set)}>
              ✎ {session.entries[sheet.entry]?.sets[sheet.set]?.note ? 'Editar nota' : 'Añadir nota'}
            </button>
            <button
              class="sheet-action"
              disabled={!comparisons[sheet.entry].plannedEx?.plannedSets[sheet.set]}
              onClick={() => {
                copyPlanToSet(sheet.entry, sheet.set);
                setSheet(null);
              }}
            >
              ⤓ Copiar plan a esta serie
            </button>
            {modeOptions.map((o) => (
              <button
                key={o.mode}
                class="sheet-action"
                onClick={() => {
                  applySetMode(sheet.entry, sheet.set, o.mode);
                  setSheet(null);
                }}
              >
                {o.label}
              </button>
            ))}
            <button
              class="sheet-action"
              onClick={() => {
                applySetToAll(sheet.entry, sheet.set);
                setSheet(null);
              }}
            >
              ⧉ Aplicar esta serie a todas
            </button>
            <button
              class="sheet-action is-danger"
              onClick={() => {
                setConfirmDeleteSet({ entry: sheet.entry, set: sheet.set });
                setSheet(null);
              }}
            >
              ✕ Eliminar serie
            </button>
          </>
        )}
      </BottomSheet>

      {/* Nota de serie o de ejercicio */}
      <BottomSheet
        open={sheet?.kind === 'serie-note' || sheet?.kind === 'entry-note'}
        onClose={() => setSheet(null)}
        title="Nota"
      >
        <textarea
          class="input"
          placeholder="Ej.: hombro molestó, subir peso la próxima…"
          value={noteText}
          onInput={(e) => setNoteText(e.currentTarget.value)}
        />
        <button class="btn btn-primary btn-block" onClick={saveNote}>
          Guardar nota
        </button>
      </BottomSheet>

      {/* Añadir ejercicio (con autocompletado del catálogo) */}
      <BottomSheet open={sheet?.kind === 'add-exercise'} onClose={() => setSheet(null)} title="Añadir ejercicio">
        <ExercisePicker
          exercises={s.exercises}
          value={exerciseName}
          placeholder="Nombre del ejercicio"
          onName={setExerciseName}
          onPick={(ex) => {
            setExerciseName(ex.name);
            setPickedExercise(ex);
          }}
          onCreate={(n) => {
            setExerciseName(n);
            setPickedExercise(null);
          }}
        />
        <p class="hint">
          Si ya lo entrenaste, saldrá tu mejor resultado (peso y reps) o el plan, lo más
          exigente.
        </p>
        <button class="btn btn-primary btn-block" onClick={addExercise}>
          Añadir
        </button>
      </BottomSheet>

      {/* Cambiar la fecha de realización de la sesión en curso */}
      <BottomSheet open={dateOpen} onClose={() => setDateOpen(false)} title="Fecha de la sesión">
        <label class="field" for="session-date-input">
          <span class="field-label">Fecha de realización</span>
          <input
            id="session-date-input"
            class="input"
            type="date"
            value={dateText}
            onInput={(e) => setDateText(e.currentTarget.value)}
          />
        </label>
        <p class="hint">
          La sesión no mide duración: la fecha es lo único que dice cuándo entrenaste.
        </p>
        <button
          class="btn btn-primary btn-block"
          onClick={() => {
            setSessionDate(session.id, dateText);
            setDateOpen(false);
          }}
        >
          Guardar fecha
        </button>
      </BottomSheet>

      <ConfirmDialog
        open={confirmDeleteEntry !== null}
        title="Quitar ejercicio"
        message={`"${
          confirmDeleteEntry !== null ? session.entries[confirmDeleteEntry]?.exerciseName : ''
        }" y sus series se quitarán de la sesión. ¿Continuar?`}
        confirmLabel="Quitar"
        danger
        onConfirm={() => {
          if (confirmDeleteEntry !== null) {
            const idx = confirmDeleteEntry;
            patchSession(session.id, (draft) => {
              draft.entries.splice(idx, 1);
            });
          }
          setConfirmDeleteEntry(null);
        }}
        onCancel={() => setConfirmDeleteEntry(null)}
      />

      <ConfirmDialog
        open={confirmDeleteSet !== null}
        title="Eliminar serie"
        message="Esta serie y sus valores se perderán."
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          if (confirmDeleteSet) removeSet(confirmDeleteSet.entry, confirmDeleteSet.set);
          setConfirmDeleteSet(null);
        }}
        onCancel={() => setConfirmDeleteSet(null)}
      />
    </>
  );
}
