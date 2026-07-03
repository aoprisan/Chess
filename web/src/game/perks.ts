// Perk catalog — ported from client/lib/widgets/perk_card.dart (PerkDefinitions)
// and the Slot3/Slot4 pools from combat_service.dart.

export type PerkCategory = 'offensive' | 'defensive' | 'utility';

export interface PerkInfo {
  id: number;
  name: string;
  description: string;
  category: PerkCategory;
  requiresTarget: boolean;
}

function p(
  id: number,
  name: string,
  description: string,
  category: PerkCategory,
  requiresTarget = true,
): PerkInfo {
  return { id, name, description, category, requiresTarget };
}

export const PERKS: Record<number, PerkInfo> = {
  0: p(0, 'Pass', 'Skip perk selection and end turn', 'utility', false),

  // Fixed commons (slots 1-2)
  1: p(1, 'PlaceAnother', 'Place 1 piece on any lane', 'offensive'),
  2: p(2, 'RemoveEnemy', "Remove enemy's frontmost piece", 'offensive'),

  // Slot 3: React & Protect
  4: p(4, 'Freeze', 'Block enemy placement for 1 turn', 'defensive'),
  22: p(22, 'Cloak', 'Hide your pieces for 2 turns', 'defensive', false),
  24: p(24, 'Portal', 'Enemy pieces placed here teleport away', 'defensive'),
  25: p(25, 'Trap', 'Enemy pieces placed here vanish', 'defensive'),
  26: p(26, 'Mirror', 'Enemy places here, you get +2', 'defensive'),
  27: p(27, 'Echo', 'Enemy places here, you get +2 random', 'defensive'),
  28: p(28, 'Shockwave', 'Enemy places here, loses 2 elsewhere', 'offensive'),
  29: p(29, 'Hydra', 'Piece removed here spawns 2 elsewhere', 'defensive'),
  30: p(30, 'Backfire', 'Piece removed here costs enemy 2', 'offensive'),
  46: p(46, 'Absorb', 'Removed piece reappears elsewhere', 'defensive'),
  33: p(33, 'Regroup', 'Swap your pieces between 2 lanes', 'utility'),
  35: p(35, 'Scatter', 'Move your pieces to random lanes', 'utility'),
  43: p(43, 'Signal', '+1 now, pull from most populated next turn', 'utility'),
  49: p(49, 'Sanctuary', 'Losses redirect here for 2 turns', 'defensive'),
  52: p(52, 'Retaliate', 'Enemy places here, raid their side', 'offensive'),

  // Slot 4: Act & Disrupt
  13: p(13, 'Scramble', 'Redistribute all enemy pieces', 'offensive', false),
  23: p(23, 'Blind', 'Hide enemy pieces for 2 turns', 'offensive', false),
  31: p(31, 'Split', 'Sacrifice 1, gain 2 elsewhere', 'utility'),
  32: p(32, 'Kamikaze', 'Sacrifice 1, enemy loses 2', 'offensive'),
  34: p(34, 'Disrupt', 'Swap enemy pieces between 2 lanes', 'offensive'),
  36: p(36, 'Disperse', 'Move enemy pieces to random lanes', 'offensive'),
  37: p(37, 'Gambit', 'Enemy gets 3, you get 2 concentrated', 'utility', false),
  38: p(38, 'Steal', 'Enemy -1, you +1 random', 'offensive', false),
  39: p(39, 'Rush', 'Both +2 on lane, you -1 elsewhere', 'offensive'),
  40: p(40, 'Enlist', '+1 now, capture enemy next turn', 'offensive'),
  41: p(41, 'Ambush', '+1 now, remove enemy next turn', 'offensive'),
  42: p(42, 'Reinforce', '+1 now, +1 more next turn', 'utility'),
  50: p(50, 'Capture', 'Removed enemies become yours here', 'offensive'),
  51: p(51, 'Raid', 'Place on enemy side, roll next turn', 'offensive'),
  48: p(48, 'Nullify', 'Cancel all triggers on your lane', 'utility'),
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
