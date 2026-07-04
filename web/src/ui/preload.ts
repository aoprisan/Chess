// Boot-time image preloader. Screens paint their art the moment they mount,
// so any image still in flight pops in visibly. Loading every gameplay image
// behind the boot progress bar (see App.tsx) guarantees each screen paints
// complete on its first frame. The UI chrome is CSS-drawn, so the only art
// is the character portraits; missing files resolve instantly and the
// CharacterPortrait fallback tile takes over.

import { CHARACTERS } from '../game/characters';
import { asset } from './assets';

/** Every image the game can show: the character portraits. */
export function gameImageUrls(): string[] {
  return [...new Set(CHARACTERS.map((c) => asset(c.portrait)))];
}

// Keep loaded images referenced for the whole session so the browser
// doesn't evict the decoded copies while the game is running.
const pinned: HTMLImageElement[] = [];

// One in-flight/settled promise per URL, so repeat calls (StrictMode's
// double effect run, or a future manual retry) never re-download.
const loads = new Map<string, Promise<void>>();

function loadImage(url: string): Promise<void> {
  let load = loads.get(url);
  if (!load) {
    load = new Promise<void>((resolve) => {
      const img = new Image();
      // A missing or broken file must never block the game from starting;
      // portraits without art fall back to the CSS placeholder tile.
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
      pinned.push(img);
    });
    loads.set(url, load);
  }
  return load;
}

/** Load all game images, reporting progress as a fraction in [0, 1]. */
export async function preloadGameImages(onProgress: (fraction: number) => void): Promise<void> {
  const urls = gameImageUrls();
  let done = 0;
  onProgress(0);
  await Promise.all(
    urls.map((url) =>
      loadImage(url).then(() => {
        done += 1;
        onProgress(done / urls.length);
      }),
    ),
  );
}
