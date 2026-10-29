import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<IDBValidKey, unknown>();

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: IDBValidKey) => store.get(key)),
  set: vi.fn(async (key: IDBValidKey, value: unknown) => void store.set(key, value)),
  del: vi.fn(async (key: IDBValidKey) => void store.delete(key)),
  keys: vi.fn(async () => [...store.keys()]),
  setMany: vi.fn(async (entries: [IDBValidKey, unknown][]) => {
    for (const [key, value] of entries) store.set(key, value);
  }),
  delMany: vi.fn(async (keys: IDBValidKey[]) => {
    for (const key of keys) store.delete(key);
  }),
}));

import { delMany, setMany } from 'idb-keyval';
import { DEFAULT_SETTINGS, type Session } from '../src/models';
import { clearAll, replaceAllData } from '../src/db/idb';

const session = (id: string): Session => ({
  id,
  date: '2026-10-01',
  dayName: 'Día 1',
  status: 'completed',
  entries: [],
});

describe('importar una copia en IndexedDB', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    store.set('routines', [{ id: 'vieja' }]);
    store.set('session:vieja', session('vieja'));
    store.set('drive:meta', { fileId: 'file-1' });
  });

  it('escribe lo nuevo antes de borrar lo que sobra y conserva Drive', async () => {
    await replaceAllData({
      routines: [],
      exercises: [],
      sessions: [session('nueva')],
      settings: DEFAULT_SETTINGS,
    });

    expect([...store.keys()].sort()).toEqual([
      'drive:meta',
      'exercises',
      'routines',
      'session:nueva',
      'settings',
    ]);
    expect(vi.mocked(setMany).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(delMany).mock.invocationCallOrder[0],
    );
  });

  it('borrar todo conserva los metadatos de Drive', async () => {
    await clearAll();

    expect([...store.keys()]).toEqual(['drive:meta']);
  });
});
