// AI opponent — faithful port of chooseAIPerk + scoring from combat_service.dart.
// Greedy 1-ply heuristic scorer. Returns [perkId, targetLane, secondLane].
// perkId 0 = pass; secondLane non-null only for dual-lane perks (Regroup/Disrupt).

import { CombatEngine } from './engine';
import { CombatGameState, PlayerSide, opponentOf, countPieces } from './state';
import { getPerk } from './perks';
import { getValidLanesForPerk } from './targeting';

export type AIChoice = [perkId: number, targetLane: number, secondLane: number | null];

export function chooseAIPerk(engine: CombatEngine): AIChoice {
  const state = engine.state;
  const player = state.currentPlayer;
  const opponent = opponentOf(player);
  const difficulty = player === 'player1' ? engine.player1AIDifficulty : engine.player2AIDifficulty;
  const rng = engine.rng;
  const slots = engine.currentPerkSlots;

  // Easy: 30% pass, 25% random usable perk
  if (difficulty === 'easy') {
    if (rng.nextDouble() < 0.3) return [0, -1, null];
    if (rng.nextDouble() < 0.25) {
      const usable = slots.filter((s) => s.perkId > 0);
      if (usable.length > 0) {
        const slot = usable[rng.nextInt(usable.length)];
        const perkDef = getPerk(slot.perkId);
        if (perkDef) {
          if (slot.perkId === 33 || slot.perkId === 34) {
            const result = scoreDualLanePerk(state, slot.perkId, player, opponent);
            if (result[1] >= 0) return [slot.perkId, result[1], result[2]];
          } else if (!perkDef.requiresTarget) {
            return [slot.perkId, -1, null];
          } else {
            const validLanes = getValidLanesForPerk(slot.perkId, state, player);
            if (validLanes.length > 0) {
              return [slot.perkId, validLanes[rng.nextInt(validLanes.length)], null];
            }
          }
        }
      }
    }
  }

  // Medium & Hard: scoring-based
  let bestPerkId = 0;
  let bestTarget = -1;
  let bestSecondTarget: number | null = null;
  let bestScore = 0; // pass baseline

  for (const slot of slots) {
    if (slot.perkId <= 0) continue;
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
      const score = scoreAutoTargetPerk(state, slot.perkId, opponent);
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

  switch (perkId) {
    case 1: // PlaceAnother
      if (myPieces === 4) return 100;
      if (enemyPieces >= 4) return 40;
      return 10 + myPieces * 5;
    case 2: // RemoveEnemy
      if (enemyPieces >= 5) return 90;
      if (enemyPieces >= 4) return 80;
      return 5 + enemyPieces * 8;
    case 4: // Freeze
      if (enemyPieces >= 3) return 30 + enemyPieces * 5;
      return 10;
    case 31: // Split
      if (myPieces >= 2) return 20;
      return 8;
    case 32: // Kamikaze
      if (enemyPieces >= 4) return 35;
      return 10;
    case 35: // Scatter
      if (myPieces >= 3) return 15;
      return 5;
    case 36: // Disperse
      if (enemyPieces >= 4) return 40;
      return 5 + enemyPieces * 5;
    case 39: // Rush
      if (myPieces >= 3) return 30;
      return 12;
    case 48: // Nullify
      if (laneState.triggers.length > 0) return 25;
      return 2;
    case 24:
    case 25:
    case 26:
    case 27:
    case 28:
    case 29:
    case 30:
    case 46:
    case 52:
      if (enemyPieces >= 3) return 20 + enemyPieces * 3;
      return 10;
    case 43: // Signal
      return 15;
    case 40: // Enlist
      return 15 + myPieces * 3;
    case 41: // Ambush
      if (enemyPieces >= 3) return 25;
      return 12;
    case 42: // Reinforce
      if (myPieces >= 3) return 25;
      return 12;
    case 49: // Sanctuary
      if (myPieces >= 3) return 20;
      return 8;
    case 50: // Capture
      if (enemyPieces >= 3) return 25;
      return 10;
    case 51: // Raid
      if (myPieces >= 2) return 18;
      return 8;
    default:
      return 10;
  }
}

function scoreAutoTargetPerk(state: CombatGameState, perkId: number, opponent: PlayerSide): number {
  switch (perkId) {
    case 13: {
      // Scramble
      let maxEnemy = 0;
      for (const lane of state.lanes) {
        if (lane.winner !== null) continue;
        const ep = countPieces(lane, opponent);
        if (ep > maxEnemy) maxEnemy = ep;
      }
      if (maxEnemy >= 4) return 50;
      if (maxEnemy >= 3) return 25;
      return 5;
    }
    case 22: return 15; // Cloak
    case 23: return 15; // Blind
    case 37: return 12; // Gambit
    case 38: return 20; // Steal
    default: return 10;
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
        const myL1 = countPieces(state.lanes[l1], player);
        const myL2 = countPieces(state.lanes[l2], player);
        score = Math.abs(myL1 - myL2) * 5 + 5;
        if (myL1 >= 3 || myL2 >= 3) score += 15;
      } else {
        const eL1 = countPieces(state.lanes[l1], opponent);
        const eL2 = countPieces(state.lanes[l2], opponent);
        score = Math.abs(eL1 - eL2) * 5 + 5;
        if (eL1 >= 4 || eL2 >= 4) score += 20;
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
