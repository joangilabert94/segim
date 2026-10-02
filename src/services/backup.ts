// Copia de seguridad en JSON: exportar a fichero e importar desde fichero.
// Es la base de la fase 2 (sincronización opcional con Google Drive).

import type { Exercise, Routine, Session, Settings } from '../models';

export interface BackupFile {
  app: 'gymrutinas';
  version: 1;
  exportedAt: string;
  routines: Routine[];
  exercises: Exercise[];
  sessions: Session[];
  settings: Settings;
}

export function buildBackup(data: {
  routines: Routine[];
  exercises: Exercise[];
  sessions: Session[];
  settings: Settings;
}): BackupFile {
  return {
    app: 'gymrutinas',
    version: 1,
    exportedAt: new Date().toISOString(),
    routines: data.routines,
    exercises: data.exercises,
    sessions: data.sessions,
    settings: data.settings,
  };
}

/** Descarga el backup como fichero .json. */
export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gymrutinas-backup-${backup.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Valida y parsea un fichero de copia de seguridad. Lanza Error con mensaje en español. */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El fichero no es un JSON válido.');
  }
  const b = data as Partial<BackupFile>;
  if (!b || typeof b !== 'object' || b.app !== 'gymrutinas') {
    throw new Error('El fichero no parece una copia de GymRutinas.');
  }
  if (!Array.isArray(b.routines) || !Array.isArray(b.sessions)) {
    throw new Error('La copia no contiene rutinas ni sesiones.');
  }
  return {
    app: 'gymrutinas',
    version: 1,
    exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : new Date().toISOString(),
    routines: b.routines as Routine[],
    exercises: Array.isArray(b.exercises) ? (b.exercises as Exercise[]) : [],
    sessions: b.sessions as Session[],
    settings: (b.settings as Settings) ?? {
      unit: 'kg',
      restPresets: [60, 90, 120, 180, 240, 300],
    },
  };
}
