// Asset URL helpers. Vite serves public/ at import.meta.env.BASE_URL
// (e.g. '/Chess/' on GitHub Pages), so all asset paths must be prefixed.

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

// Obstacle popup copy — mirrors client/lib/widgets/encounter_popup.dart.
export interface ObstacleInfo {
  title: string;
  instruction: string;
  clearedText: string;
  tapsRequired: number;
}

export const OBSTACLE_INFO: Record<ObstacleType, ObstacleInfo> = {
  fallenLog: {
    title: 'A Fallen Log!',
    instruction: 'Tap the log 3 times to push it aside!',
    clearedText: 'You pushed it away!',
    tapsRequired: 3,
  },
  riverRaft: {
    title: 'A River!',
    instruction: 'Tap the raft to float across!',
    clearedText: 'Smooth sailing!',
    tapsRequired: 1,
  },
  sleepingCub: {
    title: 'A Sleeping Bear Cub!',
    instruction: 'Tap gently to wake it up!',
    clearedText: 'It yawned and wandered off!',
    tapsRequired: 2,
  },
  tangledVines: {
    title: 'Tangled Vines!',
    instruction: 'Tap 3 times to brush them aside!',
    clearedText: 'The path is clear!',
    tapsRequired: 3,
  },
  ropeBridge: {
    title: 'A Wobbly Bridge!',
    instruction: 'Tap to cross carefully!',
    clearedText: 'You made it across!',
    tapsRequired: 1,
  },
  snowballBoulder: {
    title: 'A Giant Snowball!',
    instruction: 'Tap 3 times to roll it off the path!',
    clearedText: 'It rolled away!',
    tapsRequired: 3,
  },
  icePatch: {
    title: 'Slippery Ice!',
    instruction: 'Tap to slide across!',
    clearedText: 'Wheee! You slid across!',
    tapsRequired: 1,
  },
};

export const ui = {
  mainBg: asset('assets/images/ui/main-bg.png'),
  logo: asset('assets/images/ui/KiddieChess.png'),
  yellowBtn: asset('assets/images/ui/yellow-btn-bg.png'),
  greyBtn: asset('assets/images/ui/grey-btn-bg.png'),
  redBtn: asset('assets/images/ui/combat/red-btn-bg.png'),
  titleBg: asset('assets/images/ui/title-bg.png'),
  player1PlayerBg: asset('assets/images/ui/player-1-player-bg.png'),
  heroPanel: asset('assets/images/ui/hero-panel.png'),
  heroPanelP1Active: asset('assets/images/ui/hero-panel-player-1-acitve.png'),
  heroDetailsPanelBg: asset('assets/images/ui/hero-details-panel-bg.png'),
  // Combat
  gameFieldBg: asset('assets/images/ui/combat/game-field-bg.png'),
  p1TitleBg: asset('assets/images/ui/combat/player-1-title-bg.png'),
  p2TitleBg: asset('assets/images/ui/combat/player-2-title-bg.png'),
  p1ScoreBg: asset('assets/images/ui/combat/player-1-title-score-bg.png'),
  p2ScoreBg: asset('assets/images/ui/combat/player-2-title-score-bg.png'),
  p1ItemBg: asset('assets/images/ui/combat/player-1-item-bg.png'),
  p2ItemBg: asset('assets/images/ui/combat/player-2-item-bg.png'),
  turnFlag: asset('assets/images/ui/combat/turn-flag.png'),
  // Adventure props
  chestClosed: asset('assets/images/adventure/prop_chest_closed.png'),
  chestOpen: asset('assets/images/adventure/prop_chest_open.png'),
  vs: asset('assets/images/adventure/ui_vs.png'),
  flag: asset('assets/images/adventure/prop_flag.png'),
  banner: asset('assets/images/adventure/prop_banner.png'),
};

/** Injects asset-backed CSS custom properties so styles.css can reference them. */
export function installCssAssetVars(): void {
  const vars: Record<string, string> = {
    '--img-main-bg': `url(${ui.mainBg})`,
    '--img-yellow-btn': `url(${ui.yellowBtn})`,
    '--img-grey-btn': `url(${ui.greyBtn})`,
    '--img-red-btn': `url(${ui.redBtn})`,
    '--img-title-bg': `url(${ui.titleBg})`,
    '--img-player1-badge': `url(${ui.player1PlayerBg})`,
    '--img-hero-panel': `url(${ui.heroPanel})`,
    '--img-hero-panel-active': `url(${ui.heroPanelP1Active})`,
    '--img-hero-details': `url(${ui.heroDetailsPanelBg})`,
    '--img-game-field': `url(${ui.gameFieldBg})`,
  };
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}
