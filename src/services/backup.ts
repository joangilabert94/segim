// Copia de seguridad en JSON: exportar a fichero e importar desde fichero.
// El mismo `BackupFile` es el que se sube a Google Drive (services/drive),
// así que restore desde Drive y restore desde archivo validan igual.
//
// Al importar se valida TODA la estructura antes de tocar IndexedDB: una copia
// dañada se rechaza con un mensaje claro en vez de romper la app al recargar.

import type { Exercise, Routine, Session, Settings } from '../models';
import { parseExerciseList, parseRoutine, parseSession, parseSettings } from './validation';

export interface BackupFile {
  app: 'gymrutinas';
  version: 1;
  exportedAt: string;
  routines: Routine[];
  exercises: Exercise[];
  sessions: Session[];
  settings: Settings;
}

// ---------------------------------------------------------------------------
// Destinos de copia
// ---------------------------------------------------------------------------
// Contrato mínimo para añadir destinos (Google Drive) sin tocar la UI: el JSON
// sigue siendo el formato de intercambio y el destino solo decide dónde vive.

export interface BackupTargetStatus {
  /** false si este build no tiene configurado el destino (p. ej. sin Client ID). */
  available: boolean;
  /** Hay una copia vinculada en el destino. */
  connected: boolean;
  /** Última subida correcta (ISO), según el destino. */
  lastSyncAt?: string;
}

export interface BackupTarget {
  readonly label: string;
  /**
   * Sube la copia y devuelve la fecha que reporta el destino (o la actual).
   * `interactive` permite abrir la ventana de consentimiento de Google y, por
   * tanto, solo debe usarse dentro de un clic del usuario.
   * `dated: false` actualiza solo la copia viva, sin crear una copia fechada:
   * lo usan las subidas disparadas por ediciones, que llegan a ráfagas y no
   * deben expulsar del historial de Drive a las copias de días anteriores.
   */
  upload(
    backup: BackupFile,
    options?: { interactive?: boolean; dated?: boolean },
  ): Promise<{ syncedAt: string; warning?: string }>;
  /** Descarga la última copia del destino, ya validada con `parseBackup`. */
  downloadLatest(options?: { interactive?: boolean }): Promise<BackupFile>;
  /** Estado local del destino, sin llamadas de red. */
  status(): Promise<BackupTargetStatus>;
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
  // En algunos navegadores hay que insertar el enlace y no revocar la URL de
  // forma síncrona: si no, la descarga puede cancelarse.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Valida y parsea un fichero de copia de seguridad. Lanza Error con mensaje en español. */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El fichero no es un JSON válido.');
  }
  if (typeof data !== 'object' || data === null) {
    throw new Error('El fichero no parece una copia de GymRutinas.');
  }
  const b = data as Record<string, unknown>;
  if (b.app !== 'gymrutinas') {
    throw new Error('El fichero no parece una copia de GymRutinas.');
  }
  if (typeof b.version === 'number' && b.version > 1) {
    throw new Error(
      'La copia es de una versión más nueva de la app. Actualiza GymRutinas antes de importarla.',
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
    app: 'gymrutinas',
    version: 1,
    exportedAt:
      typeof b.exportedAt === 'string' ? b.exportedAt : new Date().toISOString(),
    routines,
    exercises,
    sessions,
    settings: parseSettings(b.settings),
  };
}
