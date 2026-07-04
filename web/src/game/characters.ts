// The 23 Fixers of Neon City — friendly repair bots the player recruits
// through the campaign. Each character owns 1-3 perks from the tuned V2
// catalog; in campaign battles the perk pools for slots 3/4 are built from
// the characters actually present (see buildPerkPools + CombatEngine pools).
//
// Allocation invariant (enforced by characters.test.ts): every pool perk in
// SLOT3_POOL ∪ SLOT4_POOL has exactly one PRIMARY owner (starters + map 1 +
// map 2 own 23 perks, map 3 signatures own the remaining 7); map 3 characters
// additionally borrow earlier perks to reach 3 each. Recruiting everyone
// yields the full 30-perk catalog.

import { SLOT3_POOL, SLOT4_POOL } from './perks';

export type CharacterId = string;

export interface Character {
  id: CharacterId;
  name: string;
  /** Job title flavor, e.g. 'Code Cadet'. Cosmetic only. */
  role: string;
  /** One-liner for roster/team-picker cards. Cosmetic only. */
  tagline: string;
  /** 1-3 perk ids from SLOT3_POOL ∪ SLOT4_POOL. */
  perkIds: number[];
  /** Asset slot — final art drops in at this path with no code change. */
  portrait: string;
  /** Neon accent used by the CSS placeholder portrait. */
  accent: string;
  /** 0 = starter (on the crew from the beginning); 1-3 = map where recruitable. */
  homeMap: 0 | 1 | 2 | 3;
}

function c(
  id: CharacterId,
  name: string,
  role: string,
  tagline: string,
  perkIds: number[],
  accent: string,
  homeMap: 0 | 1 | 2 | 3,
): Character {
  return {
    id,
    name,
    role,
    tagline,
    perkIds,
    portrait: `assets/images/characters/${id}.png`,
    accent,
    homeMap,
  };
}

export const CHARACTERS: Character[] = [
  // --- Starters (5) — one signature perk each ---
  c('bitzy', 'Bitzy', 'Code Cadet', 'Locks glitches out before they sneak in.', [4], '#00e5ff', 0),
  c('pixel', 'Pixel', 'Patch Artist', 'Every fix gets a little extra polish.', [42], '#ff2fd6', 0),
  c('cache', 'Cache', 'Memory Keeper', 'Copies the good stuff, twice.', [26], '#7b2fff', 0),
  c('sparky', 'Sparky', 'Power Tech', 'Full speed ahead, sparks flying.', [39], '#ffd23f', 0),
  c('momo', 'Momo', 'Safety Officer', 'Keeps every bot safe and sound.', [49], '#3dff8f', 0),

  // --- Map 1: Street Grid (6) — one signature perk each ---
  c('popcorn', 'Popcorn', 'Trap Tinkerer', 'Leaves sweet surprises for glitches.', [25], '#ff9f1c', 1),
  c('reverb', 'Reverb', 'Echo Engineer', 'Answers every ping twice.', [27], '#00e5ff', 1),
  c('forky', 'Forky', 'Fork Fixer', 'Trades one bot for two, every time.', [31], '#3dff8f', 1),
  c('swipe', 'Swipe', 'Data Courier', 'Finders keepers, packets weepers.', [38], '#ff2fd6', 1),
  c('scatterbug', 'Scatterbug', 'Messy Mover', 'Never in the place you expect.', [35], '#ffd23f', 1),
  c('recruta', 'Recruta', 'Friend Maker', 'Turns rival bots into buddies.', [40], '#7b2fff', 1),

  // --- Map 2: Metro Net (6) — one slot-3 + one slot-4 perk each ---
  c('static', 'Static', 'Cloak Master', 'Now you see the crew, now you don’t.', [22, 23], '#7b2fff', 2),
  c('warp', 'Warp', 'Gate Guard', 'Sends intruders somewhere else entirely.', [24, 36], '#00e5ff', 2),
  c('twinsy', 'Twinsy', 'Clone Chief', 'Why have one bot when you can have two?', [29, 32], '#3dff8f', 2),
  c('sparkplug', 'Sparkplug', 'Shock Smith', 'Touch the line, feel the zap.', [30, 41], '#ffd23f', 2),
  c('beacon', 'Beacon', 'Signal Scout', 'Always knows where the crowd is.', [43, 34], '#ff9f1c', 2),
  c('shuffle', 'Shuffle', 'Line Juggler', 'Keeps every line guessing.', [33, 13], '#ff2fd6', 2),

  // --- Map 3: Sky Core (6) — one or two unique signatures + borrowed perks (3 total) ---
  c('vex', 'Vex', 'Surge Captain', 'Rides the power spikes for fun.', [28, 51, 13], '#ff2fd6', 3),
  c('sponge', 'Sponge', 'Backup Boss', 'Nothing is ever really lost.', [46, 29, 42], '#00e5ff', 3),
  c('payback', 'Payback', 'Counter Chief', 'Every glitch gets a receipt.', [52, 30, 32], '#ff9f1c', 3),
  c('gamba', 'Gamba', 'Deal Broker', 'Always trades up in the end.', [37, 38, 22], '#7b2fff', 3),
  c('magnet', 'Magnet', 'Catch Commander', 'What gets zapped, gets kept.', [50, 40, 25], '#3dff8f', 3),
  c('nullo', 'Nullo', 'Firewall Warden', 'No tricks allowed on these lines.', [48, 4, 34], '#ffd23f', 3),
];

export const STARTER_IDS: CharacterId[] = CHARACTERS.filter((ch) => ch.homeMap === 0).map(
  (ch) => ch.id,
);

const BY_ID = new Map(CHARACTERS.map((ch) => [ch.id, ch]));

export function characterById(id: CharacterId): Character {
  const ch = BY_ID.get(id);
  if (!ch) throw new Error(`Unknown character: ${id}`);
  return ch;
}

export function charactersForMap(homeMap: 0 | 1 | 2 | 3): Character[] {
  return CHARACTERS.filter((ch) => ch.homeMap === homeMap);
}

/** Per-side perk pools for CombatEngine slots 3/4. */
export interface PerkPools {
  slot3: number[];
  slot4: number[];
}

const SLOT3_SET = new Set(SLOT3_POOL);
const SLOT4_SET = new Set(SLOT4_POOL);

/**
 * Union of the given characters' perks, deduped and split by slot pool
 * membership. An empty side is allowed — the engine falls back to the full
 * catalog pool for that slot (see CombatEngine.generatePerkSlots).
 */
export function buildPerkPools(ids: CharacterId[]): PerkPools {
  const seen = new Set<number>();
  const slot3: number[] = [];
  const slot4: number[] = [];
  for (const id of ids) {
    for (const perkId of characterById(id).perkIds) {
      if (seen.has(perkId)) continue;
      seen.add(perkId);
      if (SLOT3_SET.has(perkId)) slot3.push(perkId);
      else if (SLOT4_SET.has(perkId)) slot4.push(perkId);
    }
  }
  return { slot3, slot4 };
}
