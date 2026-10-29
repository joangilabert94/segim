import { del, get, set } from 'idb-keyval';
import { K_DRIVE_META } from './idb';

export interface DriveMeta {
  folderId?: string;
  folderName?: string;
  fileId?: string;
  lastSyncAt?: string;
  account?: string;
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
    return {
      folderId: typeof m.folderId === 'string' ? m.folderId : undefined,
      folderName: typeof m.folderName === 'string' ? m.folderName : undefined,
      fileId: typeof m.fileId === 'string' ? m.fileId : undefined,
      lastSyncAt: typeof m.lastSyncAt === 'string' ? m.lastSyncAt : undefined,
      account: typeof m.account === 'string' ? m.account : undefined,
    };
  },

  async save(meta) {
    await set(K_DRIVE_META, meta);
  },

  async clear() {
    await del(K_DRIVE_META);
  },
};
