import type { CapacitorConfig } from '@capacitor/cli';

// Native (Android/iOS) shell around the same client-side PWA build. The web
// app is 100% offline already — engine, AI and campaign all run in the
// browser — so the native app just ships `dist/` inside the WebView and needs
// no network permissions or backend of any kind.
//
// Build it with `npm run build:mobile` (BASE_PATH=/ + CAPACITOR=1), never with
// the GitHub Pages build: the Pages build is based at /Chess/ and registers a
// service worker, neither of which makes sense inside a WebView.
const config: CapacitorConfig = {
  appId: 'com.neoncity.bugbusters',
  appName: 'Neon City',
  webDir: 'dist',
  // Match the PWA manifest's background_color so the WebView doesn't flash
  // white between the splash screen and first paint.
  backgroundColor: '#0a0e1aff',
  android: {
    backgroundColor: '#0a0e1aff',
    // Nothing is loaded over http:// — everything is bundled.
    allowMixedContent: false,
  },
  ios: {
    backgroundColor: '#0a0e1aff',
    // The board is a fixed, non-scrolling layout; `never` keeps the WebView
    // from inseting content under the status bar twice (the app already pads
    // itself with env(safe-area-inset-*) in styles.css).
    contentInset: 'never',
  },
  server: {
    androidScheme: 'https',
  },
};

// Live reload: point the native app at a running `npm run dev:mobile` server
// (base `/`, listening on the LAN) instead of the bundled `dist/`. Use the LAN
// IP of the dev machine, not localhost, so a physical device can reach it:
//
//   npm run dev:mobile                                    # terminal 1
//   CAP_SERVER_URL=http://192.168.1.20:5173/ npm run android:run   # terminal 2
//
// `cleartext` is required because the dev server is plain http.
const devUrl = process.env.CAP_SERVER_URL;
if (devUrl) {
  config.server = { ...config.server, url: devUrl, cleartext: true };
}

export default config;
