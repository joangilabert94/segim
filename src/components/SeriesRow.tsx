// Fila de una serie dentro de una sesión:
// [check] Serie n | Plan · Anterior | inputs peso × reps | menú ⋮

import { useEffect, useState } from 'preact/hooks';
import type { PerformedSet, PlannedSet, Unit } from '../models';
import { fmtRelative, parseNumber } from '../services/format';

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
  const [repsText, setRepsText] = useState(String(performed.reps));

  // Sincroniza el texto si el valor cambia desde fuera (prefill, "copiar plan"...)
  useEffect(() => setWeightText(String(performed.weight)), [performed.weight]);
  useEffect(() => setRepsText(String(performed.reps)), [performed.reps]);

  const commitWeight = (text: string) => {
    const n = parseNumber(text);
    if (n !== null && n !== performed.weight) onPatch({ weight: n });
  };
  const commitReps = (text: string) => {
    const n = parseNumber(text);
    if (n !== null && n !== performed.reps) onPatch({ reps: Math.round(n) });
  };

  const planText =
    planned === undefined
      ? '—'
      : `${planned.weight !== undefined ? planned.weight : '—'} × ${planned.reps}`;
  const prevText = previousSet ? `${previousSet.weight} × ${previousSet.reps}` : '—';

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
            <label class="num-field num-reps">
              <input
                type="text"
                inputMode="numeric"
                value={repsText}
                aria-label={`Repeticiones de la serie ${index + 1}`}
                onInput={(e) => setRepsText(e.currentTarget.value)}
                onChange={(e) => commitReps(e.currentTarget.value)}
                onBlur={(e) => {
                  const n = parseNumber(e.currentTarget.value);
                  if (n === null) setRepsText(String(performed.reps));
                  else commitReps(e.currentTarget.value);
                }}
              />
            </label>
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
