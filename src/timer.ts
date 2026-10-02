// Estado del cronómetro de descanso (opcional, nunca arranca solo).

import { useEffect, useState } from 'preact/hooks';

export interface TimerState {
  total: number; // segundos totales del descanso (0 = sin descanso)
  endsAt: number; // timestamp en milisegundos
  running: boolean;
  finished: boolean;
}

const IDLE: TimerState = { total: 0, endsAt: 0, running: false, finished: false };

let state: TimerState = { ...IDLE };
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | undefined;

function emit(): void {
  listeners.forEach((fn) => fn());
}

function clearTick(): void {
  if (interval !== undefined) {
    clearInterval(interval);
    interval = undefined;
  }
}

function notifyFinished(): void {
  // Aviso sutil: vibración si el dispositivo la soporta + pitido corto.
  try {
    navigator.vibrate?.([200, 80, 200]);
  } catch {
    /* sin vibración disponible */
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.12;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
      osc.onended = () => ctx.close().catch(() => undefined);
    }
  } catch {
    /* sin audio disponible */
  }
}

function tick(): void {
  if (state.running && Date.now() >= state.endsAt) {
    state = { ...state, running: false, finished: true };
    clearTick();
    notifyFinished();
  }
  emit();
}

/** Inicia (o reinicia) un descanso de `seconds` segundos. */
export function startTimer(seconds: number): void {
  state = {
    total: seconds,
    endsAt: Date.now() + seconds * 1000,
    running: true,
    finished: false,
  };
  clearTick();
  interval = setInterval(tick, 250);
  emit();
}

/** Detiene y limpia el descanso. */
export function stopTimer(): void {
  state = { ...IDLE };
  clearTick();
  emit();
}

export function getTimer(): TimerState {
  return state;
}

export function subscribeTimer(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Segundos restantes (0 si terminó). */
export function remainingSeconds(timer: TimerState = state): number {
  if (timer.finished) return 0;
  if (!timer.running) return timer.total;
  return Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
}

/** Hook con la actualización del cronómetro. */
export function useTimer(): TimerState {
  const [, setTickState] = useState(0);
  useEffect(() => subscribeTimer(() => setTickState((t) => t + 1)), []);
  return state;
}
