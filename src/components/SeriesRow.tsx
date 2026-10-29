import { useEffect, useState } from 'preact/hooks';
import type { PerformedSet, PlannedSet, Unit } from '../models';
import {
  fmtReps,
  fmtRelative,
  fmtWeight,
  fmtWeightInput,
  parseNumber,
  parseRepsFixed,
} from '../services/format';
import { compareLoad, EXTERNAL_LOAD, fmtLoad, loadSuffix, type LoadProfile } from '../services/load';

function fmtSetForCompare(set: PlannedSet, profile: LoadProfile): string {
  const w = fmtLoad(set.weight, profile);
  return set.durationSec !== undefined
    ? `${w} × ${set.durationSec} s`
    : `${w} × ${fmtReps(set.reps, set.repsMax)}`;
}

interface Props {
  index: number;
  unit: Unit;
  profile?: LoadProfile;
  performed: PerformedSet;
  planned?: PlannedSet;
  previousSet?: PerformedSet;
  previousDate?: string;
  onPatch: (patch: Partial<PerformedSet>) => void;
  onMenu: () => void;
}

export function SeriesRow({
  index,
  unit,
  profile = EXTERNAL_LOAD,
  performed,
  planned,
  previousSet,
  previousDate,
  onPatch,
  onMenu,
}: Props) {
  const [weightText, setWeightText] = useState(fmtWeightInput(performed.weight));
  // Solo datos antiguos traen rango (4-6): se muestra, pero al teclear se guarda fijo.
  const [repsText, setRepsText] = useState(fmtReps(performed.reps, performed.repsMax));
  const [durationText, setDurationText] = useState(String(performed.durationSec ?? 30));

  const timed = performed.durationSec !== undefined;
  useEffect(() => setWeightText(fmtWeightInput(performed.weight)), [performed.weight]);
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
    const next = parseRepsFixed(text);
    if (next === null) return;
    if (next !== performed.reps || performed.repsMax !== undefined) {
      onPatch({ reps: next, repsMax: undefined });
    }
  };
  const commitDuration = (text: string) => {
    const n = parseNumber(text);
    const next = n === null ? null : Math.max(1, Math.round(n));
    if (next !== null && next !== performed.durationSec) onPatch({ durationSec: next });
  };

  const planText = planned === undefined ? '—' : fmtSetForCompare(planned, profile);
  const prevText = previousSet ? fmtSetForCompare(previousSet, profile) : '—';
  const heavier =
    previousSet !== undefined &&
    !timed &&
    previousSet.durationSec === undefined &&
    compareLoad(performed.weight, previousSet.weight, profile) > 0;
  const upText = heavier
    ? `↑ ${profile.load === 'assisted' ? '−' : '+'}${fmtWeight(Math.abs(performed.weight - previousSet.weight))}`
    : undefined;

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
            {upText && (
              <em class="tag-up" title="Más exigente que en la sesión anterior">
                {upText}
              </em>
            )}
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
                  if (n === null) setWeightText(fmtWeightInput(performed.weight));
                  else commitWeight(e.currentTarget.value);
                }}
              />
              <span class="num-suffix">{loadSuffix(profile, unit)}</span>
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
