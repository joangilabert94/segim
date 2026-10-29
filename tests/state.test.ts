import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/idb', () => ({
  saveRoutines: vi.fn(async () => undefined),
  saveExercises: vi.fn(async () => undefined),
  saveSettings: vi.fn(async () => undefined),
  saveSession: vi.fn(async () => undefined),
  removeSession: vi.fn(async () => undefined),
  clearAll: vi.fn(async () => undefined),
  replaceAllData: vi.fn(async () => undefined),
}));
vi.mock('../src/theme', () => ({ applyTheme: vi.fn() }));
vi.mock('../src/services/notices', () => ({ pushNotice: vi.fn() }));

import { saveRoutines } from '../src/db/idb';
import { clearAllData, createRoutine, patchRoutine, updateSettings } from '../src/state';
import { cancelPendingAutoBackup, pendingAutoBackup } from '../src/services/drive/autoBackup';
import { pushNotice } from '../src/services/notices';

describe('fallos al guardar', () => {
  it('avisan al usuario, no solo en la consola', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(saveRoutines).mockRejectedValueOnce(new Error('QuotaExceededError'));

    createRoutine();
    await vi.waitFor(() => expect(pushNotice).toHaveBeenCalled());

    expect(vi.mocked(pushNotice).mock.calls[0]).toEqual([
      expect.stringContaining('No se pudo guardar las rutinas'),
      'error',
    ]);
  });
});

describe('borrar todos los datos', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cancelPendingAutoBackup();
    vi.useRealTimers();
  });

  it('cancela la copia automática pendiente para no subir datos vacíos', () => {
    updateSettings({ autoBackup: true });
    const routine = createRoutine();
    patchRoutine(routine.id, (draft) => {
      draft.name = 'Torso';
    });
    expect(pendingAutoBackup()).not.toBeNull();

    clearAllData();

    expect(pendingAutoBackup()).toBeNull();
  });
});
