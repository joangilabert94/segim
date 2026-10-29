// Copia automática en Google Drive.
//
// Se dispara al **terminar una sesión** y al **editar** una sesión, una rutina
// o un ejercicio. Las ediciones llegan a ráfagas (cada tecla de un nombre), así
// que pasan por un temporizador propio: cada motivo tiene su retardo y las
// ráfagas se funden en una sola subida.
//
// Reglas que no se negocian:
// - Solo si el usuario lo activa en Ajustes y ya hay una copia vinculada.
// - Nunca abre ventanas de Google: al terminar una sesión no hay gesto de
//   usuario, así que el token se pide en silencio (`interactive: false`). Si
//   Google exige interacción, se avisa y se deja la vía manual; jamás se dice
//   que se ha subido algo que no se ha subido.
// - Una subida a la vez: dos sesiones seguidas se encolan en lugar de competir
//   por el token o duplicar la copia fechada.
// - Un fallo no interrumpe nada: la sesión ya está guardada en el dispositivo.

import type { BackupFile, BackupTarget } from '../backup';
import { fmtDateTime } from '../format';
import { pushNotice } from '../notices';
import { DriveError } from './api';
import { driveTarget } from './target';

/** Qué ha cambiado. El motivo decide el retardo y si se crea copia fechada. */
export type AutoBackupReason =
  | 'session-complete' // has pulsado "Finalizar"
  | 'session-edit' // fecha, reabrir o borrar una sesión
  | 'routine-edit' // crear, editar, archivar o borrar una rutina
  | 'exercise-edit'; // alta, renombrado o borrado en el catálogo

/**
 * Retardo antes de subir, en milisegundos.
 *
 * - Cierre de sesión: es un evento terminal y único, conviene que la copia
 *   llegue enseguida (y antes de que el usuario cierre la app).
 * - Ediciones: editar es teclear y corregir durante un rato. Un retardo corto
 *   subiría decenas de versiones inútiles, así que se espera a que la persona
 *   deje de tocar nada.
 */
export const AUTO_BACKUP_DELAY_MS: Record<AutoBackupReason, number> = {
  'session-complete': 5_000,
  'session-edit': 20_000,
  'routine-edit': 30_000,
  'exercise-edit': 30_000,
};

export type AutoBackupSkipReason = 'disabled' | 'unavailable' | 'not-connected';

export type AutoBackupOutcome =
  | { status: 'uploaded'; syncedAt: string; warning?: string }
  | { status: 'skipped'; reason: AutoBackupSkipReason }
  | { status: 'failed'; message: string };

export interface AutoBackupOptions {
  /** Datos a copiar. Se lee al subir, no al encolar: así lleva lo último. */
  build: () => BackupFile;
  /** `settings.autoBackup`. Si es false no se hace nada, ni siquiera se avisa. */
  enabled: boolean;
  target?: BackupTarget;
  notify?: (text: string, kind: 'ok' | 'info' | 'error') => void;
  /** `false` = solo actualiza la copia viva (ediciones). Por defecto, true. */
  dated?: boolean;
}

/** Recordatorio que acompaña a cualquier fallo: siempre queda la vía manual. */
export const MANUAL_HINT = 'Puedes subirla a mano desde Ajustes (☁️ Subir ahora).';

export interface AutoBackupNotice {
  text: string;
  kind: 'ok' | 'info' | 'error';
}

/** Mensaje para el usuario; `null` si no hay nada que contar (saltada en silencio). */
export function autoBackupNotice(outcome: AutoBackupOutcome): AutoBackupNotice | null {
  if (outcome.status === 'skipped') return null;
  if (outcome.status === 'failed') {
    return {
      text: `No se pudo subir la copia. ${outcome.message} ${MANUAL_HINT}`,
      kind: 'error',
    };
  }
  if (outcome.warning) {
    return {
      text: `☁️ Copia subida (${fmtDateTime(outcome.syncedAt)}), pero la copia fechada falló: ${outcome.warning}`,
      kind: 'info',
    };
  }
  return {
    text: `☁️ Copia subida a tu Google Drive (${fmtDateTime(outcome.syncedAt)}).`,
    kind: 'ok',
  };
}

/** Traduce el error a algo accionable desde la propia pantalla. */
function failureMessage(err: unknown): string {
  if (err instanceof DriveError) {
    // En segundo plano no se puede abrir la ventana de Google: lo único que
    // arregla esto es que el usuario vuelva a autorizar pulsando un botón.
    if (err.kind === 'auth') {
      return 'Google pide volver a autorizar.';
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'No se pudo hablar con Google Drive.';
}

export async function autoBackup(options: AutoBackupOptions): Promise<AutoBackupOutcome> {
  const target = options.target ?? driveTarget;
  const notify = options.notify ?? pushNotice;

  if (!options.enabled) return { status: 'skipped', reason: 'disabled' };

  const finish = (outcome: AutoBackupOutcome): AutoBackupOutcome => {
    const notice = autoBackupNotice(outcome);
    if (notice) notify(notice.text, notice.kind);
    return outcome;
  };

  try {
    const status = await target.status();
    if (!status.available) return finish({ status: 'skipped', reason: 'unavailable' });
    // Sin copia vinculada no se crea una desde aquí: conectar es una decisión
    // explícita del usuario en Ajustes (la primera subida es la que conecta).
    if (!status.connected) return finish({ status: 'skipped', reason: 'not-connected' });

    const uploadOptions: { interactive: boolean; dated?: boolean } = { interactive: false };
    if (options.dated === false) uploadOptions.dated = false;

    const result = await target.upload(options.build(), uploadOptions);
    return finish({ status: 'uploaded', ...result });
  } catch (err) {
    return finish({ status: 'failed', message: failureMessage(err) });
  }
}

// Cola de una sola vía: terminando dos sesiones seguidas, la segunda espera a
// la primera. Nunca dos subidas solapadas.
let queue: Promise<unknown> = Promise.resolve();

/** Encola la subida automática y devuelve su resultado. */
export function scheduleAutoBackup(options: AutoBackupOptions): Promise<AutoBackupOutcome> {
  // `then` con dos callbacks: si la anterior falló, la cola sigue viva.
  const run = queue.then(
    () => autoBackup(options),
    () => autoBackup(options),
  );
  queue = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------------------
// Temporizador (retardo por motivo)
// ---------------------------------------------------------------------------

export interface AutoBackupRequest extends AutoBackupOptions {
  reason: AutoBackupReason;
  /** Retardo propio; por defecto, el de `reason`. */
  delay?: number;
}

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pending: AutoBackupOptions | null = null;

/**
 * Pide una subida con retardo. Cada petición reinicia la espera, así que una
 * ráfaga de ediciones produce **una** sola subida, con los datos del último
 * cambio. Si la copia automática está desactivada, además cancela lo pendiente.
 */
export function requestAutoBackup(request: AutoBackupRequest): void {
  if (!request.enabled) {
    cancelPendingAutoBackup();
    return;
  }
  const { reason, delay, ...options } = request;
  if (pendingTimer) clearTimeout(pendingTimer);
  pending = options;
  pendingTimer = setTimeout(flushPendingAutoBackup, delay ?? AUTO_BACKUP_DELAY_MS[reason]);
}

/** Sube ya lo que estuviera esperando (no hace nada si no hay nada). */
export function flushPendingAutoBackup(): void {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  const options = pending;
  pending = null;
  if (options) void scheduleAutoBackup(options);
}

/** Olvida la subida pendiente (al desactivar el ajuste o desconectar Drive). */
export function cancelPendingAutoBackup(): void {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  pending = null;
}

/** Petición pendiente, si la hay (para los tests). */
export function pendingAutoBackup(): AutoBackupOptions | null {
  return pending;
}
