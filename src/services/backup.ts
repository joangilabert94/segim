import type { Exercise, Routine, Session, Settings } from '../models';
import { parseExerciseList, parseRoutine, parseSession, parseSettings } from './validation';

// Sigue siendo `gymrutinas` (la app se llama Segim) para que se restauren las copias ya guardadas.
export const BACKUP_APP_ID = 'gymrutinas';

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  version: 1;
  exportedAt: string;
  routines: Routine[];
  exercises: Exercise[];
  sessions: Session[];
  settings: Settings;
}

export interface BackupTargetStatus {
  available: boolean;
  connected: boolean;
  lastSyncAt?: string;
  account?: string;
  authorized?: boolean;
}

export interface BackupTarget {
  readonly label: string;
  // `dated: false` (ediciones, a ráfagas): sin copia fechada, para no expulsar las de otros días.
  upload(
    backup: BackupFile,
    options?: { interactive?: boolean; dated?: boolean; replaceExisting?: boolean },
  ): Promise<{ syncedAt: string; warning?: string }>;
  downloadLatest(options?: { interactive?: boolean }): Promise<BackupFile>;
  status(): Promise<BackupTargetStatus>;
}

export class ExistingBackupError extends Error {
  readonly modifiedTime?: string;

  constructor(modifiedTime?: string) {
    super('Ya hay una copia de Segim en tu Google Drive.');
    this.name = 'ExistingBackupError';
    this.modifiedTime = modifiedTime;
  }
}

export function buildBackup(data: {
  routines: Routine[];
  exercises: Exercise[];
  sessions: Session[];
  settings: Settings;
}): BackupFile {
  return {
    app: BACKUP_APP_ID,
    version: 1,
    exportedAt: new Date().toISOString(),
    routines: data.routines,
    exercises: data.exercises,
    sessions: data.sessions,
    settings: data.settings,
  };
}

export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `segim-backup-${backup.exportedAt.slice(0, 10)}.json`;
  // Sin el enlace en el DOM o revocando la URL al momento, algunos navegadores cancelan la descarga.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El fichero no es un JSON válido.');
  }
  if (typeof data !== 'object' || data === null) {
    throw new Error('El fichero no parece una copia de Segim.');
  }
  const b = data as Record<string, unknown>;
  if (b.app !== BACKUP_APP_ID) {
    throw new Error('El fichero no parece una copia de Segim.');
  }
  if (typeof b.version === 'number' && b.version > 1) {
    throw new Error(
      'La copia es de una versión más nueva de la app. Actualiza Segim antes de importarla.',
    );
  }
  if (!Array.isArray(b.routines) || !Array.isArray(b.sessions)) {
    throw new Error('La copia no contiene rutinas ni sesiones.');
  }

  const routines = b.routines.map((routine, i) =>
    parseRoutine(routine, `La rutina ${i + 1} de la copia`),
  );
  const sessions = b.sessions.map((session, i) =>
    parseSession(session, `La sesión ${i + 1} de la copia`),
  );
  const exercises = parseExerciseList(b.exercises);

  return {
    app: BACKUP_APP_ID,
    version: 1,
    exportedAt:
      typeof b.exportedAt === 'string' ? b.exportedAt : new Date().toISOString(),
    routines,
    exercises,
    sessions,
    settings: parseSettings(b.settings),
  };
}
