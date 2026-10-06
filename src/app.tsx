// Maqueta de la aplicación: barra de pestañas + conmutación de rutas.

import { useEffect, useState } from 'preact/hooks';
import { getPath, subscribePath } from './router';
import { useStore } from './state';
import { Hoy } from './views/Hoy';
import { SessionView } from './views/Session';
import { History } from './views/History';
import { SessionDetail } from './views/SessionDetail';
import { Routines } from './views/Routines';
import { RoutineEditor } from './views/RoutineEditor';
import { Exercises } from './views/Exercises';
import { SettingsView } from './views/Settings';
import { matchPath, navigate } from './router';

const TABS = [
  { path: '/', ico: '🏠', label: 'Hoy' },
  { path: '/rutinas', ico: '📋', label: 'Rutinas' },
  { path: '/ejercicios', ico: '💪', label: 'Ejercicios' },
  { path: '/historial', ico: '📈', label: 'Historial' },
  { path: '/ajustes', ico: '⚙️', label: 'Ajustes' },
] as const;

function usePath(): string {
  const [path, setPath] = useState(getPath());
  useEffect(() => subscribePath(setPath), []);
  return path;
}

export function App() {
  const path = usePath();
  useStore(); // re-renderiza ante cambios de datos

  const inSession = path === '/sesion';

  let view = <NotFound />;
  if (path === '/') {
    view = <Hoy />;
  } else if (inSession) {
    view = <SessionView />;
  } else if (path === '/historial') {
    view = <History />;
  } else if (matchPath('/historial/:id', path)) {
    view = <SessionDetail id={matchPath('/historial/:id', path)!.id} />;
  } else if (path === '/rutinas') {
    view = <Routines />;
  } else if (matchPath('/rutinas/:id', path)) {
    view = <RoutineEditor id={matchPath('/rutinas/:id', path)!.id} />;
  } else if (path === '/ejercicios') {
    view = <Exercises />;
  } else if (path === '/ajustes') {
    view = <SettingsView />;
  }

  const activeTab =
    path === '/' ? '/' : `/${path.split('/')[1] ?? ''}`;

  return (
    <div class="app">
      <main class={inSession ? 'view view--session' : 'view'}>{view}</main>

      {!inSession && (
        <nav class="tabbar" aria-label="Navegación principal">
          {TABS.map((t) => (
            <button
              key={t.path}
              class={`tab ${activeTab === t.path ? 'is-active' : ''}`}
              aria-current={activeTab === t.path ? 'page' : undefined}
              onClick={() => navigate(t.path)}
            >
              <span class="tab-ico" aria-hidden="true">{t.ico}</span>
              <span class="tab-label">{t.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function NotFound() {
  return (
    <div class="empty">
      <span class="empty-ico">🤷</span>
      <h3>Página no encontrada</h3>
      <button class="btn btn-primary" onClick={() => navigate('/')}>
        Volver al inicio
      </button>
    </div>
  );
}
