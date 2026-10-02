// Controles del cronómetro de descanso:
// botón "Descanso" que abre los presets (nunca arranca solo) + píldora flotante
// con la cuenta atrás, reiniciar y parar.

import { useState } from 'preact/hooks';
import { fmtDuration } from '../services/format';
import { getTimer, remainingSeconds, startTimer, stopTimer, useTimer } from '../timer';
import { BottomSheet } from './BottomSheet';

export function RestControls({ presets }: { presets: number[] }) {
  const timer = useTimer();
  const [open, setOpen] = useState(false);
  const active = timer.total > 0;

  if (!active) {
    return (
      <>
        <button class="rest-fab" onClick={() => setOpen(true)}>
          ⏱ Descanso
        </button>
        <BottomSheet open={open} onClose={() => setOpen(false)} title="Iniciar descanso">
          <div class="preset-grid">
            {presets.map((s) => (
              <button
                class="preset-btn"
                key={s}
                onClick={() => {
                  startTimer(s);
                  setOpen(false);
                }}
              >
                {fmtDuration(s)}
              </button>
            ))}
          </div>
        </BottomSheet>
      </>
    );
  }

  const remaining = remainingSeconds(getTimer());

  return (
    <div class={`rest-pill ${timer.finished ? 'is-finished' : ''}`}>
      <span class="rest-time">
        {timer.finished ? '¡Descanso listo!' : fmtDuration(remaining)}
      </span>
      <button
        class="icon-btn"
        aria-label="Reiniciar descanso"
        onClick={() => startTimer(timer.total)}
      >
        ↻
      </button>
      <button class="icon-btn" aria-label="Parar descanso" onClick={() => stopTimer()}>
        ✕
      </button>
    </div>
  );
}
