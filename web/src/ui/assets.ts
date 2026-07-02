// Asset URL helpers. Vite serves public/ at import.meta.env.BASE_URL
// (e.g. '/chess/' on GitHub Pages), so all asset paths must be prefixed.

import { ObstacleType } from '../adventure/map';
import { Biome } from '../adventure/map';

export const BASE_URL: string = import.meta.env.BASE_URL;

export function asset(path: string): string {
  // path is like 'assets/images/...'
  return `${BASE_URL}${path}`;
}

export function heroImage(imagePath: string): string {
  return asset(imagePath);
}

export function biomeBg(biome: Biome): string {
  return asset(`assets/images/adventure/bg_${biome}.png`);
}

const OBSTACLE_ART: Record<ObstacleType, string> = {
  fallenLog: 'obstacle_fallen_log',
  riverRaft: 'obstacle_river_raft',
  sleepingCub: 'obstacle_sleeping_cub',
  tangledVines: 'obstacle_tangled_vines',
  ropeBridge: 'obstacle_rope_bridge',
  snowballBoulder: 'obstacle_snowball',
  icePatch: 'obstacle_ice_patch',
};

export function obstacleArt(obstacle: ObstacleType): string {
  return asset(`assets/images/adventure/${OBSTACLE_ART[obstacle]}.png`);
}

export const OBSTACLE_LABEL: Record<ObstacleType, string> = {
  fallenLog: 'Fallen Log',
  riverRaft: 'River Crossing',
  sleepingCub: 'Sleeping Cub',
  tangledVines: 'Tangled Vines',
  ropeBridge: 'Rope Bridge',
  snowballBoulder: 'Snowball Boulder',
  icePatch: 'Icy Patch',
};

export const ui = {
  mainBg: asset('assets/images/ui/main-bg.png'),
  logo: asset('assets/images/ui/KiddieChess.png'),
  gameFieldBg: asset('assets/images/ui/game-field-bg.png'),
  yellowBtn: asset('assets/images/ui/yellow-btn-bg.png'),
  greyBtn: asset('assets/images/ui/grey-btn-bg.png'),
  redBtn: asset('assets/images/ui/red-btn-bg.png'),
  chestClosed: asset('assets/images/adventure/prop_chest_closed.png'),
  chestOpen: asset('assets/images/adventure/prop_chest_open.png'),
  vs: asset('assets/images/adventure/ui_vs.png'),
  flag: asset('assets/images/adventure/prop_flag.png'),
};
