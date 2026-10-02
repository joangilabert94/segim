import { render } from 'preact';
import { App } from './app';
import { loadState } from './state';
import { registerSW } from 'virtual:pwa-register';

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

const root = document.getElementById('app');

loadState().then(() => {
  if (root) render(<App />, root);
});

// PWA: actualización automática del service worker.
if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
}
