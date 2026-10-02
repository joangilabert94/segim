// Autocompletado de ejercicios: elige uno del catálogo o crea uno nuevo.
// Al elegir/crear se guarda el vínculo por id estable.

import { useState } from 'preact/hooks';
import type { Exercise } from '../models';
import { normalizeName } from '../services/previousSession';

interface Props {
  exercises: Exercise[];
  value: string;
  placeholder?: string;
  onName: (name: string) => void;
  onPick: (exercise: Exercise) => void;
  onCreate: (name: string) => void;
  /** Se dispara al salir del campo sin elegir (propaga renombres al catálogo). */
  onCommit?: () => void;
}

export function ExercisePicker({
  exercises,
  value,
  placeholder = 'Ejercicio',
  onName,
  onPick,
  onCreate,
  onCommit,
}: Props) {
  const [open, setOpen] = useState(false);
  const query = value.trim();
  const target = normalizeName(query);

  const matches =
    target === ''
      ? []
      : exercises
          .filter((e) => normalizeName(e.name).includes(target))
          .slice(0, 6);
  const exact = exercises.some((e) => normalizeName(e.name) === target);

  const pick = (ex: Exercise) => {
    onPick(ex);
    setOpen(false);
  };

  const create = () => {
    if (!query) return;
    onCreate(query);
    setOpen(false);
  };

  return (
    <div class="picker">
      <input
        class="input"
        type="text"
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onInput={(e) => {
          onName(e.currentTarget.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onCommit?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (matches.length > 0 && !exact) pick(matches[0]);
            else if (!exact) create();
          }
        }}
      />

      {open && query !== '' && (matches.length > 0 || !exact) && (
        <div class="picker-menu" role="listbox">
          {matches.map((ex) => (
            <button
              key={ex.id}
              class="picker-opt"
              role="option"
              aria-selected={normalizeName(ex.name) === target}
              // Evita que el input pierda el foco antes del clic
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(ex)}
            >
              <b>{ex.name}</b>
              {ex.muscleGroup && <span>{ex.muscleGroup}</span>}
            </button>
          ))}
          {!exact && (
            <button
              class="picker-opt is-new"
              role="option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={create}
            >
              ＋ Crear «{query}»
            </button>
          )}
        </div>
      )}
    </div>
  );
}
