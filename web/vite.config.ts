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
      includeAssets: ['favicon.png', 'assets/**/*'],
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
        orientation: 'portrait',
        icons: [
          { src: 'assets/images/characters/gnom.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'assets/images/characters/gnom.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
  },
});
