import 'package:flutter/material.dart';
import '../models/combat_state.dart';
import 'perk_card.dart';

/// Overlay for selecting a target lane for a perk
class LaneSelectorOverlay extends StatelessWidget {
  final int perkId;
  final String perkName;
  final CombatGameState gameState;
  final PlayerSide playerSide;
  final List<int> validLanes;
  final Function(int laneIndex) onLaneSelected;
  final VoidCallback onCancel;

  const LaneSelectorOverlay({
    super.key,
    required this.perkId,
    required this.perkName,
    required this.gameState,
    required this.playerSide,
    required this.validLanes,
    required this.onLaneSelected,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final perkInfo = PerkDefinitions.getPerk(perkId);

    return Container(
      color: Colors.black.withOpacity(0.7),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Perk info header
          Container(
            padding: const EdgeInsets.all(16),
            margin: const EdgeInsets.symmetric(horizontal: 24),
            decoration: BoxDecoration(
              color: Colors.grey.shade900,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: perkInfo?.categoryColor ?? Colors.amber,
                width: 2,
              ),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (perkInfo != null)
                      Icon(
                        perkInfo.categoryIcon,
                        color: perkInfo.categoryColor,
                        size: 24,
                      ),
                    const SizedBox(width: 8),
                    Text(
                      perkInfo?.name ?? perkName,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  perkInfo?.description ?? '',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey.shade400,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                Text(
                  'Select a lane:',
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.amber.shade400,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Lane selection buttons
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (index) {
              final isValid = validLanes.contains(index);
              final lane = gameState.lanes[index];
              final myPieces = lane.countPieces(playerSide);
              final opponent = playerSide == PlayerSide.player1
                  ? PlayerSide.player2
                  : PlayerSide.player1;
              final enemyCloaked = gameState.isCloaked(opponent);
              final enemyPieces = lane.countPieces(opponent);

              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: _LaneButton(
                  laneIndex: index,
                  isValid: isValid,
                  isWon: lane.winner != null,
                  myPieces: myPieces,
                  enemyPieces: enemyPieces,
                  enemyCloaked: enemyCloaked,
                  winner: lane.winner,
                  playerSide: playerSide,
                  onTap: isValid ? () => onLaneSelected(index) : null,
                ),
              );
            }),
          ),
          const SizedBox(height: 24),

          // Cancel button
          ElevatedButton.icon(
            onPressed: onCancel,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.grey.shade700,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            ),
            icon: const Icon(Icons.close),
            label: const Text('Cancel'),
          ),
        ],
      ),
    );
  }
}

class _LaneButton extends StatelessWidget {
  final int laneIndex;
  final bool isValid;
  final bool isWon;
  final int myPieces;
  final int enemyPieces;
  final bool enemyCloaked;
  final PlayerSide? winner;
  final PlayerSide playerSide;
  final VoidCallback? onTap;

  const _LaneButton({
    required this.laneIndex,
    required this.isValid,
    required this.isWon,
    required this.myPieces,
    required this.enemyPieces,
    required this.enemyCloaked,
    required this.winner,
    required this.playerSide,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    Color backgroundColor;
    Color borderColor;
    Color textColor;

    if (isWon) {
      backgroundColor = winner == playerSide
          ? Colors.green.shade900.withOpacity(0.5)
          : Colors.red.shade900.withOpacity(0.5);
      borderColor = Colors.grey.shade700;
      textColor = Colors.grey.shade500;
    } else if (isValid) {
      backgroundColor = Colors.amber.shade900.withOpacity(0.3);
      borderColor = Colors.amber.shade400;
      textColor = Colors.white;
    } else {
      backgroundColor = Colors.grey.shade900;
      borderColor = Colors.grey.shade700;
      textColor = Colors.grey.shade600;
    }

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 60,
        height: 80,
        decoration: BoxDecoration(
          color: backgroundColor,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: borderColor, width: 2),
          boxShadow: isValid
              ? [
                  BoxShadow(
                    color: Colors.amber.withOpacity(0.3),
                    blurRadius: 8,
                    spreadRadius: 1,
                  )
                ]
              : null,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'Lane ${laneIndex + 1}',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.bold,
                color: textColor,
              ),
            ),
            const SizedBox(height: 4),
            if (isWon)
              Icon(
                winner == playerSide ? Icons.check_circle : Icons.cancel,
                color: winner == playerSide ? Colors.green : Colors.red,
                size: 24,
              )
            else ...[
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.person, size: 12, color: Colors.green.shade400),
                  const SizedBox(width: 2),
                  Text(
                    '$myPieces',
                    style: TextStyle(fontSize: 12, color: textColor),
                  ),
                ],
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.person, size: 12, color: Colors.red.shade400),
                  const SizedBox(width: 2),
                  Text(
                    enemyCloaked ? '?' : '$enemyPieces',
                    style: TextStyle(fontSize: 12, color: textColor),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Helper to get valid lanes for a perk
class LaneValidator {
  static List<int> getValidLanesForPerk(
    int perkId,
    CombatGameState gameState,
    PlayerSide playerSide, {
    int? firstSelectedLane,
  }) {
    final opponent = playerSide == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;
    final validLanes = <int>[];

    for (int i = 0; i < 5; i++) {
      final lane = gameState.lanes[i];
      if (lane.winner != null) continue;

      switch (perkId) {
        case 1: // PlaceAnother - your lane not full
          if (!lane.isSideFilled(playerSide)) {
            validLanes.add(i);
          }
          break;
        case 2: // RemoveEnemy - enemy has pieces
        case 36: // Disperse - enemy pieces exist
          // Cloak hides enemy positions - can't target what you can't see
          if (gameState.isCloaked(opponent)) break;
          if (lane.countPieces(opponent) > 0) {
            validLanes.add(i);
          }
          break;
        case 4: // Freeze - any non-won lane
          validLanes.add(i);
          break;
        case 31: // Split - your piece exists
        case 32: // Kamikaze - your piece exists
        case 35: // Scatter - your pieces exist
          if (lane.countPieces(playerSide) > 0) {
            validLanes.add(i);
          }
          break;
        case 33: // Regroup - swap your pieces between 2 lanes
          // For first selection, any non-won lane with your pieces
          // For second selection, any non-won lane except the first
          if (firstSelectedLane == null) {
            if (lane.countPieces(playerSide) > 0) {
              validLanes.add(i);
            }
          } else {
            if (i != firstSelectedLane) {
              validLanes.add(i);
            }
          }
          break;
        case 34: // Disrupt - swap enemy pieces between 2 lanes
          // Cloak hides enemy positions - can't target what you can't see
          if (gameState.isCloaked(opponent)) break;
          // For first selection, any non-won lane with enemy pieces
          // For second selection, any non-won lane with enemy pieces except the first
          // (per Python simulation: both lanes must have enemy pieces)
          if (firstSelectedLane == null) {
            if (lane.countPieces(opponent) > 0) {
              validLanes.add(i);
            }
          } else {
            if (i != firstSelectedLane && lane.countPieces(opponent) > 0) {
              validLanes.add(i);
            }
          }
          break;
        default:
          // Default: any non-won lane
          validLanes.add(i);
      }
    }

    return validLanes;
  }

  static bool perkRequiresTarget(int perkId) {
    return PerkDefinitions.getPerk(perkId)?.requiresTarget ?? true;
  }
}
