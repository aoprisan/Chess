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

export const PERKS: Record<number, PerkInfo> = {
  0: p(0, 'Pass', 'Skip perk selection and end turn', 'utility', false),

  // Fixed commons (slots 1-2)
  1: p(1, 'PlaceAnother', 'Place 1 piece on any lane', 'offensive', true, 'own'),
  2: p(2, 'RemoveEnemy', "Remove enemy's frontmost piece, then recharge 1 turn", 'offensive', true, 'enemy'),

  // Slot 3: React & Protect
  4: p(4, 'Freeze', 'Block enemy placement for 1 turn', 'defensive', true, 'enemy'),
  22: p(22, 'Cloak', 'Hide your pieces for 2 turns', 'defensive', false, 'own'),
  24: p(24, 'Portal', 'Enemy pieces placed here teleport away', 'defensive', true, 'enemy'),
  25: p(25, 'Trap', 'Enemy pieces placed here vanish', 'defensive', true, 'enemy'),
  26: p(26, 'Mirror', '+1 now; enemy places here, you get +2', 'defensive', true, 'enemy'),
  27: p(27, 'Echo', '+1 now; enemy places here, you get +2 random', 'defensive', true, 'enemy'),
  28: p(28, 'Shockwave', '+1 now; enemy places here, loses 2 elsewhere', 'offensive', true, 'enemy'),
  29: p(29, 'Hydra', '+1 now; piece removed here spawns 2 elsewhere', 'defensive', true, 'own'),
  30: p(30, 'Backfire', '+1 now; piece removed here costs enemy 2', 'offensive', true, 'own'),
  46: p(46, 'Absorb', '+1 now; removed piece reappears elsewhere', 'defensive', true, 'own'),
  33: p(33, 'Regroup', 'Swap your pieces between 2 lanes', 'utility', true, 'own'),
  35: p(35, 'Scatter', 'Move your pieces to random lanes', 'utility', true, 'own'),
  43: p(43, 'Signal', '+1 now, pull from most populated next turn', 'utility', true, 'own'),
  49: p(49, 'Sanctuary', 'Losses redirect here for 2 turns', 'defensive', true, 'own'),
  52: p(52, 'Retaliate', '+1 now; enemy places here, raid their side', 'offensive', true, 'enemy'),

  // Slot 4: Act & Disrupt
  13: p(13, 'Scramble', 'Redistribute all enemy pieces', 'offensive', false, 'enemy'),
  23: p(23, 'Blind', 'Hide enemy pieces for 2 turns', 'offensive', false, 'enemy'),
  31: p(31, 'Split', 'Sacrifice 1, gain 2 elsewhere', 'utility', true, 'own'),
  32: p(32, 'Kamikaze', 'Sacrifice 1, enemy loses 2', 'offensive', true, 'own'),
  34: p(34, 'Disrupt', 'Swap enemy pieces between 2 lanes', 'offensive', true, 'enemy'),
  36: p(36, 'Disperse', 'Move enemy pieces to random lanes', 'offensive', true, 'enemy'),
  37: p(37, 'Gambit', 'Enemy gets 3, you get 2 concentrated', 'utility', false),
  38: p(38, 'Steal', 'Enemy -1, you +1 random', 'offensive', false),
  39: p(39, 'Rush', 'Both +2 on lane, you -1 elsewhere', 'offensive'),
  40: p(40, 'Enlist', '+1 now, capture enemy next turn', 'offensive', true, 'own'),
  41: p(41, 'Ambush', '+1 now, remove enemy next turn', 'offensive', true, 'own'),
  42: p(42, 'Reinforce', '+1 now, +1 more next turn', 'utility', true, 'own'),
  50: p(50, 'Capture', 'Removed enemies become yours here', 'offensive', true, 'own'),
  51: p(51, 'Raid', 'Place on enemy side, roll next turn', 'offensive', true, 'enemy'),
  48: p(48, 'Nullify', 'Cancel all triggers on your lane', 'utility', true, 'own'),
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
