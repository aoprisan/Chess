import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import '../models/combat_state.dart';
import '../models/hero.dart';
import '../widgets/perk_card.dart';
import 'websocket_service.dart';

/// Enable deterministic perk pairing for testing.
/// Set to false for production random perk selection.
const bool _testModePerks = true;

/// Fixed perk pair index for testing. Change this value and restart to test a different pair.
const int _testPerkPairIndex = 1;

/// Slot 3 pool: React & Protect (15 perks, matching server Slot3Pool order)
const List<int> _slot3Pool = [4, 22, 24, 25, 26, 27, 28, 29, 30, 46, 33, 35, 43, 49, 52];

/// Slot 4 pool: Act & Disrupt (15 perks, matching server Slot4Pool order)
const List<int> _slot4Pool = [13, 23, 31, 32, 34, 36, 37, 38, 39, 40, 41, 42, 50, 51, 48];

/// Perk slot offered during perk selection phase
class PerkSlot {
  final int slotIndex;
  final int perkId;
  final String perkName;

  PerkSlot({
    required this.slotIndex,
    required this.perkId,
    required this.perkName,
  });

  factory PerkSlot.fromJson(Map<String, dynamic> json) {
    return PerkSlot(
      slotIndex: json['slotIndex'] as int,
      perkId: json['perkId'] as int,
      perkName: json['perkName'] as String,
    );
  }
}

/// Service for managing combat game state
class CombatService extends ChangeNotifier {
  CombatGameState? _gameState;
  final Random _random = Random();

  // V2: Server-driven state
  WebSocketService? _wsService;
  StreamSubscription<WSMessage>? _wsSubscription;
  String? _gameId;
  PlayerSide? _mySide;
  List<PerkSlot> _currentPerkSlots = [];
  int? _lastAutoPlacedLane;
  String? _lastError;
  bool _isServerDriven = false;

  bool _isAutoPlacing = false;

  // Getters
  CombatGameState? get gameState => _gameState;
  bool get isGameOver => _gameState?.isGameOver ?? false;
  String? get gameId => _gameId;
  PlayerSide? get mySide => _mySide;
  List<PerkSlot> get currentPerkSlots => _currentPerkSlots;
  int? get lastAutoPlacedLane => _lastAutoPlacedLane;
  String? get lastError => _lastError;
  bool get isServerDriven => _isServerDriven;
  bool get isMyTurn => _gameState?.currentPlayer == _mySide;

  /// Initialize a new combat game
  void initGame(String gameId, {Hero? player1Hero, Hero? player2Hero}) {
    _gameState = CombatGameState.initial(
      gameId,
      player1Hero: player1Hero,
      player2Hero: player2Hero,
    );
    _currentPerkSlots = generatePerkSlots();
    notifyListeners();
  }

  /// Generate perk slots: 2 fixed + 2 from pools (deterministic or random)
  List<PerkSlot> generatePerkSlots() {
    final slots = <PerkSlot>[
      PerkSlot(
        slotIndex: 0,
        perkId: 1,
        perkName: PerkDefinitions.getPerk(1)?.name ?? 'PlaceAnother',
      ),
      PerkSlot(
        slotIndex: 1,
        perkId: 2,
        perkName: PerkDefinitions.getPerk(2)?.name ?? 'RemoveEnemy',
      ),
    ];

    int slot3Id;
    int slot4Id;

    if (_testModePerks) {
      final idx = _testPerkPairIndex % _slot3Pool.length;
      slot3Id = _slot3Pool[idx];
      slot4Id = _slot4Pool[idx];
      debugPrint('[PERK TEST] Fixed pair index=$_testPerkPairIndex -> slot3=$slot3Id (${PerkDefinitions.getPerk(slot3Id)?.name}), slot4=$slot4Id (${PerkDefinitions.getPerk(slot4Id)?.name})');
    } else {
      slot3Id = _slot3Pool[_random.nextInt(_slot3Pool.length)];
      slot4Id = _slot4Pool[_random.nextInt(_slot4Pool.length)];
    }

    slots.add(PerkSlot(
      slotIndex: 2,
      perkId: slot3Id,
      perkName: PerkDefinitions.getPerk(slot3Id)?.name ?? 'Perk $slot3Id',
    ));
    slots.add(PerkSlot(
      slotIndex: 3,
      perkId: slot4Id,
      perkName: PerkDefinitions.getPerk(slot4Id)?.name ?? 'Perk $slot4Id',
    ));

    return slots;
  }

  /// Execute auto-placement for current player
  /// Returns the lane index where piece was placed, or -1 if no placement possible
  int autoPlace() {
    if (_isAutoPlacing) return -1;
    _isAutoPlacing = true;
    try {
      return _autoPlaceInternal();
    } finally {
      _isAutoPlacing = false;
    }
  }

  int _autoPlaceInternal() {
    if (_gameState == null) return -1;
    if (_gameState!.status != CombatStatus.playing) return -1;

    final currentPlayer = _gameState!.currentPlayer;
    final remainingPieces = _gameState!.getRemainingPieces(currentPlayer);

    if (remainingPieces <= 0) {
      // No pieces left to place
      return -1;
    }

    // Find lanes that are not yet won and have space
    final availableLanes = <int>[];
    for (int i = 0; i < 5; i++) {
      final lane = _gameState!.lanes[i];
      if (lane.winner == null && lane.getNextEmptyColumn(currentPlayer) != -1) {
        availableLanes.add(i);
      }
    }

    if (availableLanes.isEmpty) {
      // No available lanes
      return -1;
    }

    // Pick a random lane
    final laneIndex = availableLanes[_random.nextInt(availableLanes.length)];

    // Place the piece
    _placePiece(laneIndex, currentPlayer);

    return laneIndex;
  }

  /// Place a piece on the specified lane for the current player.
  /// Returns true if placement succeeded, false otherwise.
  bool placeOnLane(int laneIndex) {
    if (_gameState == null) return false;
    if (_gameState!.status != CombatStatus.playing) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final remainingPieces = _gameState!.getRemainingPieces(currentPlayer);
    if (remainingPieces <= 0) return false;

    final lane = _gameState!.lanes[laneIndex];
    if (lane.winner != null) return false;
    if (lane.getNextEmptyColumn(currentPlayer) == -1) return false;

    _placePiece(laneIndex, currentPlayer);
    return true;
  }

  /// Remove an enemy piece from the specified lane.
  /// Returns true if removal succeeded, false otherwise.
  bool removeEnemyPiece(int laneIndex) {
    if (_gameState == null) return false;
    if (_gameState!.status != CombatStatus.playing) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final enemy = currentPlayer == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;

    final lane = _gameState!.lanes[laneIndex];
    if (lane.winner != null) return false;
    if (lane.countPieces(enemy) == 0) return false;

    // Find the last (frontmost) enemy piece and remove it
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    final targetLane = lanes[laneIndex];

    if (enemy == PlayerSide.player1) {
      final newColumns = List<bool>.from(targetLane.player1Columns);
      // Remove the frontmost piece (highest index that is true)
      for (int i = 4; i >= 0; i--) {
        if (newColumns[i]) {
          newColumns[i] = false;
          break;
        }
      }
      lanes[laneIndex] = targetLane.copyWith(player1Columns: newColumns);
    } else {
      final newColumns = List<bool>.from(targetLane.player2Columns);
      // Remove the frontmost piece (highest index that is true)
      for (int i = 4; i >= 0; i--) {
        if (newColumns[i]) {
          newColumns[i] = false;
          break;
        }
      }
      lanes[laneIndex] = targetLane.copyWith(player2Columns: newColumns);
    }

    _gameState = _gameState!.copyWith(lanes: lanes);
    notifyListeners();
    return true;
  }

  /// Freeze a lane - blocks enemy placement for 1 turn
  bool freezeLane(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final newFrozenLanes = Map<int, PlayerSide>.from(_gameState!.frozenLanes);
    newFrozenLanes[laneIndex] = currentPlayer;

    _gameState = _gameState!.copyWith(frozenLanes: newFrozenLanes);
    notifyListeners();
    return true;
  }

  /// Scramble enemy pieces - redistribute all enemy pieces randomly
  bool scrambleEnemyPieces() {
    if (_gameState == null) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final enemy = currentPlayer == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;

    // Count total enemy pieces across all lanes
    int totalEnemyPieces = 0;
    for (final lane in _gameState!.lanes) {
      if (lane.winner == null) {
        totalEnemyPieces += lane.countPieces(enemy);
      }
    }

    if (totalEnemyPieces == 0) return false;

    // Clear all enemy pieces from non-won lanes
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    for (int i = 0; i < 5; i++) {
      if (lanes[i].winner == null) {
        if (enemy == PlayerSide.player1) {
          lanes[i] = lanes[i].copyWith(
            player1Columns: List<bool>.filled(5, false),
          );
        } else {
          lanes[i] = lanes[i].copyWith(
            player2Columns: List<bool>.filled(5, false),
          );
        }
      }
    }

    // Redistribute pieces randomly
    final availableLanes = <int>[];
    for (int i = 0; i < 5; i++) {
      if (lanes[i].winner == null) {
        availableLanes.add(i);
      }
    }

    for (int p = 0; p < totalEnemyPieces && availableLanes.isNotEmpty; p++) {
      final laneIdx = availableLanes[_random.nextInt(availableLanes.length)];
      final lane = lanes[laneIdx];
      final col = lane.getNextEmptyColumn(enemy);
      if (col != -1) {
        if (enemy == PlayerSide.player1) {
          final newCols = List<bool>.from(lane.player1Columns);
          newCols[col] = true;
          lanes[laneIdx] = lane.copyWith(player1Columns: newCols);
        } else {
          final newCols = List<bool>.from(lane.player2Columns);
          newCols[col] = true;
          lanes[laneIdx] = lane.copyWith(player2Columns: newCols);
        }
        // Remove lane if full
        if (lanes[laneIdx].isSideFilled(enemy)) {
          availableLanes.remove(laneIdx);
        }
      }
    }

    _gameState = _gameState!.copyWith(lanes: lanes);
    notifyListeners();
    return true;
  }

  /// Split - sacrifice 1 piece in a lane, gain 2 pieces elsewhere
  bool splitPiece(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final lane = _gameState!.lanes[laneIndex];
    if (lane.winner != null) return false;
    if (lane.countPieces(currentPlayer) == 0) return false;

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    // Remove 1 piece from the specified lane
    if (currentPlayer == PlayerSide.player1) {
      final newCols = List<bool>.from(lanes[laneIndex].player1Columns);
      for (int i = 4; i >= 0; i--) {
        if (newCols[i]) {
          newCols[i] = false;
          break;
        }
      }
      lanes[laneIndex] = lanes[laneIndex].copyWith(player1Columns: newCols);
    } else {
      final newCols = List<bool>.from(lanes[laneIndex].player2Columns);
      for (int i = 4; i >= 0; i--) {
        if (newCols[i]) {
          newCols[i] = false;
          break;
        }
      }
      lanes[laneIndex] = lanes[laneIndex].copyWith(player2Columns: newCols);
    }

    // Add 2 pieces to random lanes (source exclusion only if >= 3 lanes available)
    final otherLanes = <int>[];
    for (int i = 0; i < 5; i++) {
      if (lanes[i].winner == null && !lanes[i].isSideFilled(currentPlayer)) {
        otherLanes.add(i);
      }
    }
    // Apply source exclusion only if threshold (3) lanes available (per Python simulation)
    const sourceExclusionThreshold = 3;
    if (otherLanes.length >= sourceExclusionThreshold && otherLanes.contains(laneIndex)) {
      otherLanes.remove(laneIndex);
    }

    for (int p = 0; p < 2 && otherLanes.isNotEmpty; p++) {
      final idx = _random.nextInt(otherLanes.length);
      final targetLane = otherLanes[idx];
      final col = lanes[targetLane].getNextEmptyColumn(currentPlayer);
      if (col != -1) {
        if (currentPlayer == PlayerSide.player1) {
          final newCols = List<bool>.from(lanes[targetLane].player1Columns);
          newCols[col] = true;
          lanes[targetLane] = lanes[targetLane].copyWith(player1Columns: newCols);
        } else {
          final newCols = List<bool>.from(lanes[targetLane].player2Columns);
          newCols[col] = true;
          lanes[targetLane] = lanes[targetLane].copyWith(player2Columns: newCols);
        }
        if (lanes[targetLane].isSideFilled(currentPlayer)) {
          otherLanes.removeAt(idx);
        }
      }
    }

    _gameState = _gameState!.copyWith(lanes: lanes);
    _checkAllLaneWins();
    notifyListeners();
    return true;
  }

  /// Kamikaze - sacrifice 1 piece, enemy loses 2 from random lanes
  bool kamikazePiece(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final enemy = currentPlayer == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;
    final lane = _gameState!.lanes[laneIndex];
    if (lane.winner != null) return false;
    if (lane.countPieces(currentPlayer) == 0) return false;

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    // Remove 1 of your pieces
    if (currentPlayer == PlayerSide.player1) {
      final newCols = List<bool>.from(lanes[laneIndex].player1Columns);
      for (int i = 4; i >= 0; i--) {
        if (newCols[i]) {
          newCols[i] = false;
          break;
        }
      }
      lanes[laneIndex] = lanes[laneIndex].copyWith(player1Columns: newCols);
    } else {
      final newCols = List<bool>.from(lanes[laneIndex].player2Columns);
      for (int i = 4; i >= 0; i--) {
        if (newCols[i]) {
          newCols[i] = false;
          break;
        }
      }
      lanes[laneIndex] = lanes[laneIndex].copyWith(player2Columns: newCols);
    }

    // Remove up to 2 enemy pieces from random lanes (per Python simulation)
    for (int r = 0; r < 2; r++) {
      // Find lanes with enemy pieces
      final lanesWithEnemy = <int>[];
      for (int i = 0; i < 5; i++) {
        if (lanes[i].winner == null && lanes[i].countPieces(enemy) > 0) {
          lanesWithEnemy.add(i);
        }
      }
      if (lanesWithEnemy.isEmpty) break;

      // Pick a random lane with enemy pieces
      final targetLane = lanesWithEnemy[_random.nextInt(lanesWithEnemy.length)];

      if (enemy == PlayerSide.player1) {
        final newCols = List<bool>.from(lanes[targetLane].player1Columns);
        for (int i = 4; i >= 0; i--) {
          if (newCols[i]) {
            newCols[i] = false;
            break;
          }
        }
        lanes[targetLane] = lanes[targetLane].copyWith(player1Columns: newCols);
      } else {
        final newCols = List<bool>.from(lanes[targetLane].player2Columns);
        for (int i = 4; i >= 0; i--) {
          if (newCols[i]) {
            newCols[i] = false;
            break;
          }
        }
        lanes[targetLane] = lanes[targetLane].copyWith(player2Columns: newCols);
      }
    }

    _gameState = _gameState!.copyWith(lanes: lanes);
    notifyListeners();
    return true;
  }

  /// Regroup - swap your pieces between 2 lanes
  bool regroupPieces(int lane1, int lane2) {
    if (_gameState == null) return false;
    if (lane1 < 0 || lane1 >= 5 || lane2 < 0 || lane2 >= 5) return false;
    if (lane1 == lane2) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final l1 = _gameState!.lanes[lane1];
    final l2 = _gameState!.lanes[lane2];
    if (l1.winner != null || l2.winner != null) return false;

    // At least one lane must have player's pieces to swap (per Python simulation)
    if (l1.countPieces(currentPlayer) == 0 && l2.countPieces(currentPlayer) == 0) {
      return false;
    }

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    // Swap pieces
    if (currentPlayer == PlayerSide.player1) {
      final temp = List<bool>.from(lanes[lane1].player1Columns);
      lanes[lane1] = lanes[lane1].copyWith(player1Columns: List<bool>.from(lanes[lane2].player1Columns));
      lanes[lane2] = lanes[lane2].copyWith(player1Columns: temp);
    } else {
      final temp = List<bool>.from(lanes[lane1].player2Columns);
      lanes[lane1] = lanes[lane1].copyWith(player2Columns: List<bool>.from(lanes[lane2].player2Columns));
      lanes[lane2] = lanes[lane2].copyWith(player2Columns: temp);
    }

    _gameState = _gameState!.copyWith(lanes: lanes);
    _checkAllLaneWins();
    notifyListeners();
    return true;
  }

  /// Disrupt - swap enemy pieces between 2 lanes
  bool disruptEnemyPieces(int lane1, int lane2) {
    if (_gameState == null) return false;
    if (lane1 < 0 || lane1 >= 5 || lane2 < 0 || lane2 >= 5) return false;
    if (lane1 == lane2) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final enemy = currentPlayer == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;
    final l1 = _gameState!.lanes[lane1];
    final l2 = _gameState!.lanes[lane2];
    if (l1.winner != null || l2.winner != null) return false;

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    // Swap enemy pieces
    if (enemy == PlayerSide.player1) {
      final temp = List<bool>.from(lanes[lane1].player1Columns);
      lanes[lane1] = lanes[lane1].copyWith(player1Columns: List<bool>.from(lanes[lane2].player1Columns));
      lanes[lane2] = lanes[lane2].copyWith(player1Columns: temp);
    } else {
      final temp = List<bool>.from(lanes[lane1].player2Columns);
      lanes[lane1] = lanes[lane1].copyWith(player2Columns: List<bool>.from(lanes[lane2].player2Columns));
      lanes[lane2] = lanes[lane2].copyWith(player2Columns: temp);
    }

    _gameState = _gameState!.copyWith(lanes: lanes);
    _checkAllLaneWins();
    notifyListeners();
    return true;
  }

  /// Scatter - move your pieces from a lane to random other lanes
  bool scatterPieces(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final lane = _gameState!.lanes[laneIndex];
    if (lane.winner != null) return false;

    final pieceCount = lane.countPieces(currentPlayer);
    if (pieceCount == 0) return false;

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    // Clear pieces from source lane
    if (currentPlayer == PlayerSide.player1) {
      lanes[laneIndex] = lanes[laneIndex].copyWith(
        player1Columns: List<bool>.filled(5, false),
      );
    } else {
      lanes[laneIndex] = lanes[laneIndex].copyWith(
        player2Columns: List<bool>.filled(5, false),
      );
    }

    // Distribute to other random lanes
    final otherLanes = <int>[];
    for (int i = 0; i < 5; i++) {
      if (i != laneIndex && lanes[i].winner == null && !lanes[i].isSideFilled(currentPlayer)) {
        otherLanes.add(i);
      }
    }

    for (int p = 0; p < pieceCount && otherLanes.isNotEmpty; p++) {
      final idx = _random.nextInt(otherLanes.length);
      final targetLane = otherLanes[idx];
      final col = lanes[targetLane].getNextEmptyColumn(currentPlayer);
      if (col != -1) {
        if (currentPlayer == PlayerSide.player1) {
          final newCols = List<bool>.from(lanes[targetLane].player1Columns);
          newCols[col] = true;
          lanes[targetLane] = lanes[targetLane].copyWith(player1Columns: newCols);
        } else {
          final newCols = List<bool>.from(lanes[targetLane].player2Columns);
          newCols[col] = true;
          lanes[targetLane] = lanes[targetLane].copyWith(player2Columns: newCols);
        }
        if (lanes[targetLane].isSideFilled(currentPlayer)) {
          otherLanes.removeAt(idx);
        }
      }
    }

    _gameState = _gameState!.copyWith(lanes: lanes);
    _checkAllLaneWins();
    notifyListeners();
    return true;
  }

  /// Disperse - move enemy pieces from a lane to random other lanes
  bool disperseEnemyPieces(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final enemy = currentPlayer == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;
    final lane = _gameState!.lanes[laneIndex];
    if (lane.winner != null) return false;

    final pieceCount = lane.countPieces(enemy);
    if (pieceCount == 0) return false;

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    // Clear enemy pieces from source lane
    if (enemy == PlayerSide.player1) {
      lanes[laneIndex] = lanes[laneIndex].copyWith(
        player1Columns: List<bool>.filled(5, false),
      );
    } else {
      lanes[laneIndex] = lanes[laneIndex].copyWith(
        player2Columns: List<bool>.filled(5, false),
      );
    }

    // Distribute to other random lanes
    final otherLanes = <int>[];
    for (int i = 0; i < 5; i++) {
      if (i != laneIndex && lanes[i].winner == null && !lanes[i].isSideFilled(enemy)) {
        otherLanes.add(i);
      }
    }

    for (int p = 0; p < pieceCount && otherLanes.isNotEmpty; p++) {
      final idx = _random.nextInt(otherLanes.length);
      final targetLane = otherLanes[idx];
      final col = lanes[targetLane].getNextEmptyColumn(enemy);
      if (col != -1) {
        if (enemy == PlayerSide.player1) {
          final newCols = List<bool>.from(lanes[targetLane].player1Columns);
          newCols[col] = true;
          lanes[targetLane] = lanes[targetLane].copyWith(player1Columns: newCols);
        } else {
          final newCols = List<bool>.from(lanes[targetLane].player2Columns);
          newCols[col] = true;
          lanes[targetLane] = lanes[targetLane].copyWith(player2Columns: newCols);
        }
        if (lanes[targetLane].isSideFilled(enemy)) {
          otherLanes.removeAt(idx);
        }
      }
    }

    _gameState = _gameState!.copyWith(lanes: lanes);
    _checkAllLaneWins();
    notifyListeners();
    return true;
  }

  /// Steal - remove 1 enemy piece, add 1 to yourself (random lanes)
  bool stealPiece() {
    if (_gameState == null) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final enemy = currentPlayer == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;

    // Find lanes with enemy pieces
    final lanesWithEnemy = <int>[];
    for (int i = 0; i < 5; i++) {
      if (_gameState!.lanes[i].winner == null &&
          _gameState!.lanes[i].countPieces(enemy) > 0) {
        lanesWithEnemy.add(i);
      }
    }

    if (lanesWithEnemy.isEmpty) return false;

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    // Remove 1 enemy piece from random lane
    final removeLane = lanesWithEnemy[_random.nextInt(lanesWithEnemy.length)];
    if (enemy == PlayerSide.player1) {
      final newCols = List<bool>.from(lanes[removeLane].player1Columns);
      for (int i = 4; i >= 0; i--) {
        if (newCols[i]) {
          newCols[i] = false;
          break;
        }
      }
      lanes[removeLane] = lanes[removeLane].copyWith(player1Columns: newCols);
    } else {
      final newCols = List<bool>.from(lanes[removeLane].player2Columns);
      for (int i = 4; i >= 0; i--) {
        if (newCols[i]) {
          newCols[i] = false;
          break;
        }
      }
      lanes[removeLane] = lanes[removeLane].copyWith(player2Columns: newCols);
    }

    // Add 1 piece to yourself in a random lane
    final lanesForAdd = <int>[];
    for (int i = 0; i < 5; i++) {
      if (lanes[i].winner == null && !lanes[i].isSideFilled(currentPlayer)) {
        lanesForAdd.add(i);
      }
    }

    if (lanesForAdd.isNotEmpty) {
      final addLane = lanesForAdd[_random.nextInt(lanesForAdd.length)];
      final col = lanes[addLane].getNextEmptyColumn(currentPlayer);
      if (col != -1) {
        if (currentPlayer == PlayerSide.player1) {
          final newCols = List<bool>.from(lanes[addLane].player1Columns);
          newCols[col] = true;
          lanes[addLane] = lanes[addLane].copyWith(player1Columns: newCols);
        } else {
          final newCols = List<bool>.from(lanes[addLane].player2Columns);
          newCols[col] = true;
          lanes[addLane] = lanes[addLane].copyWith(player2Columns: newCols);
        }
      }
    }

    _gameState = _gameState!.copyWith(lanes: lanes);
    _checkAllLaneWins();
    notifyListeners();
    return true;
  }

  /// Cloak - hide your pieces from the opponent for 3 turns
  bool cloakField() {
    if (_gameState == null) return false;

    final currentPlayer = _gameState!.currentPlayer;
    if (currentPlayer == PlayerSide.player1) {
      _gameState = _gameState!.copyWith(player1Cloaked: 3);
    } else {
      _gameState = _gameState!.copyWith(player2Cloaked: 3);
    }

    notifyListeners();
    return true;
  }

  /// Blind - hide opponent's pieces from them for 2 turns
  bool blindOpponent() {
    if (_gameState == null) return false;
    final currentPlayer = _gameState!.currentPlayer;
    final opponent = currentPlayer == PlayerSide.player1
        ? PlayerSide.player2 : PlayerSide.player1;
    if (_gameState!.isBlinded(opponent)) return false; // already blinded
    if (opponent == PlayerSide.player1) {
      _gameState = _gameState!.copyWith(player1Blinded: 2);
    } else {
      _gameState = _gameState!.copyWith(player2Blinded: 2);
    }
    notifyListeners();
    return true;
  }

  /// Check all lanes for wins (used after perks that modify multiple lanes)
  void _checkAllLaneWins() {
    for (int i = 0; i < 5; i++) {
      _checkLaneWin(i);
    }
  }

  /// Place a piece in the specified lane for the specified player
  void _placePiece(int laneIndex, PlayerSide player) {
    if (_gameState == null) return;

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    final lane = lanes[laneIndex];
    final columnIndex = lane.getNextEmptyColumn(player);

    if (columnIndex == -1) return; // Lane is full

    // Update the lane
    if (player == PlayerSide.player1) {
      final newColumns = List<bool>.from(lane.player1Columns);
      newColumns[columnIndex] = true;
      lanes[laneIndex] = lane.copyWith(player1Columns: newColumns);
    } else {
      final newColumns = List<bool>.from(lane.player2Columns);
      newColumns[columnIndex] = true;
      lanes[laneIndex] = lane.copyWith(player2Columns: newColumns);
    }

    // Update piece count
    final newP1Pieces = player == PlayerSide.player1
        ? _gameState!.player1Pieces - 1
        : _gameState!.player1Pieces;
    final newP2Pieces = player == PlayerSide.player2
        ? _gameState!.player2Pieces - 1
        : _gameState!.player2Pieces;

    _gameState = _gameState!.copyWith(
      lanes: lanes,
      player1Pieces: newP1Pieces,
      player2Pieces: newP2Pieces,
      currentPhase: TurnPhase.perkSelection,
      lastAutoPlacedLane: laneIndex,
    );

    // Generate new perk slots for this perk selection phase
    _currentPerkSlots = generatePerkSlots();

    // Check for lane win
    _checkLaneWin(laneIndex);

    notifyListeners();
  }

  /// Check if a lane has been won
  void _checkLaneWin(int laneIndex) {
    if (_gameState == null) return;

    final lane = _gameState!.lanes[laneIndex];
    if (lane.winner != null) return; // Already won

    PlayerSide? winner;
    if (lane.isSideFilled(PlayerSide.player1)) {
      winner = PlayerSide.player1;
    } else if (lane.isSideFilled(PlayerSide.player2)) {
      winner = PlayerSide.player2;
    }

    if (winner != null) {
      final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
      lanes[laneIndex] = lane.copyWith(winner: winner);

      final newP1LanesWon = winner == PlayerSide.player1
          ? _gameState!.player1LanesWon + 1
          : _gameState!.player1LanesWon;
      final newP2LanesWon = winner == PlayerSide.player2
          ? _gameState!.player2LanesWon + 1
          : _gameState!.player2LanesWon;

      _gameState = _gameState!.copyWith(
        lanes: lanes,
        player1LanesWon: newP1LanesWon,
        player2LanesWon: newP2LanesWon,
      );

      // Check for game win
      _checkGameWin();
    }
  }

  /// Check if the game has been won
  void _checkGameWin() {
    if (_gameState == null) return;

    if (_gameState!.player1LanesWon >= 3) {
      _gameState = _gameState!.copyWith(
        status: CombatStatus.finished,
        gameWinner: PlayerSide.player1,
      );
    } else if (_gameState!.player2LanesWon >= 3) {
      _gameState = _gameState!.copyWith(
        status: CombatStatus.finished,
        gameWinner: PlayerSide.player2,
      );
    }

    notifyListeners();
  }

  /// End the current turn and switch to the other player
  void endTurn() {
    if (_gameState == null) return;
    if (_gameState!.status != CombatStatus.playing) return;

    final currentPlayer = _gameState!.currentPlayer;
    final nextPlayer = currentPlayer == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;

    // Clear frozen lanes that were blocking the current player
    // (they were set by the opponent and have now served their purpose)
    final newFrozenLanes = Map<int, PlayerSide>.from(_gameState!.frozenLanes);
    newFrozenLanes.removeWhere((_, frozenBy) => frozenBy != currentPlayer);

    // Decrement cloak counters
    final newP1Cloaked = _gameState!.player1Cloaked > 0
        ? _gameState!.player1Cloaked - 1
        : 0;
    final newP2Cloaked = _gameState!.player2Cloaked > 0
        ? _gameState!.player2Cloaked - 1
        : 0;

    // Decrement blind counters only for the player whose turn is ending
    final newP1Blinded = (currentPlayer == PlayerSide.player1 && _gameState!.player1Blinded > 0)
        ? _gameState!.player1Blinded - 1
        : _gameState!.player1Blinded;
    final newP2Blinded = (currentPlayer == PlayerSide.player2 && _gameState!.player2Blinded > 0)
        ? _gameState!.player2Blinded - 1
        : _gameState!.player2Blinded;

    _gameState = _gameState!.copyWith(
      currentPlayer: nextPlayer,
      currentPhase: TurnPhase.autoPlacement,
      lastAutoPlacedLane: null,
      frozenLanes: newFrozenLanes,
      player1Cloaked: newP1Cloaked,
      player2Cloaked: newP2Cloaked,
      player1Blinded: newP1Blinded,
      player2Blinded: newP2Blinded,
    );

    notifyListeners();
  }

  /// Skip the perk selection and end turn
  void skipTurn() {
    endTurn();
  }

  /// Execute a full turn (auto-place + skip to next player)
  /// Returns the lane index where piece was placed
  int executeTurn() {
    final laneIndex = autoPlace();
    // Don't auto-end turn - let player decide via UI
    return laneIndex;
  }

  /// Reset the game
  void resetGame() {
    _gameState = null;
    notifyListeners();
  }

  /// Get display name for a player
  String getPlayerName(PlayerSide side) {
    final hero = _gameState?.getHero(side);
    return hero?.name ?? (side == PlayerSide.player1 ? 'Player 1' : 'Player 2');
  }

  /// Get the current player's name
  String get currentPlayerName {
    if (_gameState == null) return '';
    return getPlayerName(_gameState!.currentPlayer);
  }

  // ============================================================================
  // V2 Server-Driven Methods
  // ============================================================================

  /// Initialize a server-driven V2 game
  void initServerDrivenGame(WebSocketService wsService) {
    _wsService = wsService;
    _isServerDriven = true;
    _lastError = null;

    // Listen to WebSocket messages
    _wsSubscription?.cancel();
    _wsSubscription = wsService.messages.listen(_handleServerMessage);
  }

  /// Join a V2 lane game
  void joinLaneGame(String playerId, String heroType, bool vsAI, String? aiDifficulty) {
    if (_wsService == null) {
      _lastError = 'WebSocket not connected';
      notifyListeners();
      return;
    }
    _wsService!.joinLaneGame(playerId, heroType, vsAI, aiDifficulty);
  }

  /// Select a perk during perk selection phase
  void selectPerk(int perkId, {int? targetLane}) {
    if (_wsService == null || _gameId == null) {
      _lastError = 'Not in a game';
      notifyListeners();
      return;
    }
    _wsService!.selectPerk(_gameId!, perkId, targetLane: targetLane);
  }

  /// Pass on perk selection
  void passPerkSelection() {
    selectPerk(0);
  }

  /// Handle incoming server messages
  void _handleServerMessage(WSMessage message) {
    switch (message.type) {
      case MessageType.laneMatchFound:
        _handleLaneMatchFound(message.payload);
        break;
      case MessageType.laneGameState:
        _handleLaneGameState(message.payload);
        break;
      case MessageType.autoPlacement:
        _handleAutoPlacement(message.payload);
        break;
      case MessageType.perkResult:
        _handlePerkResult(message.payload);
        break;
      case MessageType.laneWon:
        _handleLaneWon(message.payload);
        break;
      case MessageType.gameWon:
        _handleGameWon(message.payload);
        break;
      case MessageType.error:
        _handleError(message.payload);
        break;
      default:
        break;
    }
  }

  void _handleLaneMatchFound(Map<String, dynamic> payload) {
    _gameId = payload['gameId'] as String;
    final sideStr = payload['side'] as String;
    _mySide = sideStr == 'player1' ? PlayerSide.player1 : PlayerSide.player2;
    notifyListeners();
  }

  void _handleLaneGameState(Map<String, dynamic> payload) {
    final gameData = payload['game'] as Map<String, dynamic>;
    _updateGameStateFromServer(gameData);
    notifyListeners();
  }

  void _handleAutoPlacement(Map<String, dynamic> payload) {
    _lastAutoPlacedLane = payload['laneIndex'] as int;
    notifyListeners();
  }

  void _handlePerkResult(Map<String, dynamic> payload) {
    final success = payload['success'] as bool;
    if (!success) {
      _lastError = payload['error'] as String?;
    } else {
      _lastError = null;
    }
    notifyListeners();
  }

  void _handleLaneWon(Map<String, dynamic> payload) {
    // Lane won notification - state will be updated via laneGameState
    notifyListeners();
  }

  void _handleGameWon(Map<String, dynamic> payload) {
    // Game won notification - state will be updated via laneGameState
    notifyListeners();
  }

  void _handleError(Map<String, dynamic> payload) {
    _lastError = payload['message'] as String?;
    notifyListeners();
  }

  /// Update local game state from server data
  void _updateGameStateFromServer(Map<String, dynamic> gameData) {
    _gameId = gameData['id'] as String;

    // Parse lanes
    final lanesData = gameData['lanes'] as List<dynamic>;
    final lanes = <Lane>[];
    for (final laneData in lanesData) {
      final p1Slots = (laneData['player1Slots'] as List<dynamic>).cast<bool>();
      final p2Slots = (laneData['player2Slots'] as List<dynamic>).cast<bool>();
      final winnerVal = laneData['winner'] as int?;
      PlayerSide? winner;
      if (winnerVal == 1) winner = PlayerSide.player1;
      if (winnerVal == 2) winner = PlayerSide.player2;

      // Parse triggers
      final triggersData = laneData['triggers'] as List<dynamic>?;
      final triggers = triggersData
          ?.map((t) => TriggerData.fromJson(t as Map<String, dynamic>))
          .toList() ?? [];

      // Parse deferred effects
      final deferredData = laneData['deferred'] as List<dynamic>?;
      final deferred = deferredData
          ?.map((d) => DeferredData.fromJson(d as Map<String, dynamic>))
          .toList() ?? [];

      lanes.add(Lane(
        player1Columns: p1Slots,
        player2Columns: p2Slots,
        winner: winner,
        triggers: triggers,
        deferred: deferred,
      ));
    }

    // Parse current player
    final currentPlayerVal = gameData['currentPlayer'] as int;
    final currentPlayer = currentPlayerVal == 1 ? PlayerSide.player1 : PlayerSide.player2;

    // Parse phase
    final phaseStr = gameData['currentPhase'] as String;
    TurnPhase phase;
    switch (phaseStr) {
      case 'deferredResolution':
        phase = TurnPhase.deferredResolution;
        break;
      case 'autoPlacement':
        phase = TurnPhase.autoPlacement;
        break;
      case 'perkSelection':
        phase = TurnPhase.perkSelection;
        break;
      default:
        phase = TurnPhase.autoPlacement;
    }

    // Parse status
    final statusStr = gameData['status'] as String;
    CombatStatus status;
    switch (statusStr) {
      case 'setup':
        status = CombatStatus.setup;
        break;
      case 'playing':
        status = CombatStatus.playing;
        break;
      case 'finished':
        status = CombatStatus.finished;
        break;
      default:
        status = CombatStatus.playing;
    }

    // Parse winner
    final winnerVal = gameData['winner'] as int?;
    PlayerSide? gameWinner;
    if (winnerVal == 1) gameWinner = PlayerSide.player1;
    if (winnerVal == 2) gameWinner = PlayerSide.player2;

    // Parse perk slots
    final perkSlotsData = gameData['currentPerkSlots'] as List<dynamic>?;
    if (perkSlotsData != null) {
      _currentPerkSlots = perkSlotsData
          .map((slot) => PerkSlot.fromJson(slot as Map<String, dynamic>))
          .toList();
    }

    // Parse sanctuaries
    final p1SanctuariesData = gameData['player1Sanctuaries'] as List<dynamic>?;
    final p1Sanctuaries = p1SanctuariesData
        ?.map((s) => SanctuaryData.fromJson(s as Map<String, dynamic>))
        .toList() ?? [];
    final p2SanctuariesData = gameData['player2Sanctuaries'] as List<dynamic>?;
    final p2Sanctuaries = p2SanctuariesData
        ?.map((s) => SanctuaryData.fromJson(s as Map<String, dynamic>))
        .toList() ?? [];

    // Parse captures
    final p1CapturesData = gameData['player1Captures'] as List<dynamic>?;
    final p1Captures = p1CapturesData
        ?.map((c) => CaptureData.fromJson(c as Map<String, dynamic>))
        .toList() ?? [];
    final p2CapturesData = gameData['player2Captures'] as List<dynamic>?;
    final p2Captures = p2CapturesData
        ?.map((c) => CaptureData.fromJson(c as Map<String, dynamic>))
        .toList() ?? [];

    // Parse pending raids
    final pendingRaidsData = gameData['pendingRaids'] as List<dynamic>?;
    final pendingRaids = pendingRaidsData
        ?.map((r) => PendingRaidData.fromJson(r as Map<String, dynamic>))
        .toList() ?? [];

    _gameState = CombatGameState(
      gameId: _gameId!,
      lanes: lanes,
      currentPlayer: currentPlayer,
      currentPhase: phase,
      player1Pieces: 40, // V2 has unlimited pieces
      player2Pieces: 40,
      player1LanesWon: gameData['player1LanesWon'] as int? ?? 0,
      player2LanesWon: gameData['player2LanesWon'] as int? ?? 0,
      status: status,
      gameWinner: gameWinner,
      lastAutoPlacedLane: gameData['lastAutoPlacedLane'] as int?,
      player1Sanctuaries: p1Sanctuaries,
      player2Sanctuaries: p2Sanctuaries,
      player1Captures: p1Captures,
      player2Captures: p2Captures,
      pendingRaids: pendingRaids,
      player1Blinded: gameData['player1Blinded'] as int? ?? 0,
      player2Blinded: gameData['player2Blinded'] as int? ?? 0,
    );
  }

  /// Disconnect from server and clean up
  void disconnectFromServer() {
    _wsSubscription?.cancel();
    _wsSubscription = null;
    _wsService = null;
    _isServerDriven = false;
    _gameId = null;
    _mySide = null;
    _currentPerkSlots = [];
    _lastAutoPlacedLane = null;
    _lastError = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    super.dispose();
  }
}
