import { render } from 'preact';
import { App } from './app';
import { loadState, notifyListeners } from './state';
import { initTheme, onThemeChange } from './theme';
import { registerSW } from 'virtual:pwa-register';

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

const root = document.getElementById('app');

initTheme();
onThemeChange(notifyListeners);

loadState().then(() => {
  if (root) render(<App />, root);
});

if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

// Sin almacenamiento persistente el navegador puede desalojar IndexedDB si falta espacio.
const storage = navigator.storage;
if (storage && typeof storage.persist === 'function') {
  storage
    .persisted()
    .then((persisted) => (persisted ? true : storage.persist()))
    .catch(() => undefined);
}
