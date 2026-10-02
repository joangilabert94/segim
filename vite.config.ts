import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Ruta base configurable para desplegar en GitHub Pages bajo /nombre-repo/
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'GymRutinas — control de rutinas de gimnasio',
        short_name: 'GymRutinas',
        description:
          'Rutinas, series, pesos y repeticiones de tu día a día en el gimnasio. Funciona sin conexión.',
        lang: 'es',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0c0f0e',
        background_color: '#0c0f0e',
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
