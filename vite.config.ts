import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Ruta base configurable para desplegar en GitHub Pages bajo /nombre-repo/
const base = process.env.BASE_PATH ?? '/';

// Hosts extra permitidos por el servidor de desarrollo, separados por comas.
// Lo usa el proxy de previsualización (la VM sirve la app con otro dominio);
// en un despliegue normal no hace falta, porque los estáticos van a Pages.
const devAllowedHosts = (process.env.VITE_DEV_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  base,
  server: {
    allowedHosts: devAllowedHosts.length > 0 ? devAllowedHosts : undefined,
  },
  // La versión sale de package.json (npm la expone al ejecutar los scripts).
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Segim — control de rutinas de gimnasio',
        short_name: 'Segim',
        description:
          'Rutinas, series, pesos y repeticiones de tu día a día en el gimnasio. Funciona sin conexión.',
        lang: 'es',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        // El tema claro es el valor por defecto; el manifest es estático
        // (no admite la preferencia), así que refleja ese default.
        theme_color: '#f4f7f1',
        background_color: '#f4f7f1',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
  },
});
