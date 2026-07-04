import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project site serves at https://<user>.github.io/Chess/
// (path case matches the repo name exactly — deploy-pages reports the canonical
// URL as /Chess/). The base path, the PWA manifest scope/start_url, and the
// service-worker registration scope must all agree on it, or the SW won't
// control the page and offline breaks. Override with BASE_PATH env (e.g.
// BASE_PATH=/ for a custom domain or <user>.github.io root repo).
const base = process.env.BASE_PATH ?? '/Chess/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'assets/**/*'],
      workbox: {
        // Adventure art (14MB of PNGs) plus the app shell — precache everything
        // so a full journey is playable offline once installed.
        globPatterns: ['**/*.{js,css,html,png,json,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        name: 'Kiddie Chess Adventure',
        short_name: 'Kiddie Chess',
        description: 'A kid-friendly lane-battle adventure. Traverse the maze, clear obstacles, and beat the rival heroes!',
        theme_color: '#8D6E63',
        background_color: '#F5E6D3',
        display: 'standalone',
        // The adventure map is portrait-friendly but the combat board is
        // landscape, so defer to device rotation rather than locking either.
        orientation: 'any',
        // Generated from character art by scripts/generate-icons.mjs (npm run icons).
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
  },
});
