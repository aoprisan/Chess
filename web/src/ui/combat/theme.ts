import { PerkInfo, PerkTargetSide } from '../../game/perks';

// Translation keys for the "which half does this perk affect" pill label.
export const SIDE_LABEL_KEY: Record<PerkTargetSide, string> = {
  own: 'combat.side.own',
  enemy: 'combat.side.enemy',
  both: 'combat.side.both',
};

export const DUAL_LANE_PERKS = new Set([33, 34]);
export const FREEZE_PERK = 4;

// Lane-half highlight palette while targeting: cyan = your half, magenta =
// enemy half, amber = whole line; Lockdown keeps its signature ice-blue.
export interface SideStyle {
  fill: string;
  border: string;
  pill: string;
  label: string;
}
export const SIDE_STYLE: Record<PerkTargetSide, SideStyle> = {
  own: {
    fill: 'rgba(0,229,255,0.28)',
    border: '#00e5ff',
    pill: 'rgba(0,151,167,0.92)',
    label: 'Your side',
  },
  enemy: {
    fill: 'rgba(255,47,214,0.28)',
    border: '#ff2fd6',
    pill: 'rgba(170,20,140,0.92)',
    label: 'Enemy side',
  },
  both: {
    fill: 'rgba(255,210,63,0.25)',
    border: '#ffd23f',
    pill: 'rgba(255,160,0,0.9)',
    label: 'Whole line',
  },
};
export const FREEZE_STYLE: SideStyle = {
  fill: 'rgba(66,165,245,0.3)',
  border: '#42A5F5',
  pill: 'rgba(25,118,210,0.9)',
  label: 'Enemy side',
};
export const SIDE_CHIP_COLOR: Record<PerkTargetSide, string> = {
  own: '#0097a7',
  enemy: '#aa148c',
  both: '#FFA000',
};

export function sideStyleFor(perkId: number, info: PerkInfo | undefined): SideStyle {
  if (perkId === FREEZE_PERK) return FREEZE_STYLE;
  return SIDE_STYLE[info?.targetSide ?? 'both'];
}

export interface CombatResult {
  playerWon: boolean;
  stars: number; // 0 on loss, 1-3 on win
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
