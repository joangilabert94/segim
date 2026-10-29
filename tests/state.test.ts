import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/idb', () => ({
  saveRoutines: vi.fn(async () => undefined),
  saveExercises: vi.fn(async () => undefined),
  saveSettings: vi.fn(async () => undefined),
  saveSession: vi.fn(async () => undefined),
  removeSession: vi.fn(async () => undefined),
  clearAll: vi.fn(async () => undefined),
}));
vi.mock('../src/theme', () => ({ applyTheme: vi.fn() }));

import { clearAllData, createRoutine, patchRoutine, updateSettings } from '../src/state';
import { cancelPendingAutoBackup, pendingAutoBackup } from '../src/services/drive/autoBackup';

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
