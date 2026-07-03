// Image preloader. Screens paint their art the moment they mount, so any
// PNG still in flight pops in visibly — the adventure map's biome panels
// and node art used to swap mid-scroll on slow connections.
//
// Art is split into groups so boot only blocks on the menu's ~0.7MB while
// the heavy art (heroes ~2.6MB, adventure ~11MB) streams in the background
// in priority order. Screens that need a group are wrapped in <AssetGate>
// (see AssetGate.tsx), which shows the same progress bar in the rare case
// the player navigates faster than the background load — so no screen can
// ever paint with half-loaded images. The PWA service worker precaches the
// same files for offline play; this covers the very first visit, before
// the worker has them.

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

export type AssetGroup = 'menu' | 'heroes' | 'combat' | 'adventure';

/** Background-load order after boot: what the player reaches first, first. */
export const BACKGROUND_GROUPS: AssetGroup[] = ['heroes', 'combat', 'adventure'];

function groupUrlList(group: AssetGroup): string[] {
  switch (group) {
    case 'menu':
      return [ui.mainBg, ui.logo, ui.yellowBtn, ui.greyBtn, ui.titleBg];
    case 'heroes':
      return [
        ui.player1PlayerBg,
        ui.heroPanel,
        ui.heroPanelP1Active,
        ui.heroDetailsPanelBg,
        ...ALL_HEROES.map((h) => heroImage(h.imagePath)),
      ];
    case 'combat':
      return [
        ui.gameFieldBg,
        ui.p1TitleBg,
        ui.p2TitleBg,
        ui.p1ScoreBg,
        ui.p2ScoreBg,
        ui.p1ItemBg,
        ui.p2ItemBg,
        ui.turnFlag,
        ui.redBtn,
      ];
    case 'adventure':
      return [
        ...BIOMES.map(biomeBg),
        ...OBSTACLES.map(obstacleArt),
        ui.chestClosed,
        ui.chestOpen,
        ui.vs,
        ui.flag,
        ui.banner,
      ];
  }
}

/** Deduplicated URLs across the given groups. */
export function groupUrls(groups: AssetGroup[]): string[] {
  return [...new Set(groups.flatMap(groupUrlList))];
}

// Keep loaded images referenced for the whole session so the browser
// doesn't evict the decoded copies while the game is running.
const pinned: HTMLImageElement[] = [];

// One in-flight/settled promise per URL, so overlapping calls (background
// load + a screen gate, or StrictMode's double effect run) never re-download.
const loads = new Map<string, Promise<void>>();
const settled = new Set<string>();

function loadImage(url: string): Promise<void> {
  let load = loads.get(url);
  if (!load) {
    load = new Promise<void>((resolve) => {
      const img = new Image();
      // A missing or broken file must never block the game from starting;
      // it just falls back to pop-in behavior for that one image.
      const finish = () => {
        settled.add(url);
        resolve();
      };
      img.onload = finish;
      img.onerror = finish;
      img.src = url;
      pinned.push(img);
    });
    loads.set(url, load);
  }
  return load;
}

/** True once every image in the given groups has finished loading. */
export function groupsReady(groups: AssetGroup[]): boolean {
  return groupUrls(groups).every((url) => settled.has(url));
}

/** Load the groups' images, reporting progress as a fraction in [0, 1]. */
export async function preloadGroups(
  groups: AssetGroup[],
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const urls = groupUrls(groups);
  let done = 0;
  onProgress?.(0);
  await Promise.all(
    urls.map((url) =>
      loadImage(url).then(() => {
        done += 1;
        onProgress?.(done / urls.length);
      }),
    ),
  );
}
