import { render } from 'preact';
import { App } from './app';
import { loadState, notifyListeners } from './state';
import { initTheme, onThemeChange } from './theme';
import { registerSW } from 'virtual:pwa-register';

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

const root = document.getElementById('app');

// Pinta el tema cacheado y se suscribe a los cambios del sistema;
// loadState() vuelve a aplicarlo con la preferencia guardada.
initTheme();
// Si el sistema cambia de modo con la app abierta, re-renderiza la UI
// (el texto de Ajustes refleja el tema resuelto).
onThemeChange(notifyListeners);

loadState().then(() => {
  if (root) render(<App />, root);
});

// PWA: actualización automática del service worker.
if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
}
