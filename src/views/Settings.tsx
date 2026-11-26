import { useRef, useState } from 'preact/hooks';
import type { Unit } from '../models';
import type { BackupFile } from '../services/backup';
import { buildBackup, downloadBackup, parseBackup } from '../services/backup';
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
import { CloudPanel } from '../components/CloudPanel';
import { fmtDateTime, fmtWeightInput, parseNumber, plural } from '../services/format';

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export function SettingsView() {
  const s = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<BackupFile | null>(null);
  const [pendingUnit, setPendingUnit] = useState<Unit | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const nonArchived = s.routines.filter((r) => !r.archived);
  // Activa archivada o borrada: el selector muestra el placeholder en vez de quedarse en blanco.
  const activeRoutineSelectable = nonArchived.some(
    (r) => r.id === s.settings.activeRoutineId,
  );

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
    // Cuenta lo que queda tras fusionar el catálogo: con duplicados hay menos que en el fichero.
    const imported = getState();
    setMessage({
      kind: 'ok',
      text: `Importadas ${plural(imported.routines.length, 'rutina', 'rutinas')}, ${plural(imported.exercises.length, 'ejercicio', 'ejercicios')} y ${plural(imported.sessions.length, 'sesión', 'sesiones')}.`,
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

      <div class="card">
        <label class="field">
          <span class="field-label">Incremento de la progresión ({s.settings.unit})</span>
          <input
            class="input"
            inputMode="decimal"
            value={fmtWeightInput(s.settings.progressionIncrement)}
            onChange={(e) => {
              const n = parseNumber(e.currentTarget.value);
              if (n !== null && n > 0) updateSettings({ progressionIncrement: n });
              else e.currentTarget.value = fmtWeightInput(s.settings.progressionIncrement);
            }}
          />
        </label>
        <p class="hint">
          Cuando todas las series con rango de un ejercicio llegan al tope, la siguiente sesión
          sube este peso. Cada ejercicio puede tener el suyo en la pestaña Ejercicios.
        </p>
        <label class="field" style="margin-top:12px">
          <span class="field-label">Peso corporal ({s.settings.unit}, opcional)</span>
          <input
            class="input"
            inputMode="decimal"
            placeholder="Sin indicar"
            value={s.settings.bodyweight !== undefined ? fmtWeightInput(s.settings.bodyweight) : ''}
            onChange={(e) => {
              const n = parseNumber(e.currentTarget.value);
              if (n === null) updateSettings({ bodyweight: undefined });
              else if (n > 0) updateSettings({ bodyweight: n });
            }}
          />
        </label>
        <p class="hint">
          En los ejercicios de peso corporal y asistidos se suma (o se resta la ayuda) para el
          1RM y el volumen. Sin él, esos ejercicios no cuentan en kg.
        </p>
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
          Los datos viven en este dispositivo (IndexedDB) y, si inicias sesión, también en tu
          cuenta de Supabase. Exporta una copia periódica para no perderlos.
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

      <div class="section-title">Cuenta y sincronización</div>

      <CloudPanel />

      <div class="section-title">Instalar y cómo funciona</div>

      <div class="card">
        <ul class="kbd-list">
          <li>Instálala desde tu navegador: menú → "Añadir a pantalla de inicio".</li>
          <li>Funciona sin conexión: todo se guarda en el dispositivo.</li>
          <li>Las sesiones en curso se guardan solas: puedes cerrar y volver.</li>
          <li>Con cuenta, las rutinas y las sesiones se sincronizan entre dispositivos.</li>
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
        confirmLabel="Importar"
        onConfirm={() => applyBackup(pendingBackup)}
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
