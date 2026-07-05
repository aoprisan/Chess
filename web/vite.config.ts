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
      // NB: do NOT also list these via `includeAssets`. Doing so enqueues the
      // same URLs a second time (with a `?__WB_REVISION__=` marker instead of
      // a content hash), which trips workbox's `add-to-cache-list-conflicting-
      // entries` guard and makes the ENTIRE precache install reject — silently
      // breaking offline. `globPatterns` below already covers every icon,
      // favicon, map JSON and character PNG emitted into dist.
      workbox: {
        // Character art plus the app shell — precache everything so the
        // campaign is playable offline once installed.
        globPatterns: ['**/*.{js,css,html,png,json,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // The app is a single-page app served under `base`. Offline
        // navigations (a reload of /Chess/, or any in-app route) must fall
        // back to the precached shell, otherwise the browser hits the network
        // and fails with ERR_INTERNET_DISCONNECTED. Point the fallback at the
        // base-prefixed index so it resolves under GitHub Pages' subpath.
        navigateFallback: `${base}index.html`,
        // Retire stale precaches from earlier deploys on activate.
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Neon City: Bug Busters',
        short_name: 'Neon City',
        description:
          'A kid-friendly cyberpunk lane battler. Recruit repair-bot Fixers, restore the glitched city systems, and reboot the AI Core!',
        theme_color: '#0a0e1a',
        background_color: '#0a0e1a',
        display: 'standalone',
        // The city map is portrait-friendly but the combat board is
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
