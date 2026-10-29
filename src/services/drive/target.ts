// Destino "Google Drive" para las copias de seguridad.
//
// Estructura que deja en el Drive del usuario:
//
//   GymRutinas/
//     gymrutinas-backup.json        ← última copia (la que se restaura)
//     copia-2026-10-28-1842.json    ← copias fechadas (se conservan 10)
//
// El JSON es el mismo que usa el export/import a fichero, así que restaurar
// desde Drive y restaurar desde un archivo pasan por la misma validación.
//
// Todo es inyectable para poder probar la orquestación sin red ni IndexedDB.

import type { BackupFile, BackupTarget, BackupTargetStatus } from '../backup';
import { parseBackup } from '../backup';
import { type DriveFileMeta, DriveError, datedCopyName } from './api';
import * as api from './api';
import { forgetToken, getAccessToken, isDriveConfigured } from './auth';
import type { DriveMeta, DriveMetaStore } from '../../db/driveStore';
import { driveMetaStore } from '../../db/driveStore';

/** Copias fechadas que se conservan; el resto se borra al subir. */
export const MAX_DATED_COPIES = 10;

/** Las operaciones de Drive que necesita el destino. */
export interface DriveClient {
  findBackupFile(token: string): Promise<DriveFileMeta | null>;
  createFolder(token: string): Promise<DriveFileMeta>;
  createBackupFile(token: string, content: string, folderId?: string): Promise<DriveFileMeta>;
  createJsonFile(
    token: string,
    name: string,
    content: string,
    folderId?: string,
  ): Promise<DriveFileMeta>;
  updateBackupFile(token: string, fileId: string, content: string): Promise<DriveFileMeta>;
  downloadBackupText(token: string, fileId: string): Promise<string>;
  listDatedCopies(token: string, folderId?: string): Promise<DriveFileMeta[]>;
  deleteFile(token: string, fileId: string): Promise<void>;
}

export interface DriveTargetOptions {
  getToken?: (interactive: boolean) => Promise<string>;
  client?: DriveClient;
  metaStore?: DriveMetaStore;
  isConfigured?: () => boolean;
  maxCopies?: number;
  /** Reloj inyectable: los tests fijan el nombre de la copia fechada. */
  now?: () => Date;
}

export function createDriveTarget(options: DriveTargetOptions = {}): BackupTarget {
  const getToken = options.getToken ?? getAccessToken;
  const client: DriveClient = options.client ?? api;
  const metaStore = options.metaStore ?? driveMetaStore;
  const configured = options.isConfigured ?? isDriveConfigured;
  const maxCopies = options.maxCopies ?? MAX_DATED_COPIES;
  const now = options.now ?? (() => new Date());

  /**
   * Ejecuta una operación con token. Si Google responde 401 con una petición
   * interactiva (el usuario acaba de pulsar algo), se descarta el token
   * cacheado y se reintenta UNA vez con uno nuevo.
   */
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

  /** Sube la "última copia", actualizándola si ya existe (o recreándola). */
  async function saveLatest(
    token: string,
    meta: DriveMeta,
    content: string,
    folderId: string,
  ): Promise<DriveFileMeta> {
    if (meta.fileId) {
      try {
        return await client.updateBackupFile(token, meta.fileId, content);
      } catch (err) {
        // El usuario pudo borrar el fichero desde Drive: se recrea abajo.
        if (!(err instanceof DriveError) || err.kind !== 'notFound') throw err;
      }
    }
    // Sin referencia (navegador limpiado, fichero borrado): se busca por nombre
    // antes de crear otra copia, para no duplicar el fichero.
    const existing = await client.findBackupFile(token);
    if (existing) return client.updateBackupFile(token, existing.id, content);
    return client.createBackupFile(token, content, folderId);
  }

  return {
    label: 'Google Drive',

    async upload(backup: BackupFile, uploadOptions = {}): Promise<{
      syncedAt: string;
      warning?: string;
    }> {
      const content = JSON.stringify(backup);
      // Las ediciones (que llegan a ráfagas) solo refrescan la copia viva.
      const withDated = uploadOptions.dated !== false;

      return run(async (token) => {
        const meta: DriveMeta = { ...((await metaStore.load()) ?? {}) };

        // La carpeta hace falta también para las copias fechadas.
        const folderId = meta.folderId ?? (await client.createFolder(token)).id;
        meta.folderId = folderId;

        // 1) La copia principal: si esto falla, la subida se considera fallida.
        const file = await saveLatest(token, meta, content, folderId);

        // 2) Copia fechada + rotación. Es secundaria: si falla, la copia del
        //    punto 1 ya está a salvo y solo se avisa con `warning`.
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
        // Misma validación que el import desde fichero: si la copia de Drive
        // estuviera dañada, se rechaza aquí y no toca los datos locales.
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
      };
    },
  };
}

/** Destino real (token de Google + IndexedDB + API REST). */
export const driveTarget: BackupTarget = createDriveTarget();
