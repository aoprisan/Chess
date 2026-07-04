// AI opponent — greedy 1-ply heuristic scorer over (perk, lane) candidates.
// Returns [perkId, targetLane, secondLane]; perkId 0 = pass; secondLane non-null
// only for dual-lane perks (Regroup/Disrupt).
//
// Difficulty ladder (tuned via src/game/simulate.ts, see balance.test.ts):
// - easy:   30% pass, otherwise a random usable perk on a random valid lane.
// - medium: best-scoring choice, but 25% of turns it plays a random usable perk
//           instead (deliberate mistakes).
// - hard:   always the best-scoring choice.

import { CombatEngine } from './engine';
import { CombatGameState, PlayerSide, opponentOf, ownerInt, countPieces } from './state';
import { getPerk, PerkSlot } from './perks';
import { getValidLanesForPerk } from './targeting';
import { RNG } from './rng';

export type AIChoice = [perkId: number, targetLane: number, secondLane: number | null];

const MEDIUM_MISTAKE_RATE = 0.25;
const EASY_PASS_RATE = 0.3;

export function chooseAIPerk(engine: CombatEngine): AIChoice {
  const player = engine.state.currentPlayer;
  // A blinded AI reasons from the snapshot taken when Blind hit it (won
  // lanes and turn info stay live). Stale choices execute against the real
  // engine and silently no-op.
  const state = engine.beliefStateFor(player);
  const opponent = opponentOf(player);
  const difficulty = player === 'player1' ? engine.player1AIDifficulty : engine.player2AIDifficulty;
  const rng = engine.rng;
  const slots = engine.currentPerkSlots;

  if (difficulty === 'easy') {
    if (rng.nextDouble() < EASY_PASS_RATE) return [0, -1, null];
    return randomChoice(state, slots, player, opponent, rng);
  }

  if (difficulty === 'medium' && rng.nextDouble() < MEDIUM_MISTAKE_RATE) {
    return randomChoice(state, slots, player, opponent, rng);
  }

  // Greedy: best-scoring (perk, lane) candidate; pass baseline is 0.
  let bestPerkId = 0;
  let bestTarget = -1;
  let bestSecondTarget: number | null = null;
  let bestScore = 0;

  for (const slot of slots) {
    if (slot.perkId <= 0 || slot.disabled) continue;
    const perkDef = getPerk(slot.perkId);
    if (!perkDef) continue;

    if (slot.perkId === 33 || slot.perkId === 34) {
      const result = scoreDualLanePerk(state, slot.perkId, player, opponent);
      if (result[0] > bestScore) {
        bestScore = result[0];
        bestPerkId = slot.perkId;
        bestTarget = result[1];
        bestSecondTarget = result[2];
      }
      continue;
    }

    if (!perkDef.requiresTarget) {
      const score = scoreAutoTargetPerk(state, slot.perkId, player, opponent);
      if (score > bestScore) {
        bestScore = score;
        bestPerkId = slot.perkId;
        bestTarget = -1;
        bestSecondTarget = null;
      }
    } else {
      const validLanes = getValidLanesForPerk(slot.perkId, state, player);
      for (const lane of validLanes) {
        const score = scorePerkOnLane(state, slot.perkId, lane, player, opponent);
        if (score > bestScore) {
          bestScore = score;
          bestPerkId = slot.perkId;
          bestTarget = lane;
          bestSecondTarget = null;
        }
      }
    }
  }

  return [bestPerkId, bestTarget, bestSecondTarget];
}

/** Random usable perk on a random valid lane; falls back to pass. */
function randomChoice(
  state: CombatGameState,
  slots: PerkSlot[],
  player: PlayerSide,
  opponent: PlayerSide,
  rng: RNG,
): AIChoice {
  const usable = slots.filter((s) => s.perkId > 0 && !s.disabled);
  // Try slots in random order until one has a legal use.
  const order = usable.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const slot of order) {
    const perkDef = getPerk(slot.perkId);
    if (!perkDef) continue;
    if (slot.perkId === 33 || slot.perkId === 34) {
      const result = scoreDualLanePerk(state, slot.perkId, player, opponent);
      if (result[1] >= 0) return [slot.perkId, result[1], result[2]];
      continue;
    }
    if (!perkDef.requiresTarget) return [slot.perkId, -1, null];
    const validLanes = getValidLanesForPerk(slot.perkId, state, player);
    if (validLanes.length > 0) {
      return [slot.perkId, validLanes[rng.nextInt(validLanes.length)], null];
    }
  }
  return [0, -1, null];
}

// --- Board aggregates -------------------------------------------------------

function totalPieces(state: CombatGameState, side: PlayerSide): number {
  let total = 0;
  for (const lane of state.lanes) {
    if (lane.winner === null) total += countPieces(lane, side);
  }
  return total;
}

function maxLanePieces(state: CombatGameState, side: PlayerSide): number {
  let max = 0;
  for (const lane of state.lanes) {
    if (lane.winner !== null) continue;
    const n = countPieces(lane, side);
    if (n > max) max = n;
  }
  return max;
}

function lanesWon(state: CombatGameState, side: PlayerSide): number {
  return side === 'player1' ? state.player1LanesWon : state.player2LanesWon;
}

// --- Scoring -----------------------------------------------------------------

// Score scale: 100 = wins a lane this turn, 90 = blocks an imminent enemy lane
// win, 20-60 = strong tempo, <20 = filler. Match-deciding moves get a bonus so
// they always dominate.

function scorePerkOnLane(
  state: CombatGameState,
  perkId: number,
  lane: number,
  player: PlayerSide,
  opponent: PlayerSide,
): number {
  const laneState = state.lanes[lane];
  const myPieces = countPieces(laneState, player);
  const enemyPieces = countPieces(laneState, opponent);
  // Winning/blocking the 3rd lane decides the match — always take it.
  const winBonus = lanesWon(state, player) === 2 ? 100 : 0;
  const blockBonus = lanesWon(state, opponent) === 2 ? 60 : 0;

  switch (perkId) {
    case 1: // PlaceAnother: instant lane win at 4
      if (myPieces === 4) return 100 + winBonus;
      return 12 + myPieces * 6;
    case 2: // RemoveEnemy: block threats, don't spam
      if (enemyPieces === 4) return 90 + blockBonus;
      if (enemyPieces === 3) return 32;
      return enemyPieces * 7;
    case 4: // Freeze: deny the enemy a whole turn on their threat lane
      if (enemyPieces >= 4) return 65 + blockBonus;
      if (enemyPieces === 3) return 22;
      return 6;
    case 31: // Split: net +1 spread out; never break up a near-win
      if (myPieces === 4) return 2;
      return 18;
    case 32: // Kamikaze: trade 1 for 2 random enemy pieces
      return (totalPieces(state, opponent) >= 5 ? 20 : 12) - myPieces * 2;
    case 35: // Scatter: repositioning filler
      return 6;
    case 36: // Disperse: breaks up a stacked enemy lane
      if (enemyPieces === 4) return 55 + blockBonus;
      if (enemyPieces === 3) return 18;
      return 4;
    case 39: // Rush: +2 me first => instant lane win from 3+; otherwise feeds the enemy
      if (myPieces === 4 || myPieces === 3) return 88 + winBonus;
      return Math.max(2, 10 - enemyPieces * 2);
    case 48: {
      // Nullify: only worth it against enemy-owned triggers on my lane
      const enemyTriggers = laneState.triggers.filter((t) => t.owner !== ownerInt(player)).length;
      return enemyTriggers > 0 ? 15 + enemyTriggers * 10 : 1;
    }
    case 24: // Portal — deny the enemy's winning placement on their stacked lane
    case 25: // Trap
      if (enemyPieces === 4) return 45 + blockBonus;
      if (enemyPieces === 3) return 25;
      return 10;
    // Conditional triggers all grant +1 now (instant lane win at 4) plus a
    // 2-turn conditional upside, so they carry a PlaceAnother-shaped floor.
    case 26: // Mirror: +1 now; +2 for me when they place here
    case 27: // Echo
      if (myPieces === 4) return 100 + winBonus;
      return 14 + myPieces * 5 + enemyPieces * 4;
    case 28: // Shockwave: +1 now; they place here, lose 2 elsewhere
      if (myPieces === 4) return 100 + winBonus;
      return 12 + myPieces * 5 + enemyPieces * 5;
    case 52: // Retaliate: +1 now; they place here, raid launched
      if (myPieces === 4) return 100 + winBonus;
      return 12 + myPieces * 5 + enemyPieces * 4;
    case 29: // Hydra — +1 now, and protects my stacked lane from removal
    case 30: // Backfire
    case 46: // Absorb
      if (myPieces === 4) return 100 + winBonus;
      return 10 + myPieces * 6 + (myPieces >= 3 ? 8 : 0);
    case 43: // Signal: +1 now (+1 pulled next turn) — instant win at 4, setup at 3
      if (myPieces === 4) return 100 + winBonus;
      if (myPieces === 3) return 60 + winBonus;
      return 20;
    case 40: // Enlist: +1 now, capture next turn
      if (myPieces === 4) return 100 + winBonus;
      return 18 + myPieces * 2;
    case 41: // Ambush: +1 now, remove nearby enemy next turn
      if (myPieces === 4) return 100 + winBonus;
      return enemyPieces >= 3 ? 26 : 14;
    case 42: // Reinforce: +1 now +1 next turn — instant win at 4, near-win at 3
      if (myPieces === 4) return 100 + winBonus;
      if (myPieces === 3) return 60 + winBonus;
      return 16 + myPieces * 4;
    case 49: // Sanctuary: worth protecting a developed board
      return totalPieces(state, player) >= 6 ? 18 : 8;
    case 50: // Capture: future removals land on my side
      return totalPieces(state, opponent) >= 4 ? 20 : 10;
    case 51: // Raid: the raid piece lands on the enemy side — raiding a 3-stack gifts them a 4th piece
      return enemyPieces >= 3 ? 6 : 14;
    default:
      return 10;
  }
}

function scoreAutoTargetPerk(
  state: CombatGameState,
  perkId: number,
  player: PlayerSide,
  opponent: PlayerSide,
): number {
  const blockBonus = lanesWon(state, opponent) === 2 ? 60 : 0;
  switch (perkId) {
    case 13: {
      // Scramble: resets the enemy's board shape
      const maxEnemy = maxLanePieces(state, opponent);
      if (maxEnemy >= 4) return 50 + blockBonus;
      if (maxEnemy === 3) return 20;
      return 4;
    }
    case 22: // Cloak: shields my stacked lanes from targeted removal
      return maxLanePieces(state, player) >= 3 ? 25 : 8;
    case 23: // Blind: degrades the AI's targeting — worth more against a developed board
      return totalPieces(state, opponent) >= 6 ? 16 : 8;
    case 37: // Gambit: 3-for-2 in the enemy's favor
      return 6;
    case 38: // Steal
      return 16;
    default:
      return 10;
  }
}

function scoreDualLanePerk(
  state: CombatGameState,
  perkId: number,
  player: PlayerSide,
  opponent: PlayerSide,
): [score: number, lane1: number, lane2: number | null] {
  const firstLanes = getValidLanesForPerk(perkId, state, player);
  if (firstLanes.length === 0) return [0, -1, null];

  let bestScore = 0;
  let bestL1 = -1;
  let bestL2 = -1;

  for (const l1 of firstLanes) {
    const secondLanes = getValidLanesForPerk(perkId, state, player, l1);
    for (const l2 of secondLanes) {
      let score: number;
      if (perkId === 33) {
        // Regroup: mild repositioning value
        const myL1 = countPieces(state.lanes[l1], player);
        const myL2 = countPieces(state.lanes[l2], player);
        score = Math.abs(myL1 - myL2) * 3 + 3;
      } else {
        // Disrupt: drag a stacked enemy lane onto an empty one
        const eL1 = countPieces(state.lanes[l1], opponent);
        const eL2 = countPieces(state.lanes[l2], opponent);
        const diff = Math.abs(eL1 - eL2);
        score = diff * 4 + 3;
        if (Math.max(eL1, eL2) >= 4) score += 25;
      }
      if (score > bestScore) {
        bestScore = score;
        bestL1 = l1;
        bestL2 = l2;
      }
    }
  }

  return [bestScore, bestL1, bestL2 === -1 ? null : bestL2];
}
