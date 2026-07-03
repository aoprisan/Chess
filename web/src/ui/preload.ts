// Boot-time image preloader. Screens paint their art the moment they mount,
// so any PNG still in flight pops in visibly — the adventure map's biome
// panels and node art swapped mid-scroll on slow connections. Loading every
// gameplay image behind the boot progress bar (see App.tsx) guarantees each
// screen paints complete on its first frame. The PWA service worker precaches
// the same files for offline play, but the very first visit still streams
// them from the network — this makes that first load explicit instead of
// letting it happen mid-game.

import { Biome, ObstacleType } from '../adventure/map';
import { ALL_HEROES } from '../game/hero';
import { biomeBg, heroImage, obstacleArt, ui } from './assets';

const BIOMES: Biome[] = ['meadow', 'forest', 'peaks'];

const OBSTACLES: ObstacleType[] = [
  'fallenLog',
  'riverRaft',
  'sleepingCub',
  'tangledVines',
  'ropeBridge',
  'snowballBoulder',
  'icePatch',
];

/** Every image the game can show: UI chrome, biome panels, obstacles, heroes. */
export function gameImageUrls(): string[] {
  return [
    ...new Set([
      ...Object.values(ui),
      ...BIOMES.map(biomeBg),
      ...OBSTACLES.map(obstacleArt),
      ...ALL_HEROES.map((h) => heroImage(h.imagePath)),
    ]),
  ];
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
      // it just falls back to today's pop-in behavior for that one image.
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
