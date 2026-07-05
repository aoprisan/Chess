// Perk category colors/icons plus one distinct glyph per perk, shared by the
// combat perk bar, lane pills, How to Play catalog, roster, and team picker.
// Kids in the 8-11 target group can't all read fast — every power keeps the
// same picture everywhere so it can be recognized without reading.

import { PerkCategory, getPerk } from '../game/perks';
import { IconName } from './Icons';

export const CATEGORY_COLOR: Record<PerkCategory, string> = {
  offensive: '#ff2fd6', // neon magenta
  defensive: '#00e5ff', // neon cyan
  utility: '#3dff8f', // neon lime
};

export const CATEGORY_ICON: Record<PerkCategory, IconName> = {
  offensive: 'flash',
  defensive: 'shield',
  utility: 'build',
};

/** One unique glyph per perk (perkTheme.test.ts enforces the allocation). */
export const PERK_ICON: Record<number, IconName> = {
  0: 'skip', // Pass
  1: 'robot', // Deploy Bot
  2: 'flash', // Debug Zap
  // Slot 3: React & Protect
  4: 'snowflake', // Lockdown
  22: 'eyeOff', // Stealth Mode
  24: 'portal', // Warp Gate
  25: 'bug', // Honeypot
  26: 'copy', // Copycat
  27: 'surround', // Ping Echo
  28: 'boltCircle', // Power Surge
  29: 'two', // Duplicator
  30: 'flame', // Short Circuit
  46: 'cloud', // Cloud Backup
  33: 'swap', // Reroute
  35: 'shuffle', // Scatter
  43: 'wifi', // Beacon
  49: 'heart', // Safe Zone
  52: 'replay', // Bounce Back
  // Slot 4: Act & Disrupt
  13: 'sync', // Scramble
  23: 'noise', // Static Storm
  31: 'split', // Split
  32: 'burst', // Overload
  34: 'flip', // Crosswire
  36: 'scatterDots', // Disperse
  37: 'dice', // Gambit
  38: 'download', // Data Grab
  39: 'doubleArrow', // Rush
  40: 'personAdd', // Recruit
  41: 'crosshair', // Ambush
  42: 'plusCircle', // Reinforce
  50: 'magnet', // Magnet
  51: 'search', // Probe
  48: 'shieldCheck', // Firewall
};

/** The perk's own glyph, falling back to its category icon. */
export function perkIcon(perkId: number): IconName {
  return PERK_ICON[perkId] ?? CATEGORY_ICON[getPerk(perkId)?.category ?? 'utility'];
}
