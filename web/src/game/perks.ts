// Perk catalog — ported from client/lib/widgets/perk_card.dart (PerkDefinitions)
// and the Slot3/Slot4 pools from combat_service.dart.

export type PerkCategory = 'offensive' | 'defensive' | 'utility';

/**
 * Which half of the targeted lane the perk affects: your own half (place,
 * protect, or move your pieces), the enemy half (remove/move enemy pieces or
 * watch enemy placement), or the whole lane.
 */
export type PerkTargetSide = 'own' | 'enemy' | 'both';

export interface PerkInfo {
  id: number;
  name: string;
  description: string;
  category: PerkCategory;
  requiresTarget: boolean;
  targetSide: PerkTargetSide;
}

function p(
  id: number,
  name: string,
  description: string,
  category: PerkCategory,
  requiresTarget = true,
  targetSide: PerkTargetSide = 'both',
): PerkInfo {
  return { id, name, description, category, requiresTarget, targetSide };
}

// Neon City flavor: pieces are "bots", lanes are "data lines". Perk ids and
// mechanics are unchanged from the tuned V2 catalog — only names/copy differ.
// Descriptions are capped at 5 kid-friendly words; the pictogram row in
// web/src/ui/PerkPicto.tsx carries the detail for pre-readers.
export const PERKS: Record<number, PerkInfo> = {
  0: p(0, 'Pass', 'Skip your turn', 'utility', false),

  // Fixed commons (slots 1-2)
  1: p(1, 'Deploy Bot', 'Add 1 bot anywhere', 'offensive', true, 'own'),
  2: p(2, 'Debug Zap', 'Zap 1 enemy bot', 'offensive', true, 'enemy'),

  // Slot 3: React & Protect
  4: p(4, 'Lockdown', 'Freeze a line 1 turn', 'defensive', true, 'enemy'),
  22: p(22, 'Stealth Mode', 'Hide your bots 2 turns', 'defensive', false, 'own'),
  24: p(24, 'Warp Gate', 'Enemy deploys bounce away', 'defensive', true, 'enemy'),
  25: p(25, 'Honeypot', 'Enemy deploys get eaten', 'defensive', true, 'enemy'),
  26: p(26, 'Copycat', '+1 now; copy enemy deploys', 'defensive', true, 'enemy'),
  27: p(27, 'Ping Echo', '+1 now; echo enemy deploys', 'defensive', true, 'enemy'),
  28: p(28, 'Power Surge', '+1 now; shock enemy deploys', 'offensive', true, 'enemy'),
  29: p(29, 'Duplicator', 'Lost bot returns as 2', 'defensive', true, 'own'),
  30: p(30, 'Short Circuit', 'Lost bot zaps 2 back', 'offensive', true, 'own'),
  46: p(46, 'Cloud Backup', 'Lost bot comes back', 'defensive', true, 'own'),
  33: p(33, 'Reroute', 'Swap your bots between lines', 'utility', true, 'own'),
  35: p(35, 'Scatter', 'Move your bots around', 'utility', true, 'own'),
  43: p(43, 'Beacon', '+1 now; borrow 1 later', 'utility', true, 'own'),
  49: p(49, 'Safe Zone', 'Your losses land here', 'defensive', true, 'own'),
  52: p(52, 'Bounce Back', '+1 now; sneak back later', 'offensive', true, 'enemy'),

  // Slot 4: Act & Disrupt
  13: p(13, 'Scramble', 'Shuffle all enemy bots', 'offensive', false, 'enemy'),
  23: p(23, 'Static Storm', 'Fuzz their screens 2 turns', 'offensive', false, 'enemy'),
  31: p(31, 'Split', 'Trade 1 bot for 2', 'utility', true, 'own'),
  32: p(32, 'Overload', 'Blow 1; enemy loses 2', 'offensive', true, 'own'),
  34: p(34, 'Crosswire', 'Swap enemy bots between lines', 'offensive', true, 'enemy'),
  36: p(36, 'Disperse', 'Move enemy bots around', 'offensive', true, 'enemy'),
  37: p(37, 'Gambit', 'They get 3, you 2', 'utility', false),
  38: p(38, 'Data Grab', 'They −1, you +1', 'offensive', false),
  39: p(39, 'Rush', 'Both +2 here, you −1', 'offensive'),
  40: p(40, 'Recruit', '+1 now; steal 1 later', 'offensive', true, 'own'),
  41: p(41, 'Ambush', '+1 now; zap 1 later', 'offensive', true, 'own'),
  42: p(42, 'Reinforce', '+1 now; +1 more later', 'utility', true, 'own'),
  50: p(50, 'Magnet', 'Zapped enemies join you', 'offensive', true, 'own'),
  51: p(51, 'Probe', 'Sneak in; roll later', 'offensive', true, 'enemy'),
  48: p(48, 'Firewall', 'Clear all traps here', 'utility', true, 'own'),
};

export function getPerk(id: number): PerkInfo | undefined {
  return PERKS[id];
}

/** Slot 3 pool: React & Protect (15 perks, matching server Slot3Pool order). */
export const SLOT3_POOL: number[] = [4, 22, 24, 25, 26, 27, 28, 29, 30, 46, 33, 35, 43, 49, 52];

/** Slot 4 pool: Act & Disrupt (15 perks, matching server Slot4Pool order). */
export const SLOT4_POOL: number[] = [13, 23, 31, 32, 34, 36, 37, 38, 39, 40, 41, 42, 50, 51, 48];

export interface PerkSlot {
  slotIndex: number;
  perkId: number;
  perkName: string;
  /** Slot is visible but not selectable this turn (e.g. RemoveEnemy recharging). */
  disabled?: boolean;
}
