import type { BackupFile, BackupTarget, BackupTargetStatus } from '../backup';
import { ExistingBackupError, parseBackup } from '../backup';
import { BACKUP_FOLDER_NAME, type DriveFileMeta, DriveError, datedCopyName } from './api';
import * as api from './api';
import { forgetToken, getAccessToken, hasValidToken, isDriveConfigured } from './auth';
import type { DriveMeta, DriveMetaStore } from '../../db/driveStore';
import { driveMetaStore } from '../../db/driveStore';

export const MAX_DATED_COPIES = 10;

export interface DriveClient {
  findBackupFile(token: string): Promise<DriveFileMeta | null>;
  getFileMeta(token: string, fileId: string): Promise<DriveFileMeta>;
  findBackupFolders(token: string): Promise<DriveFileMeta[]>;
  createFolder(token: string): Promise<DriveFileMeta>;
  createBackupFile(token: string, content: string, folderId?: string): Promise<DriveFileMeta>;
  createJsonFile(
    token: string,
    name: string,
    content: string,
    folderId?: string,
  ): Promise<DriveFileMeta>;
  updateBackupFile(token: string, fileId: string, content: string): Promise<DriveFileMeta>;
  renameFile(token: string, fileId: string, name: string): Promise<DriveFileMeta>;
  downloadBackupText(token: string, fileId: string): Promise<string>;
  listDatedCopies(token: string, folderId?: string): Promise<DriveFileMeta[]>;
  deleteFile(token: string, fileId: string): Promise<void>;
  getDriveAccount?(token: string): Promise<{ email?: string; displayName?: string }>;
}

export interface DriveTargetOptions {
  getToken?: (interactive: boolean) => Promise<string>;
  client?: DriveClient;
  metaStore?: DriveMetaStore;
  isConfigured?: () => boolean;
  hasToken?: () => boolean;
  maxCopies?: number;
  now?: () => Date;
}

export function createDriveTarget(options: DriveTargetOptions = {}): BackupTarget {
  const getToken = options.getToken ?? getAccessToken;
  const client: DriveClient = options.client ?? api;
  const metaStore = options.metaStore ?? driveMetaStore;
  const configured = options.isConfigured ?? isDriveConfigured;
  const hasToken = options.hasToken ?? hasValidToken;
  const maxCopies = options.maxCopies ?? MAX_DATED_COPIES;
  const now = options.now ?? (() => new Date());

  async function run<T>(fn: (token: string) => Promise<T>, interactive = false): Promise<T> {
    const token = await getToken(interactive);
    try {
      return await fn(token);
    } catch (err) {
      const isAuth = err instanceof DriveError && err.status === 401;
      if (!isAuth || !interactive) throw err;
      forgetToken();
      return fn(await getToken(true));
    }
  }

  async function saveLatest(
    token: string,
    meta: DriveMeta,
    content: string,
    folderId: string,
    known?: DriveFileMeta | null,
  ): Promise<DriveFileMeta> {
    if (meta.fileId) {
      try {
        return await client.updateBackupFile(token, meta.fileId, content);
      } catch (err) {
        // El usuario pudo borrar el fichero desde Drive: se recrea abajo.
        if (!(err instanceof DriveError) || err.kind !== 'notFound') throw err;
      }
    }
    const existing = known !== undefined ? known : await client.findBackupFile(token);
    if (existing) return client.updateBackupFile(token, existing.id, content);
    return client.createBackupFile(token, content, folderId);
  }

  async function resolveFolder(
    token: string,
    meta: DriveMeta,
    known: DriveFileMeta | null | undefined,
  ): Promise<DriveFileMeta> {
    let file = known ?? null;
    if (!file && meta.fileId) {
      file = await client.getFileMeta(token, meta.fileId).catch(() => null);
    }
    const folders = await client.findBackupFolders(token);
    const parent = folders.find((folder) => file?.parents?.includes(folder.id));
    return parent ?? folders[0] ?? client.createFolder(token);
  }

  return {
    label: 'Google Drive',

    async upload(backup: BackupFile, uploadOptions = {}): Promise<{
      syncedAt: string;
      warning?: string;
    }> {
      const content = JSON.stringify(backup);
      const withDated = uploadOptions.dated !== false;

      return run(async (token) => {
        const meta: DriveMeta = { ...((await metaStore.load()) ?? {}) };

        // Una copia que no ha subido este dispositivo puede ser la buena: no se pisa sin permiso.
        let known: DriveFileMeta | null | undefined;
        if (!meta.fileId) {
          known = await client.findBackupFile(token);
          if (known && uploadOptions.replaceExisting !== true) {
            throw new ExistingBackupError(known.modifiedTime);
          }
        }

        // Carpeta antigua ("GymRutinas" o sin nombre guardado): se renombra una vez y se recuerda.
        let folderId = meta.folderId;
        let folderName = meta.folderName;
        if (!folderId) {
          const folder = await resolveFolder(token, meta, known);
          folderId = folder.id;
          folderName = folder.name ?? BACKUP_FOLDER_NAME;
        }
        if (folderName !== BACKUP_FOLDER_NAME) {
          try {
            const renamed = await client.renameFile(token, folderId, BACKUP_FOLDER_NAME);
            folderName = renamed.name ?? BACKUP_FOLDER_NAME;
          } catch {
            // Es cosmético: la copia se guarda igual y se reintenta la próxima vez.
            folderName = undefined;
          }
        }
        meta.folderId = folderId;
        meta.folderName = folderName;

        const file = await saveLatest(token, meta, content, folderId, known);

        let warning: string | undefined;
        if (withDated) {
          try {
            await client.createJsonFile(token, datedCopyName(now()), content, folderId);
            const copies = await client.listDatedCopies(token, folderId);
            const sobrantes = copies.slice(maxCopies);
            if (sobrantes.length > 0) {
              await Promise.all(sobrantes.map((copy) => client.deleteFile(token, copy.id)));
            }
          } catch (err) {
            warning =
              err instanceof DriveError ? err.message : 'No se pudo guardar la copia fechada.';
          }
        }

        try {
          const account = await client.getDriveAccount?.(token);
          if (account?.email) meta.account = account.email;
        } catch {
          /* sin aviso: la subida no depende de esto */
        }

        const syncedAt = file.modifiedTime ?? new Date().toISOString();
        await metaStore.save({ ...meta, fileId: file.id, lastSyncAt: syncedAt });
        return warning ? { syncedAt, warning } : { syncedAt };
      }, uploadOptions.interactive === true);
    },

    async downloadLatest(downloadOptions = {}): Promise<BackupFile> {
      return run(async (token) => {
        const meta = (await metaStore.load()) ?? {};
        let fileId = meta.fileId;

        if (!fileId) {
          const found = await client.findBackupFile(token);
          if (!found) {
            throw new DriveError(
              'notFound',
              404,
              'Todavía no hay ninguna copia en tu Google Drive.',
            );
          }
          fileId = found.id;
        }

        const text = await client.downloadBackupText(token, fileId);
        const backup = parseBackup(text);

        if (meta.fileId !== fileId) await metaStore.save({ ...meta, fileId });
        return backup;
      }, downloadOptions.interactive === true);
    },

    async status(): Promise<BackupTargetStatus> {
      if (!configured()) return { available: false, connected: false };
      const meta = await metaStore.load();
      return {
        available: true,
        connected: !!meta?.fileId,
        lastSyncAt: meta?.lastSyncAt,
        account: meta?.account,
        authorized: hasToken(),
      };
    },
  };
}

export const driveTarget: BackupTarget = createDriveTarget();
