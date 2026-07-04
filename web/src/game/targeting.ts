// Lane targeting rules — ported from client/lib/widgets/lane_selector.dart (LaneValidator).

import {
  CombatGameState,
  PlayerSide,
  opponentOf,
  countPieces,
  isSideFilled,
  isCloaked,
  isLaneFrozenFor,
  LANE_COUNT,
  SLOTS_PER_SIDE,
} from './state';
import { getPerk } from './perks';

export function getValidLanesForPerk(
  perkId: number,
  gameState: CombatGameState,
  playerSide: PlayerSide,
  firstSelectedLane: number | null = null,
): number[] {
  const opponent = opponentOf(playerSide);
  const validLanes: number[] = [];

  for (let i = 0; i < LANE_COUNT; i++) {
    const lane = gameState.lanes[i];
    if (lane.winner !== null) continue;

    switch (perkId) {
      case 1: // PlaceAnother - your lane not full (or frozen against you)
        if (!isSideFilled(lane, playerSide) && !isLaneFrozenFor(gameState, i, playerSide)) {
          validLanes.push(i);
        }
        break;
      case 39: // Rush - places on the chosen lane, so freeze blocks it too
        if (!isLaneFrozenFor(gameState, i, playerSide)) validLanes.push(i);
        break;
      case 2: // RemoveEnemy
      case 36: // Disperse
        if (isCloaked(gameState, opponent)) break;
        if (countPieces(lane, opponent) > 0) validLanes.push(i);
        break;
      case 4: // Freeze - any non-won lane
        validLanes.push(i);
        break;
      case 31: // Split
      case 32: // Kamikaze
      case 35: // Scatter
        if (countPieces(lane, playerSide) > 0) validLanes.push(i);
        break;
      case 33: // Regroup
        if (firstSelectedLane === null) {
          if (countPieces(lane, playerSide) > 0) validLanes.push(i);
        } else {
          if (i !== firstSelectedLane) validLanes.push(i);
        }
        break;
      case 34: // Disrupt
        if (isCloaked(gameState, opponent)) break;
        if (firstSelectedLane === null) {
          if (countPieces(lane, opponent) > 0) validLanes.push(i);
        } else {
          // Destination may be empty — dumping a stacked enemy lane onto an
          // empty one is the perk's main play (mirrors Regroup above).
          if (i !== firstSelectedLane) validLanes.push(i);
        }
        break;
      case 24: // Portal
      case 25: // Trap
        validLanes.push(i);
        break;
      case 51: // Raid — the raid piece lands on the ENEMY side; never let it complete their lane
        if (countPieces(lane, opponent) < SLOTS_PER_SIDE - 1) validLanes.push(i);
        break;
      default:
        validLanes.push(i);
    }
  }

  return validLanes;
}

export function perkRequiresTarget(perkId: number): boolean {
  return getPerk(perkId)?.requiresTarget ?? true;
}
