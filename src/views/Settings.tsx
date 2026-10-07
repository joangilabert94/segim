// Ajustes: unidad, presets de descanso, rutina activa, copias de seguridad y datos.

import { useRef, useState } from 'preact/hooks';
import type { BackupFile } from '../services/backup';
import { buildBackup, downloadBackup, parseBackup } from '../services/backup';
import { clearAllData, getState, replaceAll, updateSettings, useStore } from '../state';
import { DEFAULT_SETTINGS } from '../models';
import { THEME_OPTIONS } from '../services/theme';
import { currentTheme } from '../theme';
import { ConfirmDialog } from '../components/ConfirmDialog';

const APP_VERSION = '0.5.1';

export function SettingsView() {
  const s = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<BackupFile | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const nonArchived = s.routines.filter((r) => !r.archived);

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

  const applyBackup = () => {
    if (!pendingBackup) return;
    replaceAll({
      routines: pendingBackup.routines,
      exercises: pendingBackup.exercises,
      sessions: pendingBackup.sessions,
      settings: pendingBackup.settings,
    });
    setMessage({
      kind: 'ok',
      text: `Importadas ${pendingBackup.routines.length} rutinas, ${pendingBackup.exercises.length} ejercicios y ${pendingBackup.sessions.length} sesiones.`,
    });
    setPendingBackup(null);
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
          <span class="sub">GymRutinas v{APP_VERSION}</span>
        </h1>
      </header>

      <div class="section-title">Entrenamiento</div>

      <div class="card">
        <span class="field-label">Unidad de peso</span>
        <div class="segmented">
          <button
            class={s.settings.unit === 'kg' ? 'is-active' : ''}
            onClick={() => updateSettings({ unit: 'kg' })}
          >
            kg
          </button>
          <button
            class={s.settings.unit === 'lb' ? 'is-active' : ''}
            onClick={() => updateSettings({ unit: 'lb' })}
          >
            lb
          </button>
        </div>

        <div style="margin-top:16px">
          <span class="field-label">Rutina activa (día sugerido)</span>
          <select
            class="input"
            value={s.settings.activeRoutineId ?? ''}
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

      <div class="section-title">Instalar y cómo funciona</div>

      <div class="card">
        <ul class="kbd-list">
          <li>Instálala desde tu navegador: menú → "Añadir a pantalla de inicio".</li>
          <li>Funciona sin conexión: todo se guarda en el dispositivo.</li>
          <li>Las sesiones en curso se guardan solas: puedes cerrar y volver.</li>
          <li>
            Fase 2 (prevista): sincronización opcional con Google Drive a partir de las copias
            JSON.
          </li>
        </ul>
      </div>

      <ConfirmDialog
        open={pendingBackup !== null}
        title="Importar copia"
        message={`Se reemplazarán los datos actuales por los de la copia (${pendingBackup?.routines.length ?? 0} rutinas, ${pendingBackup?.sessions.length ?? 0} sesiones).`}
        confirmLabel="Importar"
        onConfirm={applyBackup}
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
    </>
  );
}
