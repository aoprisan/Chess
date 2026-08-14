// The Training Grid — the tutorial level's fixed matchup and battle setup.
//
// Everything here exists to make the walkthrough reproducible: the same two
// Fixers, the same perk bar every turn, a seeded RNG and the gentlest AI, so
// the lesson script in tutorialScript.ts can name the powers it teaches.

import { CharacterId, characterById } from '../game/characters';
import type { EngineConfig } from '../game/engine';
import { SeededRNG } from '../game/rng';

/** The player's coach and their sparring partner. */
export const TUTORIAL_PLAYER: CharacterId = 'bitzy';
export const TUTORIAL_RIVAL: CharacterId = 'pixel';

export const tutorialPlayerTeam = () => [characterById(TUTORIAL_PLAYER)];
export const tutorialRivalTeam = () => [characterById(TUTORIAL_RIVAL)];

/**
 * Slots 3/4 are pinned to one power each (Lockdown / Reinforce) so the perk
 * bar never reshuffles under the coach marks, and slots 1/2 are the fixed
 * commons the script actually teaches (Deploy Bot / Debug Zap).
 */
const TUTORIAL_POOLS = { slot3: [4], slot4: [42] };

/**
 * Engine options layered onto the normal Combat setup in tutorial mode. Built
 * fresh per battle so a replayed tutorial starts from the same RNG stream.
 */
export function tutorialEngineConfig(): Partial<EngineConfig> {
  return {
    player1PerkPools: TUTORIAL_POOLS,
    player2PerkPools: TUTORIAL_POOLS,
    // The lesson script teaches a power on the player's very first turn, so the
    // opening perk phase must not be skipped for first-mover compensation.
    firstMoveCompensation: 'none',
    rng: new SeededRNG(20250814),
  };
}

export const TUTORIAL_AI_DIFFICULTY = 'easy';
