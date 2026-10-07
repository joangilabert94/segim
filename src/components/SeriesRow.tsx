// Fila de una serie dentro de una sesión:
// [check] Serie n | Plan · Anterior | inputs peso × reps (o segundos) | menú ⋮

import { useEffect, useState } from 'preact/hooks';
import type { PerformedSet, PlannedSet, Unit } from '../models';
import { fmtReps, fmtRelative, parseNumber, parseRepsFixed } from '../services/format';

/** Texto de comparación de una serie: `60 × 4-6` o `— × 30 s` (cronometrada). */
function fmtSetForCompare(
  weight: number | undefined,
  reps: number,
  repsMax?: number,
  durationSec?: number,
): string {
  const w = weight !== undefined ? weight : '—';
  return durationSec !== undefined
    ? `${w} × ${durationSec} s`
    : `${w} × ${fmtReps(reps, repsMax)}`;
}

interface Props {
  index: number;
  unit: Unit;
  performed: PerformedSet;
  planned?: PlannedSet;
  /** Serie equivalente (mismo índice) de la sesión anterior + su fecha. */
  previousSet?: PerformedSet;
  previousDate?: string;
  onPatch: (patch: Partial<PerformedSet>) => void;
  onMenu: () => void;
}

export function SeriesRow({
  index,
  unit,
  performed,
  planned,
  previousSet,
  previousDate,
  onPatch,
  onMenu,
}: Props) {
  const [weightText, setWeightText] = useState(String(performed.weight));
  // La sugerencia puede ser un rango del plan (4-6): el campo lo muestra,
  // pero solo admite teclear un número exacto (lo conseguido).
  const [repsText, setRepsText] = useState(fmtReps(performed.reps, performed.repsMax));
  const [durationText, setDurationText] = useState(String(performed.durationSec ?? 30));

  // Serie cronometrada: manda durationSec y se editan segundos en vez de reps.
  const timed = performed.durationSec !== undefined;
  // Sincroniza el texto si el valor cambia desde fuera (prefill, "copiar plan"...)
  useEffect(() => setWeightText(String(performed.weight)), [performed.weight]);
  useEffect(
    () => setRepsText(fmtReps(performed.reps, performed.repsMax)),
    [performed.reps, performed.repsMax],
  );
  useEffect(
    () => setDurationText(String(performed.durationSec ?? 30)),
    [performed.durationSec],
  );

  const commitWeight = (text: string) => {
    const n = parseNumber(text);
    if (n !== null && n !== performed.weight) onPatch({ weight: n });
  };
  const commitReps = (text: string) => {
    const next = parseRepsFixed(text); // "4-6" → null: teclear solo admite número exacto
    if (next === null) return;
    if (next !== performed.reps || performed.repsMax !== undefined) {
      // Al editar, la sugerencia de rango se sustituye por lo conseguido.
      onPatch({ reps: next, repsMax: undefined });
    }
  };
  const commitDuration = (text: string) => {
    const n = parseNumber(text);
    const next = n === null ? null : Math.max(1, Math.round(n));
    if (next !== null && next !== performed.durationSec) onPatch({ durationSec: next });
  };

  const planText =
    planned === undefined
      ? '—'
      : fmtSetForCompare(planned.weight, planned.reps, planned.repsMax, planned.durationSec);
  const prevText = previousSet
    ? fmtSetForCompare(
        previousSet.weight,
        previousSet.reps,
        previousSet.repsMax,
        previousSet.durationSec,
      )
    : '—';

  return (
    <div class={`series-row ${performed.done ? 'is-done' : ''}`}>
      <button
        class="check"
        aria-label={performed.done ? 'Desmarcar serie' : 'Marcar serie hecha'}
        aria-pressed={performed.done}
        onClick={() => onPatch({ done: !performed.done })}
      >
        {performed.done ? '✓' : ''}
      </button>

      <div class="series-main">
        <div class="series-top">
          <span class="series-label">
            Serie {index + 1}
            {performed.extra && <em class="tag-extra">extra</em>}
            {performed.note && <em class="tag-note" title={performed.note}>✎</em>}
          </span>
          <div class="series-inputs">
            <label class="num-field">
              <input
                type="text"
                inputMode="decimal"
                value={weightText}
                aria-label={`Peso de la serie ${index + 1}`}
                onInput={(e) => setWeightText(e.currentTarget.value)}
                onChange={(e) => commitWeight(e.currentTarget.value)}
                onBlur={(e) => {
                  const n = parseNumber(e.currentTarget.value);
                  if (n === null) setWeightText(String(performed.weight));
                  else commitWeight(e.currentTarget.value);
                }}
              />
              <span class="num-suffix">{unit}</span>
            </label>
            <span class="times">×</span>
            {timed ? (
              <label class="num-field num-dur">
                <input
                  type="text"
                  inputMode="numeric"
                  value={durationText}
                  aria-label={`Duración de la serie ${index + 1} en segundos`}
                  onInput={(e) => setDurationText(e.currentTarget.value)}
                  onChange={(e) => commitDuration(e.currentTarget.value)}
                  onBlur={(e) => {
                    const n = parseNumber(e.currentTarget.value);
                    if (n === null) setDurationText(String(performed.durationSec ?? 30));
                    else commitDuration(e.currentTarget.value);
                  }}
                />
                <span class="num-suffix">s</span>
              </label>
            ) : (
              <label class="num-field num-reps">
                <input
                  type="text"
                  inputMode="numeric"
                  value={repsText}
                  aria-label={`Repeticiones de la serie ${index + 1}`}
                  onInput={(e) => setRepsText(e.currentTarget.value)}
                  onChange={(e) => commitReps(e.currentTarget.value)}
                  onBlur={(e) => {
                    if (parseRepsFixed(e.currentTarget.value) === null) {
                      // Rango sin editar u otro texto inválido: vuelve a la sugerencia.
                      setRepsText(fmtReps(performed.reps, performed.repsMax));
                    } else {
                      commitReps(e.currentTarget.value);
                    }
                  }}
                />
              </label>
            )}
          </div>
        </div>
        <div class="series-meta">
          <span>
            Plan <b>{planText}</b>
          </span>
          <span class={previousSet ? 'prev' : 'prev-none'}>
            Ant. <b>{prevText}</b>
            {previousDate && <i> · {fmtRelative(previousDate)}</i>}
          </span>
        </div>
      </div>

      <button class="icon-btn" aria-label="Opciones de la serie" onClick={onMenu}>
        ⋮
      </button>
    </div>
  );
}
