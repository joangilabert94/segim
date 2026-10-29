// Ajustes: unidad, presets de descanso, rutina activa, copias de seguridad y datos.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { Unit } from '../models';
import type { BackupFile, BackupTargetStatus } from '../services/backup';
import { ExistingBackupError, buildBackup, downloadBackup, parseBackup } from '../services/backup';
import { driveTarget } from '../services/drive/target';
import { revokeAccess } from '../services/drive/auth';
import { driveMetaStore } from '../db/driveStore';
import {
  clearAllData,
  getState,
  replaceAll,
  setUnit,
  updateSettings,
  useStore,
} from '../state';
import { DEFAULT_SETTINGS } from '../models';
import { THEME_OPTIONS } from '../services/theme';
import { currentTheme } from '../theme';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { fmtDateTime, plural } from '../services/format';

// Inyectada por Vite desde package.json: una sola fuente de verdad para la versión.
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export function SettingsView() {
  const s = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<BackupFile | null>(null);
  const [pendingUnit, setPendingUnit] = useState<Unit | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  // Copia en Google Drive (fase 2). `busy` bloquea los botones mientras hay
  // una petición en curso para no lanzar dos subidas a la vez.
  const [drive, setDrive] = useState<BackupTargetStatus | null>(null);
  const [driveBusy, setDriveBusy] = useState<'upload' | 'restore' | 'disconnect' | null>(null);
  const [driveMessage, setDriveMessage] = useState<{
    kind: 'ok' | 'error';
    text: string;
  } | null>(null);
  const [pendingDrive, setPendingDrive] = useState<BackupFile | null>(null);
  const [existingRemote, setExistingRemote] = useState<{ modifiedTime?: string } | null>(null);

  const autoOn = s.settings.autoBackup === true;
  const nonArchived = s.routines.filter((r) => !r.archived);
  // Si la rutina activa está archivada o ya no existe, el selector muestra el
  // placeholder en vez de quedarse en blanco.
  const activeRoutineSelectable = nonArchived.some(
    (r) => r.id === s.settings.activeRoutineId,
  );

  const refreshDrive = async () => {
    try {
      setDrive(await driveTarget.status());
    } catch {
      // Si IndexedDB falla, la sección no puede romper el resto de Ajustes.
      setDrive({ available: true, connected: false });
    }
  };

  useEffect(() => {
    void refreshDrive();
  }, []);

  const driveErrorText = (err: unknown) =>
    err instanceof Error ? err.message : 'No se pudo hablar con Google Drive.';

  /** Conectar y subir comparten acción: la primera subida es la que conecta. */
  const subirADrive = async (replaceExisting = false) => {
    setDriveBusy('upload');
    setDriveMessage(null);
    try {
      const result = await driveTarget.upload(buildBackup(getState()), {
        interactive: true,
        replaceExisting,
      });
      await refreshDrive();
      setDriveMessage({
        kind: 'ok',
        text: result.warning
          ? `Copia subida (${fmtDateTime(result.syncedAt)}), pero la copia fechada falló: ${result.warning}`
          : `Copia subida a tu Drive (${fmtDateTime(result.syncedAt)}).`,
      });
    } catch (err) {
      if (err instanceof ExistingBackupError) {
        setExistingRemote({ modifiedTime: err.modifiedTime });
      } else {
        setDriveMessage({ kind: 'error', text: driveErrorText(err) });
      }
    } finally {
      setDriveBusy(null);
    }
  };

  const pedirRestauracion = async () => {
    setDriveBusy('restore');
    setDriveMessage(null);
    try {
      // Descarga y valida: si la copia de Drive está dañada, no se toca nada.
      setPendingDrive(await driveTarget.downloadLatest({ interactive: true }));
      await refreshDrive();
    } catch (err) {
      setDriveMessage({ kind: 'error', text: driveErrorText(err) });
    } finally {
      setDriveBusy(null);
    }
  };

  const desconectarDrive = async () => {
    setDriveBusy('disconnect');
    setDriveMessage(null);
    try {
      await revokeAccess();
      await driveMetaStore.clear();
      await refreshDrive();
      setDriveMessage({
        kind: 'ok',
        text: 'Google Drive desconectado. La copia sigue en tu Drive por si la necesitas.',
      });
    } catch (err) {
      setDriveMessage({ kind: 'error', text: driveErrorText(err) });
    } finally {
      setDriveBusy(null);
    }
  };

  const themeHint = () => {
    const ahora = currentTheme() === 'light' ? 'claro' : 'oscuro';
    if (s.settings.theme === 'light') return 'Siempre en modo claro.';
    if (s.settings.theme === 'dark') return 'Siempre en modo oscuro.';
    return `Sigue el modo del dispositivo. Ahora se muestra en modo ${ahora}.`;
  };

  const exportar = () => {
    try {
      const state = getState();
      downloadBackup(buildBackup(state));
      setMessage({ kind: 'ok', text: 'Copia de seguridad descargada.' });
    } catch (err) {
      setMessage({ kind: 'error', text: `No se pudo exportar: ${String(err)}` });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      setPendingBackup(backup);
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'No se pudo leer el fichero.',
      });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const applyBackup = (backup: BackupFile | null) => {
    if (!backup) return;
    replaceAll({
      routines: backup.routines,
      exercises: backup.exercises,
      sessions: backup.sessions,
      settings: backup.settings,
    });
    // Cuenta lo que queda tras fusionar el catálogo, no lo que traía el fichero:
    // una copia con duplicados acaba con menos entradas de las anunciadas.
    const imported = getState();
    setMessage({
      kind: 'ok',
      text: `Importadas ${plural(imported.routines.length, 'rutina', 'rutinas')}, ${plural(imported.exercises.length, 'ejercicio', 'ejercicios')} y ${plural(imported.sessions.length, 'sesión', 'sesiones')}.`,
    });
    setPendingBackup(null);
    setPendingDrive(null);
  };

  const setPreset = (index: number, text: string) => {
    const n = Number(text.replace(',', '.'));
    if (!Number.isFinite(n)) return;
    const presets = [...s.settings.restPresets];
    presets[index] = Math.min(600, Math.max(5, Math.round(n)));
    updateSettings({ restPresets: presets });
  };

  return (
    <>
      <header class="view-head">
        <h1>
          Ajustes
          <span class="sub">Segim v{APP_VERSION}</span>
        </h1>
      </header>

      <div class="section-title">Entrenamiento</div>

      <div class="card">
        <span class="field-label">Unidad de peso</span>
        <div class="segmented">
          <button
            class={s.settings.unit === 'kg' ? 'is-active' : ''}
            onClick={() => {
              if (s.settings.unit !== 'kg') setPendingUnit('kg');
            }}
          >
            kg
          </button>
          <button
            class={s.settings.unit === 'lb' ? 'is-active' : ''}
            onClick={() => {
              if (s.settings.unit !== 'lb') setPendingUnit('lb');
            }}
          >
            lb
          </button>
        </div>
        <p class="hint" style="margin-top:8px">
          Cambiar de unidad convierte también los pesos ya guardados en rutinas e historial.
        </p>

        <div style="margin-top:16px">
          <span class="field-label">Rutina activa (día sugerido)</span>
          <select
            class="input"
            value={activeRoutineSelectable ? s.settings.activeRoutineId ?? '' : ''}
            onChange={(e) =>
              updateSettings({ activeRoutineId: e.currentTarget.value || undefined })
            }
          >
            <option value="">Ninguna (la primera no archivada)</option>
            {nonArchived.map((r) => (
              <option value={r.id} key={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div class="card">
        <span class="field-label">Descansos (segundos, hasta 6)</span>
        <div class="preset-grid" style="grid-template-columns:repeat(3,1fr)">
          {s.settings.restPresets.map((seconds, i) => (
            <input
              key={i}
              class="input"
              type="text"
              inputMode="numeric"
              value={String(seconds)}
              aria-label={`Descanso ${i + 1} en segundos`}
              onChange={(e) => setPreset(i, e.currentTarget.value)}
            />
          ))}
        </div>
        <button
          class="btn btn-sm"
          style="margin-top:10px"
          onClick={() => updateSettings({ restPresets: DEFAULT_SETTINGS.restPresets })}
        >
          Restaurar valores por defecto
        </button>
      </div>

      <div class="section-title">Apariencia</div>

      <div class="card">
        <span class="field-label">Tema</span>
        <div class="segmented segmented--full">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              class={s.settings.theme === option.value ? 'is-active' : ''}
              aria-pressed={s.settings.theme === option.value}
              onClick={() => updateSettings({ theme: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p class="hint" style="margin-top:10px">
          {themeHint()}
        </p>
      </div>

      <div class="section-title">Datos</div>

      <div class="card">
        <p class="card-sub" style="margin-bottom:12px">
          Tus datos viven solo en este dispositivo (IndexedDB). Exporta una copia periódica
          para no perderlos y para migrar de móvil.
        </p>
        <div class="btn-row">
          <button class="btn" style="flex:1" onClick={exportar}>
            ⬇️ Exportar JSON
          </button>
          <button class="btn" style="flex:1" onClick={() => fileRef.current?.click()}>
            ⬆️ Importar JSON
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style="display:none"
          onChange={(e) => onFile(e.currentTarget.files?.[0])}
        />

        <button
          class="btn btn-danger btn-block"
          style="margin-top:10px"
          onClick={() => setConfirmClear(true)}
        >
          🗑 Borrar todos los datos
        </button>

        {message && <div class={`inline-msg is-${message.kind}`}>{message.text}</div>}
      </div>

      <div class="section-title">Copia en Google Drive</div>

      <div class="card">
        {drive?.available === false ? (
          <p class="card-sub">
            Esta versión no tiene configurado el acceso a Google Drive. Las copias en la nube se
            activan al publicar la app con el Client ID del proyecto.
          </p>
        ) : (
          <>
            <p class="card-sub" style="margin-bottom:12px">
              {drive?.connected
                ? `Copia en tu propio Drive${drive.account ? ` de ${drive.account}` : ''}. Última subida: ${
                    drive.lastSyncAt ? fmtDateTime(drive.lastSyncAt) : 'desconocida'
                  }.`
                : 'Sube todas tus sesiones, rutinas y ajustes a tu propio Google Drive. Solo se toca el fichero que crea esta app. Si ya la usabas en otro dispositivo, pulsa ⬇️ Restaurar.'}
            </p>
            <div class="btn-row">
              <button
                class="btn"
                style="flex:1"
                onClick={() => subirADrive()}
                disabled={driveBusy !== null}
              >
                {driveBusy === 'upload'
                  ? 'Subiendo…'
                  : drive?.connected
                    ? '☁️ Subir ahora'
                    : '☁️ Conectar con Drive'}
              </button>
              <button
                class="btn"
                style="flex:1"
                onClick={pedirRestauracion}
                disabled={driveBusy !== null}
              >
                {driveBusy === 'restore' ? 'Descargando…' : '⬇️ Restaurar'}
              </button>
            </div>
            {/* Visible siempre (para que se descubra), pero solo se puede
                activar con una copia ya vinculada: sin conexión no haría nada. */}
            <div style="margin-top:14px">
              <span class="field-label">Copia automática</span>
              <div class="segmented segmented--full">
                <button
                  class={autoOn ? '' : 'is-active'}
                  aria-pressed={!autoOn}
                  disabled={!drive?.connected}
                  onClick={() => updateSettings({ autoBackup: false })}
                >
                  Solo manual
                </button>
                <button
                  class={autoOn ? 'is-active' : ''}
                  aria-pressed={autoOn}
                  disabled={!drive?.connected}
                  onClick={() => updateSettings({ autoBackup: true })}
                >
                  Al terminar sesión
                </button>
              </div>
              <p class="hint" style="margin-top:8px">
                {!drive?.connected
                  ? 'Conecta con tu Drive para poder activarla.'
                  : autoOn
                    ? 'Al finalizar una sesión se sube a los pocos segundos; al editar una sesión, una rutina o un ejercicio, tras un rato sin tocar nada (30 s). El permiso de Google dura una hora: si ha caducado, el aviso trae un botón para autorizar y subir en un toque.'
                    : 'Solo se sube cuando pulses ☁️ Subir ahora.'}
              </p>
            </div>
            {drive?.connected && (
              <button
                class="btn btn-block"
                style="margin-top:10px"
                onClick={desconectarDrive}
                disabled={driveBusy !== null}
              >
                Desconectar Google Drive
              </button>
            )}
            <p class="hint" style="margin-top:10px">
              Se conservan las últimas 10 copias fechadas: se crean al terminar una sesión y al
              subir a mano, mientras que las ediciones solo actualizan la copia principal. Al
              conectar se abre la ventana de Google: elige tu cuenta y acepta el permiso (solo
              ficheros de esta app).
            </p>
            {driveMessage && (
              <div class={`inline-msg is-${driveMessage.kind}`}>{driveMessage.text}</div>
            )}
          </>
        )}
      </div>

      <div class="section-title">Instalar y cómo funciona</div>

      <div class="card">
        <ul class="kbd-list">
          <li>Instálala desde tu navegador: menú → "Añadir a pantalla de inicio".</li>
          <li>Funciona sin conexión: todo se guarda en el dispositivo.</li>
          <li>Las sesiones en curso se guardan solas: puedes cerrar y volver.</li>
          <li>Copia en tu propio Google Drive: manual o automática (al terminar y al editar).</li>
        </ul>
      </div>

      <p class="card-sub" style="text-align:center;margin-top:18px">
        <a
          href={`${import.meta.env.BASE_URL}privacidad.html`}
          target="_blank"
          rel="noopener"
        >
          Política de privacidad
        </a>
      </p>

      <ConfirmDialog
        open={pendingUnit !== null}
        title={`Cambiar a ${pendingUnit ?? ''}`}
        message={`Se convertirán todos los pesos guardados (1 kg = 2,205 lb). Se actualizan las rutinas y el historial; la conversión se redondea a un decimal.`}
        confirmLabel="Convertir"
        onConfirm={() => {
          if (pendingUnit) setUnit(pendingUnit);
          setPendingUnit(null);
        }}
        onCancel={() => setPendingUnit(null)}
      />

      <ConfirmDialog
        open={pendingBackup !== null}
        title="Importar copia"
        message={`Se reemplazarán los datos actuales por los de la copia (${plural(pendingBackup?.routines.length ?? 0, 'rutina', 'rutinas')}, ${plural(pendingBackup?.sessions.length ?? 0, 'sesión', 'sesiones')}).`}
        confirmLabel="Importar"          onConfirm={() => applyBackup(pendingBackup)}
        onCancel={() => setPendingBackup(null)}
      />

      <ConfirmDialog
        open={confirmClear}
        title="Borrar todos los datos"
        message="Se eliminarán todas las rutinas, sesiones y ajustes de este dispositivo. Esta acción no se puede deshacer."
        confirmLabel="Borrar todo"
        danger
        onConfirm={() => {
          clearAllData();
          setConfirmClear(false);
          setMessage({ kind: 'ok', text: 'Todos los datos han sido borrados.' });
        }}
        onCancel={() => setConfirmClear(false)}
      />

      <ConfirmDialog
        open={pendingDrive !== null}
        title="Restaurar desde Google Drive"
        message={`Se reemplazarán los datos actuales por la copia del ${
          pendingDrive ? fmtDateTime(pendingDrive.exportedAt) || 'sin fecha' : ''
        } (${plural(pendingDrive?.routines.length ?? 0, 'rutina', 'rutinas')}, ${plural(
          pendingDrive?.sessions.length ?? 0,
          'sesión',
          'sesiones',
        )}).`}
        confirmLabel="Restaurar"
        onConfirm={() => applyBackup(pendingDrive)}
        onCancel={() => setPendingDrive(null)}
      />

      <ConfirmDialog
        open={existingRemote !== null}
        title="Ya hay una copia en tu Drive"
        message={`Tu Drive ya tiene una copia de Segim${
          existingRemote?.modifiedTime ? ` del ${fmtDateTime(existingRemote.modifiedTime)}` : ''
        }. Si sigues, se sustituirá por los datos de este dispositivo (${plural(
          s.routines.length,
          'rutina',
          'rutinas',
        )}, ${plural(s.sessions.length, 'sesión', 'sesiones')}). Para recuperarla aquí, cancela y pulsa ⬇️ Restaurar.`}
        confirmLabel="Sustituir copia"
        danger
        onConfirm={() => {
          setExistingRemote(null);
          void subirADrive(true);
        }}
        onCancel={() => setExistingRemote(null)}
      />
    </>
  );
}
