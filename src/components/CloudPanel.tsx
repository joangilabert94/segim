import { useState } from 'preact/hooks';
import {
  cloudSignIn,
  cloudSignOut,
  cloudSignUp,
  cloudSyncNow,
  resolveCloudChoice,
  startCloud,
  useCloud,
} from '../services/cloud/bridge';
import { isCloudConfigured } from '../services/cloud/config';
import { fmtDateTime } from '../services/format';

export function CloudPanel() {
  const cloud = useCloud();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (!isCloudConfigured() || cloud.phase === 'off') {
    return (
      <div class="card">
        <p class="card-sub">
          Esta versión no tiene configurada la nube. Los datos siguen viviendo solo en este
          dispositivo; exporta una copia desde Ajustes si quieres respaldo.
        </p>
      </div>
    );
  }

  const submit = (action: 'in' | 'up') => {
    const mail = email.trim();
    if (!mail || password === '') return;
    void (action === 'in' ? cloudSignIn(mail, password) : cloudSignUp(mail, password));
  };

  return (
    <div class="card">
      {cloud.phase === 'loading' && <p class="card-sub">Conectando con Supabase…</p>}

      {cloud.phase === 'signed-out' && (
        <>
          <p class="card-sub" style="margin-bottom:12px">
            Entra con tu correo para tener las rutinas y las sesiones en todos tus dispositivos y
            ver los cambios al momento. Sin cuenta, la app funciona igual que siempre, en local.
          </p>
          <label class="field">
            <span class="field-label">Correo</span>
            <input
              class="input"
              type="email"
              inputMode="email"
              autocomplete="email"
              placeholder="tu@correo.com"
              value={email}
              onInput={(e) => setEmail(e.currentTarget.value)}
            />
          </label>
          <label class="field" style="margin-top:10px">
            <span class="field-label">Contraseña</span>
            <input
              class="input"
              type="password"
              autocomplete="current-password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit('in');
              }}
            />
          </label>
          <div class="btn-row" style="margin-top:12px">
            <button
              class="btn btn-primary"
              style="flex:1"
              disabled={cloud.busy}
              onClick={() => submit('in')}
            >
              Entrar
            </button>
            <button class="btn" style="flex:1" disabled={cloud.busy} onClick={() => submit('up')}>
              Crear cuenta
            </button>
          </div>
        </>
      )}

      {cloud.phase === 'choice' && (
        <>
          <p class="card-sub" style="margin-bottom:12px">
            Ya hay datos en este dispositivo y también en la nube. Elige cuáles se quedan: lo que
            elijas sustituirá al otro lado.
          </p>
          <button
            class="btn btn-primary btn-block"
            disabled={cloud.busy}
            onClick={() => void resolveCloudChoice('local')}
          >
            Subir los de este dispositivo
          </button>
          <button
            class="btn btn-block"
            style="margin-top:8px"
            disabled={cloud.busy}
            onClick={() => void resolveCloudChoice('cloud')}
          >
            Usar los de la nube
          </button>
        </>
      )}

      {cloud.phase === 'ready' && (
        <>
          <p class="card-sub" style="margin-bottom:12px">
            Conectado{cloud.email ? ` como ${cloud.email}` : ''}. Los cambios se sincronizan solos y
            los de otro dispositivo aparecen aquí en unos segundos.
            {cloud.lastSyncAt ? ` Última sincronización: ${fmtDateTime(cloud.lastSyncAt)}.` : ''}
          </p>
          <div class="btn-row">
            <button class="btn btn-primary" style="flex:1" disabled={cloud.busy} onClick={() => void cloudSyncNow()}>
              {cloud.busy ? 'Subiendo…' : '☁️ Subir ahora'}
            </button>
            <button class="btn" style="flex:1" disabled={cloud.busy} onClick={() => void cloudSignOut()}>
              Cerrar sesión
            </button>
          </div>
          <p class="hint" style="margin-top:10px">
            Los datos se guardan en Postgres y los puedes consultar con SQL desde el panel de
            Supabase. Al cerrar sesión no se borra nada de este dispositivo.
          </p>
        </>
      )}

      {cloud.phase === 'error' && (
        <>
          <div class="inline-msg is-error">{cloud.message ?? 'No se pudo sincronizar.'}</div>
          <div class="btn-row" style="margin-top:10px">
            <button class="btn btn-primary" style="flex:1" onClick={() => void startCloud()}>
              Reintentar
            </button>
            <button class="btn" style="flex:1" onClick={() => void cloudSignOut()}>
              Cerrar sesión
            </button>
          </div>
        </>
      )}

      {cloud.phase === 'signed-out' && cloud.message && (
        <div class="inline-msg is-error" style="margin-top:12px">
          {cloud.message}
        </div>
      )}
    </div>
  );
}
