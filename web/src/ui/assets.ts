// Asset URL helpers. Vite serves public/ at import.meta.env.BASE_URL
// (e.g. '/Chess/' on GitHub Pages), so all asset paths must be prefixed.
// All UI chrome is CSS-drawn (see styles.css); the only image assets left
// are character portraits, which fall back to CSS tiles until art exists
// (see CharacterPortrait.tsx).

export const BASE_URL: string = import.meta.env.BASE_URL;

export function asset(path: string): string {
  // path is like 'assets/images/...'
  return `${BASE_URL}${path}`;
}
