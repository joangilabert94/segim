// Metadatos de la conexión con Google Drive.
//
// Viven aparte de los datos de la app (no forman parte de la copia) y son por
// dispositivo: el fichero de Drive es del usuario, pero la referencia a él es
// de este navegador. Sobreviven a "borrar todos los datos" (ver `db/idb.ts`):
// perder la referencia haría que la siguiente copia duplicase el fichero.

import { del, get, set } from 'idb-keyval';
import { K_DRIVE_META } from './idb';

export interface DriveMeta {
  /** Carpeta "GymRutinas" creada por la app (si se conoce). */
  folderId?: string;
  /** Fichero de copia actual: evita buscarlo por nombre en cada subida. */
  fileId?: string;
  /** `modifiedTime` que devolvió Drive en la última subida (ISO). */
  lastSyncAt?: string;
}

export interface DriveMetaStore {
  load(): Promise<DriveMeta | null>;
  save(meta: DriveMeta): Promise<void>;
  clear(): Promise<void>;
}

export const driveMetaStore: DriveMetaStore = {
  async load() {
    const raw = await get<unknown>(K_DRIVE_META);
    if (!raw || typeof raw !== 'object') return null;
    const m = raw as Record<string, unknown>;
    // Tolerante a propósito: un meta corrupto no puede romper la app, solo
    // perder la referencia (se recupera buscando el fichero por nombre).
    return {
      folderId: typeof m.folderId === 'string' ? m.folderId : undefined,
      fileId: typeof m.fileId === 'string' ? m.fileId : undefined,
      lastSyncAt: typeof m.lastSyncAt === 'string' ? m.lastSyncAt : undefined,
    };
  },

  async save(meta) {
    await set(K_DRIVE_META, meta);
  },

  async clear() {
    await del(K_DRIVE_META);
  },
};
