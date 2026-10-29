// Copia automática al terminar una sesión: cuándo se salta, qué avisa y cómo
// trata los fallos. Todo con un destino falso, sin red ni IndexedDB.

import { describe, expect, it, vi } from 'vitest';
import type { BackupFile, BackupTarget, BackupTargetStatus } from '../src/services/backup';
import { DEFAULT_SETTINGS } from '../src/models';
import { DriveError } from '../src/services/drive/api';
import { fmtDateTime } from '../src/services/format';
import {
  AUTH_HINT,
  AUTO_BACKUP_DELAY_MS,
  MANUAL_HINT,
  autoBackup,
  autoBackupNotice,
  cancelPendingAutoBackup,
  flushPendingAutoBackup,
  pendingAutoBackup,
  requestAutoBackup,
  scheduleAutoBackup,
} from '../src/services/drive/autoBackup';
import { parseSettings } from '../src/services/validation';
import { type NoticeAction, pushNotice } from '../src/services/notices';

vi.mock('../src/services/notices', () => ({ pushNotice: vi.fn() }));

const SYNCED_AT = '2026-10-28T18:42:00.000Z';

const backup = (): BackupFile => ({
  app: 'gymrutinas',
  version: 1,
  exportedAt: '2026-10-28T18:40:00.000Z',
  routines: [],
  exercises: [],
  sessions: [],
  settings: DEFAULT_SETTINGS,
});

interface UploadResult {
  syncedAt: string;
  warning?: string;
}

interface FakeOptions {
  status?: BackupTargetStatus;
  statusThrows?: boolean;
  upload?: () => Promise<UploadResult>;
}

function fakeTarget(options: FakeOptions = {}) {
  const upload = vi.fn(
    async (_file: BackupFile, _opts?: { interactive?: boolean }): Promise<UploadResult> =>
      options.upload ? options.upload() : { syncedAt: SYNCED_AT },
  );
  const status = vi.fn(async (): Promise<BackupTargetStatus> => {
    if (options.statusThrows) throw new Error('IndexedDB no disponible');
    return options.status ?? { available: true, connected: true, lastSyncAt: SYNCED_AT };
  });
  const target: BackupTarget = {
    label: 'Falso',
    upload,
    downloadLatest: async () => backup(),
    status,
  };
  return { target, upload, status };
}

function collect() {
  const notices: { text: string; kind: 'ok' | 'info' | 'error'; action?: NoticeAction }[] = [];
  return {
    notices,
    notify: (text: string, kind: 'ok' | 'info' | 'error', action?: NoticeAction) =>
      notices.push(action ? { text, kind, action } : { text, kind }),
  };
}

describe('autoBackup: cuándo actúa', () => {
  it('no hace nada si el ajuste está desactivado, y no avisa', async () => {
    const { target, upload, status } = fakeTarget();
    const { notices, notify } = collect();

    const out = await autoBackup({ build: backup, enabled: false, target, notify });

    expect(out).toEqual({ status: 'skipped', reason: 'disabled' });
    expect(upload).not.toHaveBeenCalled();
    // Ni siquiera se consulta el estado: desactivada es coste cero.
    expect(status).not.toHaveBeenCalled();
    expect(notices).toHaveLength(0);
  });

  it('se salta en silencio si no hay copia vinculada', async () => {
    const { target, upload } = fakeTarget({ status: { available: true, connected: false } });
    const { notices, notify } = collect();

    const out = await autoBackup({ build: backup, enabled: true, target, notify });

    expect(out).toEqual({ status: 'skipped', reason: 'not-connected' });
    expect(upload).not.toHaveBeenCalled();
    expect(notices).toHaveLength(0);
  });

  it('se salta en silencio si el build no tiene Client ID', async () => {
    const { target } = fakeTarget({ status: { available: false, connected: false } });
    const { notices, notify } = collect();

    const out = await autoBackup({ build: backup, enabled: true, target, notify });

    expect(out).toEqual({ status: 'skipped', reason: 'unavailable' });
    expect(notices).toHaveLength(0);
  });
});

describe('autoBackup: subida correcta', () => {
  it('sube en modo silencioso y confirma con la fecha del destino', async () => {
    const { target, upload } = fakeTarget();
    const { notices, notify } = collect();

    const out = await autoBackup({ build: backup, enabled: true, target, notify });

    expect(out).toEqual({ status: 'uploaded', syncedAt: SYNCED_AT });
    expect(upload).toHaveBeenCalledTimes(1);
    // Nunca abre la ventana de Google: no hay gesto de usuario al cerrar sesión.
    expect(upload.mock.calls[0][1]).toEqual({ interactive: false });
    expect(upload.mock.calls[0][0].app).toBe('gymrutinas');
    expect(notices).toEqual([
      {
        kind: 'ok',
        text: `☁️ Copia subida a tu Google Drive (${fmtDateTime(SYNCED_AT)}).`,
      },
    ]);
  });

  it('avisa con tono informativo si la copia fechada falló pero la principal subió', async () => {
    const { target } = fakeTarget({
      upload: async () => ({ syncedAt: SYNCED_AT, warning: 'Drive lleno' }),
    });
    const { notices, notify } = collect();

    const out = await autoBackup({ build: backup, enabled: true, target, notify });

    expect(out.status).toBe('uploaded');
    expect(notices).toHaveLength(1);
    expect(notices[0].kind).toBe('info');
    expect(notices[0].text).toContain('copia fechada falló: Drive lleno');
  });
});

describe('autoBackup: fallos', () => {
  it('si Google pide reautorizar, lo dice y ofrece subir con un toque', async () => {
    const { target } = fakeTarget({
      upload: async () => {
        throw new DriveError('auth', 401, 'La sesión con Google ha caducado.');
      },
    });
    const { notices, notify } = collect();

    const out = await autoBackup({ build: backup, enabled: true, target, notify });

    expect(out.status).toBe('failed');
    if (out.status !== 'failed') return;
    expect(out.message).toContain('volver a autorizar');
    expect(notices).toHaveLength(1);
    expect(notices[0].kind).toBe('error');
    expect(notices[0].text).toContain(AUTH_HINT);
    expect(notices[0].action?.label).toContain('Subir ahora');
  });

  it('sin permiso vigente no pide token en segundo plano: avisa con un botón', async () => {
    const { target, upload } = fakeTarget({
      status: { available: true, connected: true, authorized: false },
    });
    const { notices, notify } = collect();

    const out = await autoBackup({ build: backup, enabled: true, target, notify });

    expect(out).toMatchObject({ status: 'failed', needsAuth: true });
    expect(upload).not.toHaveBeenCalled();
    expect(notices[0].text).toContain(AUTH_HINT);
    expect(notices[0].action).toBeDefined();
  });

  it('sin notify propio, el aviso global lleva el botón', async () => {
    const { target } = fakeTarget({
      status: { available: true, connected: true, authorized: false },
    });

    await autoBackup({ build: backup, enabled: true, target });

    expect(pushNotice).toHaveBeenCalledWith(
      expect.stringContaining(AUTH_HINT),
      'error',
      { action: expect.objectContaining({ label: '☁️ Subir ahora' }) },
    );
  });

  it('el botón del aviso sube de forma interactiva', async () => {
    const { target, upload, status } = fakeTarget();
    status.mockResolvedValueOnce({ available: true, connected: true, authorized: false });
    const { notices, notify } = collect();

    await autoBackup({ build: backup, enabled: true, target, notify, dated: false });
    notices[0].action?.run();
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));

    expect(upload.mock.calls[0][1]).toEqual({ interactive: true, dated: false });
    await vi.waitFor(() => expect(notices).toHaveLength(2));
    expect(notices[1].kind).toBe('ok');
  });

  it('reutiliza el mensaje del error de Drive (sin conexión, cuota…)', async () => {
    const { target } = fakeTarget({
      upload: async () => {
        throw new DriveError('quota', 403, 'Tu Google Drive no tiene espacio libre.');
      },
    });
    const { notices, notify } = collect();

    const out = await autoBackup({ build: backup, enabled: true, target, notify });

    expect(out.status).toBe('failed');
    expect(notices[0].text).toContain('no tiene espacio libre');
  });

  it('un fallo leyendo el estado no rompe nada: se convierte en aviso', async () => {
    const { target } = fakeTarget({ statusThrows: true });
    const { notices, notify } = collect();

    const out = await autoBackup({ build: backup, enabled: true, target, notify });

    expect(out.status).toBe('failed');
    expect(notices[0].kind).toBe('error');
    expect(notices[0].text).toContain('IndexedDB no disponible');
  });
});

describe('autoBackup: encolado', () => {
  it('terminar dos sesiones seguidas no solapa dos subidas', async () => {
    let active = 0;
    let maxActive = 0;
    const { target } = fakeTarget({
      upload: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { syncedAt: SYNCED_AT };
      },
    });
    const { notices, notify } = collect();
    const options = { build: backup, enabled: true, target, notify };

    const [first, second] = await Promise.all([
      scheduleAutoBackup(options),
      scheduleAutoBackup(options),
    ]);

    expect(maxActive).toBe(1);
    expect(first.status).toBe('uploaded');
    expect(second.status).toBe('uploaded');
    expect(notices).toHaveLength(2);
  });
});

describe('autoBackupNotice', () => {
  it('no hay mensaje cuando no se ha hecho nada', () => {
    expect(autoBackupNotice({ status: 'skipped', reason: 'disabled' })).toBeNull();
  });
});

describe('ajuste autoBackup', () => {
  it('está desactivado por defecto y solo acepta un booleano true', () => {
    expect(parseSettings({}).autoBackup).toBe(false);
    expect(parseSettings({ autoBackup: true }).autoBackup).toBe(true);
    // Valores raros de una copia manipulada no activan la subida.
    expect(parseSettings({ autoBackup: 'sí' }).autoBackup).toBe(false);
    expect(parseSettings({ autoBackup: 1 }).autoBackup).toBe(false);
  });

  it('se conserva al validar una copia completa', () => {
    const settings = parseSettings({ ...DEFAULT_SETTINGS, autoBackup: true });
    expect(settings.autoBackup).toBe(true);
  });
});

describe('retardos por motivo', () => {
  it('el cierre de sesión sube antes que una edición', () => {
    expect(AUTO_BACKUP_DELAY_MS['session-complete']).toBeLessThan(
      AUTO_BACKUP_DELAY_MS['session-edit'],
    );
    expect(AUTO_BACKUP_DELAY_MS['session-edit']).toBeLessThanOrEqual(
      AUTO_BACKUP_DELAY_MS['routine-edit'],
    );
  });

  it('respeta el retardo del motivo antes de subir', async () => {
    const { target, upload } = fakeTarget();
    vi.useFakeTimers();
    try {
      requestAutoBackup({
        reason: 'routine-edit',
        build: backup,
        enabled: true,
        target,
        notify: vi.fn(),
      });

      await vi.advanceTimersByTimeAsync(AUTO_BACKUP_DELAY_MS['routine-edit'] - 1);
      expect(upload).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(upload).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      cancelPendingAutoBackup();
    }
  });

  it('una ráfaga de ediciones acaba en una sola subida', async () => {
    const { target, upload } = fakeTarget();
    vi.useFakeTimers();
    try {
      const request = {
        reason: 'routine-edit' as const,
        build: backup,
        enabled: true,
        target,
        notify: vi.fn(),
      };
      requestAutoBackup(request);
      await vi.advanceTimersByTimeAsync(20_000);
      // Llegan más cambios: la espera se reinicia con cada uno.
      requestAutoBackup(request);
      requestAutoBackup(request);
      await vi.advanceTimersByTimeAsync(AUTO_BACKUP_DELAY_MS['routine-edit'] - 1);
      expect(upload).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(upload).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      cancelPendingAutoBackup();
    }
  });

  it('desactivar la copia automática descarta lo que estaba en cola', async () => {
    const { target, upload } = fakeTarget();
    vi.useFakeTimers();
    try {
      requestAutoBackup({
        reason: 'exercise-edit',
        build: backup,
        enabled: true,
        target,
        notify: vi.fn(),
      });
      expect(pendingAutoBackup()).not.toBeNull();

      requestAutoBackup({
        reason: 'exercise-edit',
        build: backup,
        enabled: false,
        target,
        notify: vi.fn(),
      });
      expect(pendingAutoBackup()).toBeNull();

      await vi.advanceTimersByTimeAsync(120_000);
      expect(upload).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      cancelPendingAutoBackup();
    }
  });

  it('flush sube de inmediato lo pendiente', async () => {
    const { target, upload } = fakeTarget();
    vi.useFakeTimers();
    try {
      requestAutoBackup({
        reason: 'session-complete',
        build: backup,
        enabled: true,
        target,
        notify: vi.fn(),
      });

      flushPendingAutoBackup();
      await vi.advanceTimersByTimeAsync(0);

      expect(upload).toHaveBeenCalledTimes(1);
      expect(pendingAutoBackup()).toBeNull();
    } finally {
      vi.useRealTimers();
      cancelPendingAutoBackup();
    }
  });
});

describe('copias fechadas', () => {
  it('las ediciones no crean copia fechada; el cierre de sesión, sí', async () => {
    const edit = fakeTarget();
    await autoBackup({
      build: backup,
      enabled: true,
      dated: false,
      target: edit.target,
      notify: vi.fn(),
    });
    // `dated: false` = solo la copia viva (la que se restaura).
    expect(edit.upload.mock.calls[0][1]).toEqual({ interactive: false, dated: false });

    const complete = fakeTarget();
    await autoBackup({
      build: backup,
      enabled: true,
      dated: true,
      target: complete.target,
      notify: vi.fn(),
    });
    expect(complete.upload.mock.calls[0][1]).toEqual({ interactive: false });
  });
});
