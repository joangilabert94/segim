import type { BackupFile, BackupTarget } from '../backup';
import { fmtDateTime } from '../format';
import { type NoticeAction, pushNotice } from '../notices';
import { DriveError } from './api';
import { driveTarget } from './target';

export type AutoBackupReason =
  | 'session-complete'
  | 'session-edit'
  | 'routine-edit'
  | 'exercise-edit';

// Las ediciones llegan a ráfagas: con un retardo corto se subirían decenas de versiones inútiles.
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
  | { status: 'failed'; message: string; needsAuth?: boolean };

export interface AutoBackupOptions {
  build: () => BackupFile;
  enabled: boolean;
  target?: BackupTarget;
  notify?: (text: string, kind: 'ok' | 'info' | 'error', action?: NoticeAction) => void;
  dated?: boolean;
  interactive?: boolean;
}

export const MANUAL_HINT = 'Puedes subirla a mano desde Ajustes (☁️ Subir ahora).';
export const AUTH_HINT = 'Toca ☁️ Subir ahora para autorizar y subirla.';

export interface AutoBackupNotice {
  text: string;
  kind: 'ok' | 'info' | 'error';
}

export function autoBackupNotice(outcome: AutoBackupOutcome): AutoBackupNotice | null {
  if (outcome.status === 'skipped') return null;
  if (outcome.status === 'failed') {
    return {
      text: `No se pudo subir la copia. ${outcome.message} ${outcome.needsAuth ? AUTH_HINT : MANUAL_HINT}`,
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

function failureMessage(err: unknown): string {
  if (err instanceof DriveError) {
    if (err.kind === 'auth') {
      return 'Google pide volver a autorizar.';
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'No se pudo hablar con Google Drive.';
}

export async function autoBackup(options: AutoBackupOptions): Promise<AutoBackupOutcome> {
  const target = options.target ?? driveTarget;
  const notify =
    options.notify ??
    ((text: string, kind: 'ok' | 'info' | 'error', action?: NoticeAction) =>
      pushNotice(text, kind, { action }));

  if (!options.enabled) return { status: 'skipped', reason: 'disabled' };

  const finish = (outcome: AutoBackupOutcome): AutoBackupOutcome => {
    const notice = autoBackupNotice(outcome);
    if (!notice) return outcome;
    const action: NoticeAction | undefined =
      outcome.status === 'failed' && outcome.needsAuth
        ? {
            label: '☁️ Subir ahora',
            run: () => void scheduleAutoBackup({ ...options, interactive: true }),
          }
        : undefined;
    notify(notice.text, notice.kind, action);
    return outcome;
  };

  try {
    const status = await target.status();
    if (!status.available) return finish({ status: 'skipped', reason: 'unavailable' });
    if (!status.connected) return finish({ status: 'skipped', reason: 'not-connected' });

    const interactive = options.interactive === true;
    // Sin un toque, la ventana de Google la bloquea el navegador: el toque llega desde el aviso.
    if (!interactive && status.authorized === false) {
      return finish({
        status: 'failed',
        message: 'El permiso de Google ha caducado.',
        needsAuth: true,
      });
    }

    const uploadOptions: { interactive: boolean; dated?: boolean } = { interactive };
    if (options.dated === false) uploadOptions.dated = false;

    const result = await target.upload(options.build(), uploadOptions);
    return finish({ status: 'uploaded', ...result });
  } catch (err) {
    return finish({
      status: 'failed',
      message: failureMessage(err),
      ...(err instanceof DriveError && err.kind === 'auth' ? { needsAuth: true } : {}),
    });
  }
}

// Una subida a la vez: dos solapadas competirían por el token o duplicarían la copia fechada.
let queue: Promise<unknown> = Promise.resolve();

export function scheduleAutoBackup(options: AutoBackupOptions): Promise<AutoBackupOutcome> {
  // `then` con dos callbacks: si la anterior falló, la cola sigue viva.
  const run = queue.then(
    () => autoBackup(options),
    () => autoBackup(options),
  );
  queue = run.catch(() => undefined);
  return run;
}

export interface AutoBackupRequest extends AutoBackupOptions {
  reason: AutoBackupReason;
  delay?: number;
}

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pending: AutoBackupOptions | null = null;

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

export function flushPendingAutoBackup(): void {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  const options = pending;
  pending = null;
  if (options) void scheduleAutoBackup(options);
}

export function cancelPendingAutoBackup(): void {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  pending = null;
}

export function pendingAutoBackup(): AutoBackupOptions | null {
  return pending;
}
