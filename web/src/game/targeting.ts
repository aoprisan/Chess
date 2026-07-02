// Lane targeting rules — ported from client/lib/widgets/lane_selector.dart (LaneValidator).

import {
  CombatGameState,
  PlayerSide,
  opponentOf,
  countPieces,
  isSideFilled,
  isCloaked,
  LANE_COUNT,
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
      case 1: // PlaceAnother - your lane not full
        if (!isSideFilled(lane, playerSide)) validLanes.push(i);
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
          if (i !== firstSelectedLane && countPieces(lane, opponent) > 0) validLanes.push(i);
        }
        break;
      case 24: // Portal
      case 25: // Trap
        validLanes.push(i);
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
