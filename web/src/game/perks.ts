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
export const PERKS: Record<number, PerkInfo> = {
  0: p(0, 'Pass', 'Skip perk selection and end turn', 'utility', false),

  // Fixed commons (slots 1-2)
  1: p(1, 'Deploy Bot', 'Place 1 bot on any line', 'offensive', true, 'own'),
  2: p(
    2,
    'Debug Zap',
    "Zap the enemy's front bot, then recharge 1 turn",
    'offensive',
    true,
    'enemy',
  ),

  // Slot 3: React & Protect
  4: p(4, 'Lockdown', 'Block enemy deploys on a line for 1 turn', 'defensive', true, 'enemy'),
  22: p(22, 'Stealth Mode', 'Hide your bots for 2 turns', 'defensive', false, 'own'),
  24: p(24, 'Warp Gate', 'Enemy bots deployed here teleport away', 'defensive', true, 'enemy'),
  25: p(25, 'Honeypot', 'Enemy bots deployed here vanish', 'defensive', true, 'enemy'),
  26: p(26, 'Copycat', '+1 now; enemy deploys here, you get +2', 'defensive', true, 'enemy'),
  27: p(27, 'Ping Echo', '+1 now; enemy deploys here, you get +2 random', 'defensive', true, 'enemy'),
  28: p(
    28,
    'Power Surge',
    '+1 now; enemy deploys here, loses 2 elsewhere',
    'offensive',
    true,
    'enemy',
  ),
  29: p(29, 'Duplicator', '+1 now; a bot removed here respawns as 2 elsewhere', 'defensive', true, 'own'),
  30: p(30, 'Short Circuit', '+1 now; a bot removed here costs the enemy 2', 'offensive', true, 'own'),
  46: p(46, 'Cloud Backup', '+1 now; your removed bot reappears elsewhere', 'defensive', true, 'own'),
  33: p(33, 'Reroute', 'Swap your bots between 2 lines', 'utility', true, 'own'),
  35: p(35, 'Scatter', 'Move your bots to random lines', 'utility', true, 'own'),
  43: p(43, 'Beacon', '+1 now, pull from your busiest line next turn', 'utility', true, 'own'),
  49: p(49, 'Safe Zone', 'Your losses redirect here for 2 turns', 'defensive', true, 'own'),
  52: p(52, 'Bounce Back', '+1 now; enemy deploys here, you probe their side', 'offensive', true, 'enemy'),

  // Slot 4: Act & Disrupt
  13: p(13, 'Scramble', 'Shuffle all enemy bots to new lines', 'offensive', false, 'enemy'),
  23: p(23, 'Static Storm', "Fuzz the enemy's screens for 2 turns", 'offensive', false, 'enemy'),
  31: p(31, 'Split', 'Trade 1 bot for 2 elsewhere', 'utility', true, 'own'),
  32: p(32, 'Overload', 'Sacrifice 1 bot, enemy loses 2', 'offensive', true, 'own'),
  34: p(34, 'Crosswire', 'Swap enemy bots between 2 lines', 'offensive', true, 'enemy'),
  36: p(36, 'Disperse', 'Move enemy bots to random lines', 'offensive', true, 'enemy'),
  37: p(37, 'Gambit', 'Enemy gets 3, you get 2 together', 'utility', false),
  38: p(38, 'Data Grab', 'Enemy -1, you +1 random', 'offensive', false),
  39: p(39, 'Rush', 'Both +2 on a line, you -1 elsewhere', 'offensive'),
  40: p(40, 'Recruit', '+1 now, win over an enemy bot next turn', 'offensive', true, 'own'),
  41: p(41, 'Ambush', '+1 now, remove an enemy next turn', 'offensive', true, 'own'),
  42: p(42, 'Reinforce', '+1 now, +1 more next turn', 'utility', true, 'own'),
  50: p(50, 'Magnet', 'Enemy bots you remove join you here', 'offensive', true, 'own'),
  51: p(51, 'Probe', 'Sneak onto the enemy side, roll next turn', 'offensive', true, 'enemy'),
  48: p(48, 'Firewall', 'Cancel all triggers on your line', 'utility', true, 'own'),
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
