import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import '../models/combat_state.dart';
import '../models/hero.dart';
import '../widgets/perk_card.dart';
import '../widgets/lane_selector.dart';
import 'websocket_service.dart';

/// Enable deterministic perk pairing for testing.
/// Set to false for production random perk selection.
const bool _testModePerks = false;

/// Fixed perk pair index for testing. Change this value and restart to test a different pair.
const int _testPerkPairIndex = 0;

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
  int _nextTriggerOrder = 0;

  // V2: Server-driven state
  WebSocketService? _wsService;
  StreamSubscription<WSMessage>? _wsSubscription;
  String? _gameId;
  PlayerSide? _mySide;
  List<PerkSlot> _currentPerkSlots = [];
  int? _lastAutoPlacedLane;
  String? _lastError;
  bool _isServerDriven = false;

  // Online multiplayer state
  bool _isInQueue = false;
  String? _opponentUsername;
  String? _opponentHero;
  bool _opponentDisconnected = false;
  int? _turnDeadlineMs;
  int? _ratingChange;
  int? _newRating;

  bool _isAutoPlacing = false;

  // AI flags for local game mode
  bool _player1IsAI = false;
  bool _player2IsAI = false;
  String _player1AIDifficulty = 'medium';
  String _player2AIDifficulty = 'medium';

  // AI perk highlight: stores the perk ID the AI chose during its turn
  int? _lastAIPerkId;

  // Completed turns this game (local mode). Drives the fair-start rule:
  // player 1's opening turn is auto-placement only.
  int _turnCounter = 0;

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
  int? get lastAIPerkId => _lastAIPerkId;
  bool get isInQueue => _isInQueue;
  String? get opponentUsername => _opponentUsername;
  String? get opponentHero => _opponentHero;
  bool get opponentDisconnected => _opponentDisconnected;
  int? get turnDeadlineMs => _turnDeadlineMs;
  int? get ratingChange => _ratingChange;
  int? get newRating => _newRating;

  /// True before any turn has completed (local mode) — the fair-start turn
  bool get isOpeningTurn => _turnCounter == 0;

  /// Whether the current player is AI-controlled
  bool get isCurrentPlayerAI {
    if (_gameState == null) return false;
    return _gameState!.currentPlayer == PlayerSide.player1
        ? _player1IsAI
        : _player2IsAI;
  }

  /// Initialize a new combat game
  void initGame(String gameId, {Hero? player1Hero, Hero? player2Hero,
      bool player1IsAI = false, bool player2IsAI = false,
      String player1AIDifficulty = 'medium', String player2AIDifficulty = 'medium'}) {
    _player1IsAI = player1IsAI;
    _player2IsAI = player2IsAI;
    _player1AIDifficulty = player1AIDifficulty;
    _player2AIDifficulty = player2AIDifficulty;
    _turnCounter = 0;
    _gameState = CombatGameState.initial(
      gameId,
      player1Hero: player1Hero,
      player2Hero: player2Hero,
    );
    _currentPerkSlots = generatePerkSlots();
    notifyListeners();
  }

  /// Set the AI perk highlight for visual feedback
  void setAIPerkHighlight(int? perkId) {
    _lastAIPerkId = perkId;
    notifyListeners();
  }

  /// AI perk selection: returns (perkId, targetLane, secondLane).
  /// perkId=0 means pass. secondLane is non-null only for dual-lane perks.
  ///
  /// Difficulty ladder (mirrors the PWA, tuned via its simulate.ts):
  /// - easy:   30% pass, otherwise a random usable perk on a random lane
  /// - medium: best-scoring choice, but 25% of turns plays a random perk
  ///           instead (deliberate mistakes)
  /// - hard:   always the best-scoring choice
  (int, int, int?) chooseAIPerk() {
    if (_gameState == null) return (0, -1, null);
    final player = _gameState!.currentPlayer;
    final opponent = player == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;

    final difficulty = player == PlayerSide.player1
        ? _player1AIDifficulty
        : _player2AIDifficulty;
    final rng = _random;

    if (difficulty == 'easy') {
      if (rng.nextDouble() < 0.30) return (0, -1, null);
      return _randomAIChoice(player, opponent, rng);
    }

    if (difficulty == 'medium' && rng.nextDouble() < 0.25) {
      return _randomAIChoice(player, opponent, rng);
    }

    // Greedy: best-scoring (perk, lane) candidate; pass baseline is 0
    int bestPerkId = 0;
    int bestTarget = -1;
    int? bestSecondTarget;
    int bestScore = 0; // pass baseline

    for (final slot in _currentPerkSlots) {
      if (slot.perkId <= 0) continue;
      final perkDef = PerkDefinitions.getPerk(slot.perkId);
      if (perkDef == null) continue;

      // Dual-lane perks (Regroup/Disrupt)
      if (slot.perkId == 33 || slot.perkId == 34) {
        final result = _scoreDualLanePerk(slot.perkId, player, opponent);
        if (result.$1 > bestScore) {
          bestScore = result.$1;
          bestPerkId = slot.perkId;
          bestTarget = result.$2;
          bestSecondTarget = result.$3;
        }
        continue;
      }

      if (!perkDef.requiresTarget) {
        // Auto-target perks (Cloak, Blind, Scramble, Gambit, Steal)
        final score = _scoreAutoTargetPerk(slot.perkId, player, opponent);
        if (score > bestScore) {
          bestScore = score;
          bestPerkId = slot.perkId;
          bestTarget = -1;
          bestSecondTarget = null;
        }
      } else {
        // Targeted perks — evaluate each valid lane
        final validLanes = LaneValidator.getValidLanesForPerk(
            slot.perkId, _gameState!, player);
        for (final lane in validLanes) {
          final score = _scorePerkOnLane(slot.perkId, lane, player, opponent);
          if (score > bestScore) {
            bestScore = score;
            bestPerkId = slot.perkId;
            bestTarget = lane;
            bestSecondTarget = null;
          }
        }
      }
    }

    return (bestPerkId, bestTarget, bestSecondTarget);
  }

  /// Random usable perk on a random valid lane; falls back to pass.
  (int, int, int?) _randomAIChoice(PlayerSide player, PlayerSide opponent, Random rng) {
    final usable = _currentPerkSlots.where((s) => s.perkId > 0).toList()
      ..shuffle(rng);
    for (final slot in usable) {
      final perkDef = PerkDefinitions.getPerk(slot.perkId);
      if (perkDef == null) continue;
      if (slot.perkId == 33 || slot.perkId == 34) {
        final result = _scoreDualLanePerk(slot.perkId, player, opponent);
        if (result.$2 >= 0) return (slot.perkId, result.$2, result.$3);
        continue;
      }
      if (!perkDef.requiresTarget) return (slot.perkId, -1, null);
      final validLanes = LaneValidator.getValidLanesForPerk(
          slot.perkId, _gameState!, player);
      if (validLanes.isNotEmpty) {
        return (slot.perkId, validLanes[rng.nextInt(validLanes.length)], null);
      }
    }
    return (0, -1, null);
  }

  /// Total pieces for a side across lanes still in play
  int _totalPieces(PlayerSide side) {
    int total = 0;
    for (final lane in _gameState!.lanes) {
      if (lane.winner == null) total += lane.countPieces(side);
    }
    return total;
  }

  /// Largest single-lane piece count for a side across lanes still in play
  int _maxLanePieces(PlayerSide side) {
    int maxCount = 0;
    for (final lane in _gameState!.lanes) {
      if (lane.winner != null) continue;
      final n = lane.countPieces(side);
      if (n > maxCount) maxCount = n;
    }
    return maxCount;
  }

  /// Score a targeted perk on a specific lane.
  ///
  /// Scale (mirrors the PWA scorer): 100 = wins a lane this turn, 90 = blocks
  /// an imminent enemy lane win, 20-60 = strong tempo, <20 = filler.
  /// Match-deciding moves get a bonus so they always dominate.
  int _scorePerkOnLane(int perkId, int lane, PlayerSide player, PlayerSide opponent) {
    final laneState = _gameState!.lanes[lane];
    final myPieces = laneState.countPieces(player);
    final enemyPieces = laneState.countPieces(opponent);
    // Winning/blocking the 3rd lane decides the match — always take it.
    final winBonus = _gameState!.getLanesWon(player) == 2 ? 100 : 0;
    final blockBonus = _gameState!.getLanesWon(opponent) == 2 ? 60 : 0;

    switch (perkId) {
      case 1: // PlaceAnother: instant lane win at 4
        if (myPieces == 4) return 100 + winBonus;
        return 12 + myPieces * 6;
      case 2: // RemoveEnemy: block threats, don't spam
        if (enemyPieces >= 4) return 90 + blockBonus;
        if (enemyPieces == 3) return 32;
        return enemyPieces * 7;
      case 4: // Freeze: deny the enemy a whole turn on their threat lane
        if (enemyPieces >= 4) return 65 + blockBonus;
        if (enemyPieces == 3) return 22;
        return 6;
      case 31: // Split: net +1 spread out; never break up a near-win
        if (myPieces == 4) return 2;
        return 18;
      case 32: // Kamikaze: trade 1 for 2 random enemy pieces
        return (_totalPieces(opponent) >= 5 ? 20 : 12) - myPieces * 2;
      case 35: // Scatter: repositioning filler
        return 6;
      case 36: // Disperse: breaks up a stacked enemy lane
        if (enemyPieces >= 4) return 55 + blockBonus;
        if (enemyPieces == 3) return 18;
        return 4;
      case 39: // Rush: +2 me first => instant lane win from 3+; otherwise feeds the enemy
        if (myPieces == 4 || myPieces == 3) return 88 + winBonus;
        return max(2, 10 - enemyPieces * 2);
      case 48: // Nullify: only worth it against enemy-owned triggers on my lane
        {
          final myOwner = player == PlayerSide.player1 ? 1 : 2;
          final enemyTriggers =
              laneState.triggers.where((t) => t.owner != myOwner).length;
          return enemyTriggers > 0 ? 15 + enemyTriggers * 10 : 1;
        }
      case 24: // Portal: deny the enemy's winning placement on their stacked lane
      case 25: // Trap
        if (enemyPieces >= 4) return 45 + blockBonus;
        if (enemyPieces == 3) return 25;
        return 10;
      case 26: // Mirror: +2 for me when they place here — best where they must place
      case 27: // Echo
        return 14 + enemyPieces * 3;
      case 28: // Shockwave: they place here, lose 2 elsewhere
        return 12 + enemyPieces * 4;
      case 52: // Retaliate
        return 12 + enemyPieces * 3;
      case 29: // Hydra: protect my stacked lane from removal
      case 30: // Backfire
      case 46: // Absorb
        if (myPieces >= 4) return 30;
        if (myPieces == 3) return 20;
        return 8;
      case 43: // Signal: +1 now (+1 pulled next turn) — instant win at 4, setup at 3
        if (myPieces == 4) return 100 + winBonus;
        if (myPieces == 3) return 60 + winBonus;
        return 20;
      case 40: // Enlist: +1 now, capture next turn
        if (myPieces == 4) return 100 + winBonus;
        return 18 + myPieces * 2;
      case 41: // Ambush: +1 now, remove nearby enemy next turn
        if (myPieces == 4) return 100 + winBonus;
        return enemyPieces >= 3 ? 26 : 14;
      case 42: // Reinforce: +1 now +1 next turn — instant win at 4, near-win at 3
        if (myPieces == 4) return 100 + winBonus;
        if (myPieces == 3) return 60 + winBonus;
        return 16 + myPieces * 4;
      case 49: // Sanctuary: worth protecting a developed board
        return _totalPieces(player) >= 6 ? 18 : 8;
      case 50: // Capture: future removals land on my side
        return _totalPieces(opponent) >= 4 ? 20 : 10;
      case 51: // Raid
        return 14;
      default:
        return 10;
    }
  }

  /// Score an auto-target (no lane selection) perk
  int _scoreAutoTargetPerk(int perkId, PlayerSide player, PlayerSide opponent) {
    final blockBonus = _gameState!.getLanesWon(opponent) == 2 ? 60 : 0;
    switch (perkId) {
      case 13: // Scramble: resets the enemy's board shape
        {
          final maxEnemy = _maxLanePieces(opponent);
          if (maxEnemy >= 4) return 50 + blockBonus;
          if (maxEnemy == 3) return 20;
          return 4;
        }
      case 22: // Cloak: shields my stacked lanes from targeted removal
        return _maxLanePieces(player) >= 3 ? 25 : 8;
      case 23: // Blind
        return 12;
      case 37: // Gambit: 3-for-2 in the enemy's favor
        return 6;
      case 38: // Steal
        return 16;
      default:
        return 10;
    }
  }

  /// Score dual-lane perks (Regroup/Disrupt), returns (score, lane1, lane2)
  (int, int, int?) _scoreDualLanePerk(int perkId, PlayerSide player, PlayerSide opponent) {
    final firstLanes = LaneValidator.getValidLanesForPerk(
        perkId, _gameState!, player);
    if (firstLanes.isEmpty) return (0, -1, null);

    int bestScore = 0;
    int bestL1 = -1;
    int bestL2 = -1;

    for (final l1 in firstLanes) {
      final secondLanes = LaneValidator.getValidLanesForPerk(
          perkId, _gameState!, player, firstSelectedLane: l1);
      for (final l2 in secondLanes) {
        int score;
        if (perkId == 33) {
          // Regroup: mild repositioning value
          final myL1 = _gameState!.lanes[l1].countPieces(player);
          final myL2 = _gameState!.lanes[l2].countPieces(player);
          score = (myL1 - myL2).abs() * 3 + 3;
        } else {
          // Disrupt: drag a stacked enemy lane onto an empty one
          final eL1 = _gameState!.lanes[l1].countPieces(opponent);
          final eL2 = _gameState!.lanes[l2].countPieces(opponent);
          score = (eL1 - eL2).abs() * 4 + 3;
          if (max(eL1, eL2) >= 4) score += 25;
        }
        if (score > bestScore) {
          bestScore = score;
          bestL1 = l1;
          bestL2 = l2;
        }
      }
    }

    return (bestScore, bestL1, bestL2 == -1 ? null : bestL2);
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

    // Process pending raids, then deferred effects at turn start
    _processPendingRaids(currentPlayer);
    _processDeferredEffects(currentPlayer);
    _checkAllLaneWins();
    if (_gameState!.status != CombatStatus.playing) return -1;

    // Find lanes that are not yet won, have space, and are not frozen for current player
    final availableLanes = <int>[];
    for (int i = 0; i < 5; i++) {
      final lane = _gameState!.lanes[i];
      if (lane.winner == null &&
          lane.getNextEmptyColumn(currentPlayer) != -1 &&
          !_gameState!.isLaneFrozenFor(i, currentPlayer)) {
        availableLanes.add(i);
      }
    }

    if (availableLanes.isEmpty) {
      return -1;
    }

    // Pick a random lane
    final laneIndex = availableLanes[_random.nextInt(availableLanes.length)];

    // Place the piece
    _placePiece(laneIndex, currentPlayer);

    // Fire placement triggers after placing
    _firePlacementTriggers(laneIndex, currentPlayer, 0);
    _checkAllLaneWins();

    // Fair start: player 1's opening turn is auto-placement only, offsetting
    // the first-mover advantage (mirrors the server and PWA rule)
    if (!_isServerDriven &&
        _turnCounter == 0 &&
        currentPlayer == PlayerSide.player1 &&
        _gameState!.status == CombatStatus.playing) {
      endTurn();
      return laneIndex;
    }

    notifyListeners();

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
    _firePlacementTriggers(laneIndex, currentPlayer, 0);
    _checkAllLaneWins();
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

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    // Use redirect-aware removal
    _removePieceWithRedirects(lanes, laneIndex, enemy, remover: currentPlayer);

    _gameState = _gameState!.copyWith(lanes: lanes);

    // Fire removal triggers (owned by piece owner, triggered by remover)
    _fireRemovalTriggers(
      _gameState!.lanes.map((l) => l.copyWith()).toList(),
      laneIndex,
      currentPlayer,
    );

    _checkAllLaneWins();
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

    // Distribute to random lanes (source exclusion only if 3+ destinations available)
    final otherLanes = <int>[];
    for (int i = 0; i < 5; i++) {
      if (lanes[i].winner == null && !lanes[i].isSideFilled(currentPlayer)) {
        otherLanes.add(i);
      }
    }
    // Apply source exclusion only if threshold (3) lanes available
    const scatterSourceExclusionThreshold = 3;
    if (otherLanes.length >= scatterSourceExclusionThreshold && otherLanes.contains(laneIndex)) {
      otherLanes.remove(laneIndex);
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

    // Distribute to random lanes (source exclusion only if 3+ destinations available)
    final otherLanes = <int>[];
    for (int i = 0; i < 5; i++) {
      if (lanes[i].winner == null && !lanes[i].isSideFilled(enemy)) {
        otherLanes.add(i);
      }
    }
    // Apply source exclusion only if threshold (3) lanes available
    const disperseSourceExclusionThreshold = 3;
    if (otherLanes.length >= disperseSourceExclusionThreshold && otherLanes.contains(laneIndex)) {
      otherLanes.remove(laneIndex);
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

  /// Cloak - hide your pieces from the opponent for 2 turns
  bool cloakField() {
    if (_gameState == null) return false;

    final currentPlayer = _gameState!.currentPlayer;
    if (_gameState!.isCloaked(currentPlayer)) return false; // already cloaked

    if (currentPlayer == PlayerSide.player1) {
      _gameState = _gameState!.copyWith(player1Cloaked: 2);
    } else {
      _gameState = _gameState!.copyWith(player2Cloaked: 2);
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

  /// Gambit - give enemy 3 pieces on random lanes, gain 2 on one lane
  bool gambitPieces() {
    if (_gameState == null) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final enemy = currentPlayer == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    // Give opponent 3 pieces on random lanes (can repeat same lane)
    for (int i = 0; i < 3; i++) {
      final available = <int>[];
      for (int j = 0; j < 5; j++) {
        if (lanes[j].winner == null && !lanes[j].isSideFilled(enemy)) {
          available.add(j);
        }
      }
      if (available.isEmpty) break;
      final laneIdx = available[_random.nextInt(available.length)];
      final col = lanes[laneIdx].getNextEmptyColumn(enemy);
      if (col != -1) {
        if (enemy == PlayerSide.player1) {
          final newCols = List<bool>.from(lanes[laneIdx].player1Columns);
          newCols[col] = true;
          lanes[laneIdx] = lanes[laneIdx].copyWith(player1Columns: newCols);
        } else {
          final newCols = List<bool>.from(lanes[laneIdx].player2Columns);
          newCols[col] = true;
          lanes[laneIdx] = lanes[laneIdx].copyWith(player2Columns: newCols);
        }
      }
    }

    // Give player 2 pieces on the same randomly chosen lane
    final playerAvailable = <int>[];
    for (int j = 0; j < 5; j++) {
      if (lanes[j].winner == null && !lanes[j].isSideFilled(currentPlayer)) {
        playerAvailable.add(j);
      }
    }
    if (playerAvailable.isNotEmpty) {
      final playerLane = playerAvailable[_random.nextInt(playerAvailable.length)];
      for (int i = 0; i < 2; i++) {
        final col = lanes[playerLane].getNextEmptyColumn(currentPlayer);
        if (col == -1) break;
        if (lanes[playerLane].winner != null) break;
        if (currentPlayer == PlayerSide.player1) {
          final newCols = List<bool>.from(lanes[playerLane].player1Columns);
          newCols[col] = true;
          lanes[playerLane] = lanes[playerLane].copyWith(player1Columns: newCols);
        } else {
          final newCols = List<bool>.from(lanes[playerLane].player2Columns);
          newCols[col] = true;
          lanes[playerLane] = lanes[playerLane].copyWith(player2Columns: newCols);
        }
      }
    }

    _gameState = _gameState!.copyWith(lanes: lanes);
    _checkAllLaneWins();
    notifyListeners();
    return true;
  }

  /// Rush - both players get 2 pieces on a lane, you lose 1 from elsewhere
  bool rushLane(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final enemy = currentPlayer == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    bool laneWonDuringPlacement = false;

    // Add 2 pieces for player on target lane
    for (int i = 0; i < 2; i++) {
      if (lanes[laneIndex].winner != null) {
        laneWonDuringPlacement = true;
        break;
      }
      if (lanes[laneIndex].isSideFilled(currentPlayer)) break;
      final col = lanes[laneIndex].getNextEmptyColumn(currentPlayer);
      if (col == -1) break;
      if (currentPlayer == PlayerSide.player1) {
        final newCols = List<bool>.from(lanes[laneIndex].player1Columns);
        newCols[col] = true;
        lanes[laneIndex] = lanes[laneIndex].copyWith(player1Columns: newCols);
      } else {
        final newCols = List<bool>.from(lanes[laneIndex].player2Columns);
        newCols[col] = true;
        lanes[laneIndex] = lanes[laneIndex].copyWith(player2Columns: newCols);
      }
    }

    // Add 2 pieces for opponent on target lane
    for (int i = 0; i < 2; i++) {
      if (lanes[laneIndex].winner != null) {
        laneWonDuringPlacement = true;
        break;
      }
      if (lanes[laneIndex].isSideFilled(enemy)) break;
      final col = lanes[laneIndex].getNextEmptyColumn(enemy);
      if (col == -1) break;
      if (enemy == PlayerSide.player1) {
        final newCols = List<bool>.from(lanes[laneIndex].player1Columns);
        newCols[col] = true;
        lanes[laneIndex] = lanes[laneIndex].copyWith(player1Columns: newCols);
      } else {
        final newCols = List<bool>.from(lanes[laneIndex].player2Columns);
        newCols[col] = true;
        lanes[laneIndex] = lanes[laneIndex].copyWith(player2Columns: newCols);
      }
    }

    // Remove 1 piece from player's OTHER lanes (skip if lane won during placement)
    if (!laneWonDuringPlacement) {
      final otherLanes = <int>[];
      for (int i = 0; i < 5; i++) {
        if (i != laneIndex && lanes[i].winner == null &&
            lanes[i].countPieces(currentPlayer) > 0) {
          otherLanes.add(i);
        }
      }
      int? removeLane;
      if (otherLanes.isNotEmpty) {
        removeLane = otherLanes[_random.nextInt(otherLanes.length)];
      } else if (lanes[laneIndex].countPieces(currentPlayer) > 0) {
        removeLane = laneIndex;
      }
      if (removeLane != null) {
        if (currentPlayer == PlayerSide.player1) {
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
      }
    }

    _gameState = _gameState!.copyWith(lanes: lanes);
    _checkAllLaneWins();
    notifyListeners();
    return true;
  }

  /// Nullify - clear all triggers, deferred effects, and raids on a lane
  bool nullifyLane(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    // Clear triggers and deferred on the lane
    lanes[laneIndex] = lanes[laneIndex].copyWith(
      triggers: [],
      deferred: [],
    );

    // Cancel pending raids on this lane (raid piece stays as normal piece)
    final remainingRaids = _gameState!.pendingRaids
        .where((r) => r.lane != laneIndex)
        .toList();

    _gameState = _gameState!.copyWith(
      lanes: lanes,
      pendingRaids: remainingRaids,
    );
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

    _gameState = _gameState!.copyWith(
      lanes: lanes,
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

    // Decrement blind counters for both players each turn switch
    final newP1Blinded = _gameState!.player1Blinded > 0
        ? _gameState!.player1Blinded - 1
        : 0;
    final newP2Blinded = _gameState!.player2Blinded > 0
        ? _gameState!.player2Blinded - 1
        : 0;

    // Decrement trigger timers on each lane and remove expired
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    for (int i = 0; i < 5; i++) {
      if (lanes[i].winner != null) continue;
      final newTriggers = <TriggerData>[];
      for (final t in lanes[i].triggers) {
        final remaining = t.turnsLeft - 1;
        if (remaining > 0) {
          newTriggers.add(TriggerData(
            type: t.type,
            owner: t.owner,
            turnsLeft: remaining,
            orderId: t.orderId,
          ));
        }
      }
      lanes[i] = lanes[i].copyWith(triggers: newTriggers);
    }

    // Decrement sanctuary timers and remove expired
    final newP1Sanctuaries = <SanctuaryData>[];
    for (final s in _gameState!.player1Sanctuaries) {
      if (s.turnsLeft > 1) {
        newP1Sanctuaries.add(SanctuaryData(lane: s.lane, turnsLeft: s.turnsLeft - 1));
      }
    }
    final newP2Sanctuaries = <SanctuaryData>[];
    for (final s in _gameState!.player2Sanctuaries) {
      if (s.turnsLeft > 1) {
        newP2Sanctuaries.add(SanctuaryData(lane: s.lane, turnsLeft: s.turnsLeft - 1));
      }
    }

    // Decrement capture timers and remove expired
    final newP1Captures = <CaptureData>[];
    for (final c in _gameState!.player1Captures) {
      if (c.turnsLeft > 1) {
        newP1Captures.add(CaptureData(lane: c.lane, turnsLeft: c.turnsLeft - 1));
      }
    }
    final newP2Captures = <CaptureData>[];
    for (final c in _gameState!.player2Captures) {
      if (c.turnsLeft > 1) {
        newP2Captures.add(CaptureData(lane: c.lane, turnsLeft: c.turnsLeft - 1));
      }
    }

    // Decrement raid timers
    final newPendingRaids = <PendingRaidData>[];
    for (final r in _gameState!.pendingRaids) {
      newPendingRaids.add(PendingRaidData(
        owner: r.owner,
        lane: r.lane,
        turnsUntilResolve: r.turnsUntilResolve - 1,
        source: r.source,
      ));
    }

    _gameState = _gameState!.copyWith(
      lanes: lanes,
      currentPlayer: nextPlayer,
      currentPhase: TurnPhase.autoPlacement,
      lastAutoPlacedLane: null,
      frozenLanes: newFrozenLanes,
      player1Cloaked: newP1Cloaked,
      player2Cloaked: newP2Cloaked,
      player1Blinded: newP1Blinded,
      player2Blinded: newP2Blinded,
      player1Sanctuaries: newP1Sanctuaries,
      player2Sanctuaries: newP2Sanctuaries,
      player1Captures: newP1Captures,
      player2Captures: newP2Captures,
      pendingRaids: newPendingRaids,
    );

    _turnCounter++;

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
  // Trigger Setup Perks (add TriggerData to lane)
  // ============================================================================

  bool setPortalTrigger(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    final newTriggers = List<TriggerData>.from(lanes[laneIndex].triggers);
    final ownerInt = _gameState!.currentPlayer == PlayerSide.player1 ? 1 : 2;
    newTriggers.add(TriggerData(type: 'PORTAL', owner: ownerInt, turnsLeft: 2, orderId: _nextTriggerOrder++));
    lanes[laneIndex] = lanes[laneIndex].copyWith(triggers: newTriggers);
    _gameState = _gameState!.copyWith(lanes: lanes);
    notifyListeners();
    return true;
  }

  bool setTrapTrigger(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    final ownerInt = _gameState!.currentPlayer == PlayerSide.player1 ? 1 : 2;
    final newTriggers = List<TriggerData>.from(lanes[laneIndex].triggers);
    newTriggers.add(TriggerData(type: 'TRAP', owner: ownerInt, turnsLeft: 2, orderId: _nextTriggerOrder++));
    lanes[laneIndex] = lanes[laneIndex].copyWith(triggers: newTriggers);
    _gameState = _gameState!.copyWith(lanes: lanes);
    notifyListeners();
    return true;
  }

  bool setMirrorTrigger(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    final ownerInt = _gameState!.currentPlayer == PlayerSide.player1 ? 1 : 2;
    final newTriggers = List<TriggerData>.from(lanes[laneIndex].triggers);
    newTriggers.add(TriggerData(type: 'MIRROR', owner: ownerInt, turnsLeft: 2, orderId: _nextTriggerOrder++));
    lanes[laneIndex] = lanes[laneIndex].copyWith(triggers: newTriggers);
    _gameState = _gameState!.copyWith(lanes: lanes);
    notifyListeners();
    return true;
  }

  bool setEchoTrigger(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    final ownerInt = _gameState!.currentPlayer == PlayerSide.player1 ? 1 : 2;
    final newTriggers = List<TriggerData>.from(lanes[laneIndex].triggers);
    newTriggers.add(TriggerData(type: 'ECHO', owner: ownerInt, turnsLeft: 2, orderId: _nextTriggerOrder++));
    lanes[laneIndex] = lanes[laneIndex].copyWith(triggers: newTriggers);
    _gameState = _gameState!.copyWith(lanes: lanes);
    notifyListeners();
    return true;
  }

  bool setShockwaveTrigger(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    final ownerInt = _gameState!.currentPlayer == PlayerSide.player1 ? 1 : 2;
    final newTriggers = List<TriggerData>.from(lanes[laneIndex].triggers);
    newTriggers.add(TriggerData(type: 'SHOCKWAVE', owner: ownerInt, turnsLeft: 2, orderId: _nextTriggerOrder++));
    lanes[laneIndex] = lanes[laneIndex].copyWith(triggers: newTriggers);
    _gameState = _gameState!.copyWith(lanes: lanes);
    notifyListeners();
    return true;
  }

  bool setHydraTrigger(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    final ownerInt = _gameState!.currentPlayer == PlayerSide.player1 ? 1 : 2;
    final newTriggers = List<TriggerData>.from(lanes[laneIndex].triggers);
    newTriggers.add(TriggerData(type: 'HYDRA', owner: ownerInt, turnsLeft: 2, orderId: _nextTriggerOrder++));
    lanes[laneIndex] = lanes[laneIndex].copyWith(triggers: newTriggers);
    _gameState = _gameState!.copyWith(lanes: lanes);
    notifyListeners();
    return true;
  }

  bool setBackfireTrigger(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    final ownerInt = _gameState!.currentPlayer == PlayerSide.player1 ? 1 : 2;
    final newTriggers = List<TriggerData>.from(lanes[laneIndex].triggers);
    newTriggers.add(TriggerData(type: 'BACKFIRE', owner: ownerInt, turnsLeft: 2, orderId: _nextTriggerOrder++));
    lanes[laneIndex] = lanes[laneIndex].copyWith(triggers: newTriggers);
    _gameState = _gameState!.copyWith(lanes: lanes);
    notifyListeners();
    return true;
  }

  bool setAbsorbTrigger(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    final ownerInt = _gameState!.currentPlayer == PlayerSide.player1 ? 1 : 2;
    final newTriggers = List<TriggerData>.from(lanes[laneIndex].triggers);
    newTriggers.add(TriggerData(type: 'ABSORB', owner: ownerInt, turnsLeft: 2, orderId: _nextTriggerOrder++));
    lanes[laneIndex] = lanes[laneIndex].copyWith(triggers: newTriggers);
    _gameState = _gameState!.copyWith(lanes: lanes);
    notifyListeners();
    return true;
  }

  bool setRetaliateTrigger(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;
    // Server rule: you must have pieces on the lane you're defending
    if (_gameState!.lanes[laneIndex].countPieces(_gameState!.currentPlayer) == 0) {
      return false;
    }
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    final ownerInt = _gameState!.currentPlayer == PlayerSide.player1 ? 1 : 2;
    final newTriggers = List<TriggerData>.from(lanes[laneIndex].triggers);
    newTriggers.add(TriggerData(type: 'RETALIATE', owner: ownerInt, turnsLeft: 2, orderId: _nextTriggerOrder++));
    lanes[laneIndex] = lanes[laneIndex].copyWith(triggers: newTriggers);
    _gameState = _gameState!.copyWith(lanes: lanes);
    notifyListeners();
    return true;
  }

  // ============================================================================
  // Deferred Perks (+1 piece now, effect next turn)
  // ============================================================================

  bool signalLane(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    // Check space for immediate placement
    if (lanes[laneIndex].isSideFilled(currentPlayer)) return false;

    // Immediate: +1 piece
    _addPieceToLane(lanes, laneIndex, currentPlayer);

    // Add deferred effect
    final ownerInt = currentPlayer == PlayerSide.player1 ? 1 : 2;
    final newDeferred = List<DeferredData>.from(lanes[laneIndex].deferred);
    newDeferred.add(DeferredData(type: 'SIGNAL', owner: ownerInt, targetLane: laneIndex));
    lanes[laneIndex] = lanes[laneIndex].copyWith(deferred: newDeferred);

    _gameState = _gameState!.copyWith(lanes: lanes);
    _checkAllLaneWins();
    notifyListeners();
    return true;
  }

  bool enlistOnLane(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    if (lanes[laneIndex].isSideFilled(currentPlayer)) return false;

    // Immediate: +1 piece
    _addPieceToLane(lanes, laneIndex, currentPlayer);

    // Add deferred effect
    final ownerInt = currentPlayer == PlayerSide.player1 ? 1 : 2;
    final newDeferred = List<DeferredData>.from(lanes[laneIndex].deferred);
    newDeferred.add(DeferredData(type: 'ENLIST', owner: ownerInt, targetLane: laneIndex));
    lanes[laneIndex] = lanes[laneIndex].copyWith(deferred: newDeferred);

    _gameState = _gameState!.copyWith(lanes: lanes);
    _checkAllLaneWins();
    notifyListeners();
    return true;
  }

  bool ambushOnLane(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    if (lanes[laneIndex].isSideFilled(currentPlayer)) return false;

    // Immediate: +1 piece
    _addPieceToLane(lanes, laneIndex, currentPlayer);

    // Add deferred effect
    final ownerInt = currentPlayer == PlayerSide.player1 ? 1 : 2;
    final newDeferred = List<DeferredData>.from(lanes[laneIndex].deferred);
    newDeferred.add(DeferredData(type: 'AMBUSH', owner: ownerInt, targetLane: laneIndex));
    lanes[laneIndex] = lanes[laneIndex].copyWith(deferred: newDeferred);

    _gameState = _gameState!.copyWith(lanes: lanes);
    _checkAllLaneWins();
    notifyListeners();
    return true;
  }

  bool reinforceLane(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    if (lanes[laneIndex].isSideFilled(currentPlayer)) return false;

    // Immediate: +1 piece
    _addPieceToLane(lanes, laneIndex, currentPlayer);

    // Add deferred effect
    final ownerInt = currentPlayer == PlayerSide.player1 ? 1 : 2;
    final newDeferred = List<DeferredData>.from(lanes[laneIndex].deferred);
    newDeferred.add(DeferredData(type: 'REINFORCE', owner: ownerInt, targetLane: laneIndex));
    lanes[laneIndex] = lanes[laneIndex].copyWith(deferred: newDeferred);

    _gameState = _gameState!.copyWith(lanes: lanes);
    _checkAllLaneWins();
    notifyListeners();
    return true;
  }

  // ============================================================================
  // Duration Perks (Sanctuary, Capture)
  // ============================================================================

  bool setSanctuary(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;

    final currentPlayer = _gameState!.currentPlayer;
    if (currentPlayer == PlayerSide.player1) {
      final newSanctuaries = List<SanctuaryData>.from(_gameState!.player1Sanctuaries);
      newSanctuaries.add(SanctuaryData(lane: laneIndex, turnsLeft: 4));
      _gameState = _gameState!.copyWith(player1Sanctuaries: newSanctuaries);
    } else {
      final newSanctuaries = List<SanctuaryData>.from(_gameState!.player2Sanctuaries);
      newSanctuaries.add(SanctuaryData(lane: laneIndex, turnsLeft: 4));
      _gameState = _gameState!.copyWith(player2Sanctuaries: newSanctuaries);
    }
    notifyListeners();
    return true;
  }

  bool setCaptureZone(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;

    final currentPlayer = _gameState!.currentPlayer;
    if (currentPlayer == PlayerSide.player1) {
      final newCaptures = List<CaptureData>.from(_gameState!.player1Captures);
      newCaptures.add(CaptureData(lane: laneIndex, turnsLeft: 3));
      _gameState = _gameState!.copyWith(player1Captures: newCaptures);
    } else {
      final newCaptures = List<CaptureData>.from(_gameState!.player2Captures);
      newCaptures.add(CaptureData(lane: laneIndex, turnsLeft: 3));
      _gameState = _gameState!.copyWith(player2Captures: newCaptures);
    }
    notifyListeners();
    return true;
  }

  // ============================================================================
  // Raid Perk
  // ============================================================================

  bool raidLane(int laneIndex) {
    if (_gameState == null) return false;
    if (laneIndex < 0 || laneIndex >= 5) return false;
    if (_gameState!.lanes[laneIndex].winner != null) return false;

    final currentPlayer = _gameState!.currentPlayer;
    final opponent = currentPlayer == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;

    // Check if enemy side has space (raid piece occupies enemy slot)
    if (_gameState!.lanes[laneIndex].isSideFilled(opponent)) return false;

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    // Place piece on enemy's side (takes enemy slot)
    _addPieceToLane(lanes, laneIndex, opponent);

    // Track pending raid
    final ownerInt = currentPlayer == PlayerSide.player1 ? 1 : 2;
    final newPendingRaids = List<PendingRaidData>.from(_gameState!.pendingRaids);
    newPendingRaids.add(PendingRaidData(
      owner: ownerInt,
      lane: laneIndex,
      turnsUntilResolve: 2,
      source: 'RAID',
    ));

    _gameState = _gameState!.copyWith(lanes: lanes, pendingRaids: newPendingRaids);
    _checkAllLaneWins();
    notifyListeners();
    return true;
  }

  // ============================================================================
  // Infrastructure: Piece Helpers
  // ============================================================================

  /// Add a piece to a lane for a player (modifies lanes list in-place)
  void _addPieceToLane(List<Lane> lanes, int laneIndex, PlayerSide player) {
    final col = lanes[laneIndex].getNextEmptyColumn(player);
    if (col == -1) return;
    if (player == PlayerSide.player1) {
      final newCols = List<bool>.from(lanes[laneIndex].player1Columns);
      newCols[col] = true;
      lanes[laneIndex] = lanes[laneIndex].copyWith(player1Columns: newCols);
    } else {
      final newCols = List<bool>.from(lanes[laneIndex].player2Columns);
      newCols[col] = true;
      lanes[laneIndex] = lanes[laneIndex].copyWith(player2Columns: newCols);
    }
  }

  /// Remove the frontmost piece from a lane for a player (modifies lanes list in-place)
  void _removePieceFromLane(List<Lane> lanes, int laneIndex, PlayerSide player) {
    if (player == PlayerSide.player1) {
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
  }

  // ============================================================================
  // Infrastructure: Remove with Redirects
  // ============================================================================

  /// Remove a piece with Sanctuary/Capture redirection.
  /// Returns a map with 'removed', 'redirected', 'redirect_type', 'destination', 'converted'.
  Map<String, dynamic> _removePieceWithRedirects(
    List<Lane> lanes, int laneIndex, PlayerSide pieceOwner,
    {PlayerSide? remover}
  ) {
    if (lanes[laneIndex].countPieces(pieceOwner) <= 0) {
      return {'removed': false, 'redirected': false};
    }

    // Check Capture first (if remover is opponent and has active Capture)
    if (remover != null && remover != pieceOwner) {
      final captureLane = _getCaptureLane(remover);
      if (captureLane != null && lanes[captureLane].winner == null) {
        _removePieceFromLane(lanes, laneIndex, pieceOwner);
        _addPieceToLane(lanes, captureLane, remover);
        return {
          'removed': true, 'redirected': true, 'redirect_type': 'capture',
          'destination': captureLane, 'converted': true,
        };
      }
    }

    // Check Sanctuary (if piece owner has active Sanctuary)
    final sanctuaryLane = _getSanctuaryLane(pieceOwner);
    if (sanctuaryLane != null && lanes[sanctuaryLane].winner == null) {
      _removePieceFromLane(lanes, laneIndex, pieceOwner);
      _addPieceToLane(lanes, sanctuaryLane, pieceOwner);
      return {
        'removed': true, 'redirected': true, 'redirect_type': 'sanctuary',
        'destination': sanctuaryLane, 'converted': false,
      };
    }

    // Normal removal
    _removePieceFromLane(lanes, laneIndex, pieceOwner);
    return {'removed': true, 'redirected': false};
  }

  /// Get the first active sanctuary lane for a player
  int? _getSanctuaryLane(PlayerSide player) {
    final sanctuaries = player == PlayerSide.player1
        ? _gameState!.player1Sanctuaries
        : _gameState!.player2Sanctuaries;
    if (sanctuaries.isEmpty) return null;
    return sanctuaries.first.lane;
  }

  /// Get the first active capture lane for a player
  int? _getCaptureLane(PlayerSide player) {
    final captures = player == PlayerSide.player1
        ? _gameState!.player1Captures
        : _gameState!.player2Captures;
    if (captures.isEmpty) return null;
    return captures.first.lane;
  }

  // ============================================================================
  // Infrastructure: Trigger Firing
  // ============================================================================

  /// Fire placement triggers on a lane when a player places there.
  void _firePlacementTriggers(int laneIndex, PlayerSide placingPlayer, int chainDepth) {
    if (_gameState == null) return;
    if (chainDepth >= 10) return;

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    if (lanes[laneIndex].winner != null) return;

    final placingOwnerInt = placingPlayer == PlayerSide.player1 ? 1 : 2;
    final triggerOwner = placingPlayer == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;

    // Get placement triggers owned by opponent (sorted by orderId for FIFO)
    final triggers = List<TriggerData>.from(lanes[laneIndex].triggers)
        .where((t) => t.owner != placingOwnerInt)
        .where((t) => ['PORTAL', 'TRAP', 'MIRROR', 'ECHO', 'SHOCKWAVE', 'RETALIATE'].contains(t.type))
        .toList()
      ..sort((a, b) => a.orderId.compareTo(b.orderId));

    for (final trigger in triggers) {
      if (lanes[laneIndex].winner != null) break;
      if (_gameState!.status != CombatStatus.playing) break;

      // Remove trigger by orderId (one-time use)
      final updatedTriggers = List<TriggerData>.from(lanes[laneIndex].triggers)
          .where((t) => t.orderId != trigger.orderId)
          .toList();
      lanes[laneIndex] = lanes[laneIndex].copyWith(triggers: updatedTriggers);
      _gameState = _gameState!.copyWith(lanes: lanes);

      switch (trigger.type) {
        case 'PORTAL':
          _handlePortalTrigger(lanes, laneIndex, placingPlayer, chainDepth);
          break;
        case 'TRAP':
          _handleTrapTrigger(lanes, laneIndex, placingPlayer);
          break;
        case 'MIRROR':
          _handleMirrorTrigger(lanes, laneIndex, triggerOwner);
          break;
        case 'ECHO':
          _handleEchoTrigger(lanes, laneIndex, triggerOwner);
          break;
        case 'SHOCKWAVE':
          _handleShockwaveTrigger(lanes, laneIndex, placingPlayer, triggerOwner);
          break;
        case 'RETALIATE':
          _handleRetaliateTrigger(lanes, laneIndex, triggerOwner, placingPlayer);
          break;
      }

      _gameState = _gameState!.copyWith(lanes: lanes);
      _checkAllLaneWins();
    }
  }

  void _handlePortalTrigger(List<Lane> lanes, int laneIndex, PlayerSide placingPlayer, int chainDepth) {
    // Remove the piece that was just placed
    _removePieceFromLane(lanes, laneIndex, placingPlayer);

    // Find available lanes with source exclusion
    final available = <int>[];
    for (int i = 0; i < 5; i++) {
      if (lanes[i].winner == null && !lanes[i].isSideFilled(placingPlayer)) {
        available.add(i);
      }
    }
    if (available.length >= 3 && available.contains(laneIndex)) {
      available.remove(laneIndex);
    }

    if (available.isNotEmpty) {
      final dest = available[_random.nextInt(available.length)];
      _addPieceToLane(lanes, dest, placingPlayer);
      _gameState = _gameState!.copyWith(lanes: lanes);
      _checkLaneWin(dest);

      // Trigger chaining at destination
      if (_gameState!.lanes[dest].winner == null) {
        _firePlacementTriggers(dest, placingPlayer, chainDepth + 1);
      }
    }
  }

  void _handleTrapTrigger(List<Lane> lanes, int laneIndex, PlayerSide placingPlayer) {
    _removePieceWithRedirects(lanes, laneIndex, placingPlayer);
    _gameState = _gameState!.copyWith(lanes: lanes);
  }

  void _handleMirrorTrigger(List<Lane> lanes, int laneIndex, PlayerSide owner) {
    for (int i = 0; i < 2; i++) {
      if (!lanes[laneIndex].isSideFilled(owner)) {
        _addPieceToLane(lanes, laneIndex, owner);
      }
    }
    _gameState = _gameState!.copyWith(lanes: lanes);
  }

  void _handleEchoTrigger(List<Lane> lanes, int laneIndex, PlayerSide owner) {
    for (int i = 0; i < 2; i++) {
      final available = <int>[];
      for (int j = 0; j < 5; j++) {
        if (lanes[j].winner == null && !lanes[j].isSideFilled(owner)) {
          available.add(j);
        }
      }
      if (available.length >= 3 && available.contains(laneIndex)) {
        available.remove(laneIndex);
      }
      if (available.isNotEmpty) {
        final dest = available[_random.nextInt(available.length)];
        _addPieceToLane(lanes, dest, owner);
      }
    }
    _gameState = _gameState!.copyWith(lanes: lanes);
  }

  void _handleShockwaveTrigger(List<Lane> lanes, int laneIndex, PlayerSide placingPlayer, PlayerSide triggerOwner) {
    for (int i = 0; i < 2; i++) {
      final otherLanes = <int>[];
      for (int j = 0; j < 5; j++) {
        if (j != laneIndex && lanes[j].winner == null && lanes[j].countPieces(placingPlayer) > 0) {
          otherLanes.add(j);
        }
      }
      if (otherLanes.isNotEmpty) {
        final removeLane = otherLanes[_random.nextInt(otherLanes.length)];
        _removePieceWithRedirects(lanes, removeLane, placingPlayer, remover: triggerOwner);
      }
    }
    _gameState = _gameState!.copyWith(lanes: lanes);
  }

  void _handleRetaliateTrigger(List<Lane> lanes, int laneIndex, PlayerSide owner, PlayerSide opponent) {
    // Place raid piece on opponent's side
    if (lanes[laneIndex].isSideFilled(opponent)) return;

    _addPieceToLane(lanes, laneIndex, opponent);

    final ownerInt = owner == PlayerSide.player1 ? 1 : 2;
    final newPendingRaids = List<PendingRaidData>.from(_gameState!.pendingRaids);
    newPendingRaids.add(PendingRaidData(
      owner: ownerInt,
      lane: laneIndex,
      turnsUntilResolve: 2,
      source: 'RETALIATE',
    ));

    _gameState = _gameState!.copyWith(lanes: lanes, pendingRaids: newPendingRaids);
  }

  /// Fire removal triggers on a lane when a piece is removed.
  void _fireRemovalTriggers(List<Lane> lanes, int laneIndex, PlayerSide removingPlayer) {
    if (_gameState == null) return;
    if (lanes[laneIndex].winner != null) return;

    final removingOwnerInt = removingPlayer == PlayerSide.player1 ? 1 : 2;
    final pieceOwner = removingPlayer == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;

    // Get removal triggers owned by piece owner (sorted by orderId)
    final triggers = List<TriggerData>.from(lanes[laneIndex].triggers)
        .where((t) => t.owner != removingOwnerInt)
        .where((t) => ['HYDRA', 'BACKFIRE', 'ABSORB'].contains(t.type))
        .toList()
      ..sort((a, b) => a.orderId.compareTo(b.orderId));

    for (final trigger in triggers) {
      if (lanes[laneIndex].winner != null) break;
      if (_gameState!.status != CombatStatus.playing) break;

      // Remove trigger by orderId
      final updatedTriggers = List<TriggerData>.from(lanes[laneIndex].triggers)
          .where((t) => t.orderId != trigger.orderId)
          .toList();
      lanes[laneIndex] = lanes[laneIndex].copyWith(triggers: updatedTriggers);
      _gameState = _gameState!.copyWith(lanes: lanes);

      switch (trigger.type) {
        case 'HYDRA':
          _handleHydraTrigger(lanes, laneIndex, pieceOwner);
          break;
        case 'BACKFIRE':
          _handleBackfireTrigger(lanes, laneIndex, removingPlayer, pieceOwner);
          break;
        case 'ABSORB':
          _handleAbsorbTrigger(lanes, laneIndex, pieceOwner);
          break;
      }

      _gameState = _gameState!.copyWith(lanes: lanes);
      _checkAllLaneWins();
    }
  }

  void _handleHydraTrigger(List<Lane> lanes, int laneIndex, PlayerSide owner) {
    for (int i = 0; i < 2; i++) {
      final available = <int>[];
      for (int j = 0; j < 5; j++) {
        if (lanes[j].winner == null && !lanes[j].isSideFilled(owner)) {
          available.add(j);
        }
      }
      if (available.length >= 3 && available.contains(laneIndex)) {
        available.remove(laneIndex);
      }
      if (available.isNotEmpty) {
        final dest = available[_random.nextInt(available.length)];
        _addPieceToLane(lanes, dest, owner);
      }
    }
    _gameState = _gameState!.copyWith(lanes: lanes);
  }

  void _handleBackfireTrigger(List<Lane> lanes, int laneIndex, PlayerSide removingPlayer, PlayerSide triggerOwner) {
    for (int i = 0; i < 2; i++) {
      final lanesWithPieces = <int>[];
      for (int j = 0; j < 5; j++) {
        if (lanes[j].winner == null && lanes[j].countPieces(removingPlayer) > 0) {
          lanesWithPieces.add(j);
        }
      }
      if (lanesWithPieces.isNotEmpty) {
        final removeLane = lanesWithPieces[_random.nextInt(lanesWithPieces.length)];
        _removePieceWithRedirects(lanes, removeLane, removingPlayer, remover: triggerOwner);
      }
    }
    _gameState = _gameState!.copyWith(lanes: lanes);
  }

  void _handleAbsorbTrigger(List<Lane> lanes, int laneIndex, PlayerSide owner) {
    final available = <int>[];
    for (int i = 0; i < 5; i++) {
      if (lanes[i].winner == null && !lanes[i].isSideFilled(owner)) {
        available.add(i);
      }
    }
    if (available.length >= 3 && available.contains(laneIndex)) {
      available.remove(laneIndex);
    }
    if (available.isNotEmpty) {
      final dest = available[_random.nextInt(available.length)];
      _addPieceToLane(lanes, dest, owner);
    }
    _gameState = _gameState!.copyWith(lanes: lanes);
  }

  // ============================================================================
  // Infrastructure: Deferred + Raid Resolution
  // ============================================================================

  /// Process pending raids for a player at start of their turn
  void _processPendingRaids(PlayerSide player) {
    if (_gameState == null) return;

    final ownerInt = player == PlayerSide.player1 ? 1 : 2;
    final opponent = player == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;

    final readyRaids = _gameState!.pendingRaids
        .where((r) => r.owner == ownerInt && r.turnsUntilResolve <= 0)
        .toList();

    if (readyRaids.isEmpty) return;

    // Remove resolved raids from pending
    final remainingRaids = _gameState!.pendingRaids
        .where((r) => !(r.owner == ownerInt && r.turnsUntilResolve <= 0))
        .toList();

    _gameState = _gameState!.copyWith(pendingRaids: remainingRaids);

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    for (final raid in readyRaids) {
      final laneIdx = raid.lane;
      if (lanes[laneIdx].winner != null) continue;

      // Roll probability (0-99)
      final roll = _random.nextInt(100);

      if (roll < 10) {
        // 10% - Lost: Remove the raid piece from opponent's side
        if (lanes[laneIdx].countPieces(opponent) > 0) {
          _removePieceFromLane(lanes, laneIdx, opponent);
        }
      } else if (roll < 25) {
        // 15% - +2 recruits: Convert to player's piece + 2 more = 3 total
        if (lanes[laneIdx].countPieces(opponent) > 0) {
          _removePieceFromLane(lanes, laneIdx, opponent);
        }
        for (int i = 0; i < 3; i++) {
          if (!lanes[laneIdx].isSideFilled(player)) {
            _addPieceToLane(lanes, laneIdx, player);
          }
        }
      } else if (roll < 55) {
        // 30% - +1 recruit: Convert to player's piece + 1 more = 2 total
        if (lanes[laneIdx].countPieces(opponent) > 0) {
          _removePieceFromLane(lanes, laneIdx, opponent);
        }
        for (int i = 0; i < 2; i++) {
          if (!lanes[laneIdx].isSideFilled(player)) {
            _addPieceToLane(lanes, laneIdx, player);
          }
        }
      } else {
        // 45% - Alone: Just convert to player's piece
        if (lanes[laneIdx].countPieces(opponent) > 0) {
          _removePieceFromLane(lanes, laneIdx, opponent);
        }
        if (!lanes[laneIdx].isSideFilled(player)) {
          _addPieceToLane(lanes, laneIdx, player);
        }
      }
    }

    _gameState = _gameState!.copyWith(lanes: lanes);
  }

  /// Process deferred effects for a player at start of their turn
  void _processDeferredEffects(PlayerSide player) {
    if (_gameState == null) return;

    final ownerInt = player == PlayerSide.player1 ? 1 : 2;
    final opponent = player == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();

    for (int laneIdx = 0; laneIdx < 5; laneIdx++) {
      if (lanes[laneIdx].winner != null) continue;

      // Get and remove deferred effects for this player
      final effects = lanes[laneIdx].deferred
          .where((d) => d.owner == ownerInt)
          .toList();
      if (effects.isEmpty) continue;

      // Remove processed effects from lane
      final remainingDeferred = lanes[laneIdx].deferred
          .where((d) => d.owner != ownerInt)
          .toList();
      lanes[laneIdx] = lanes[laneIdx].copyWith(deferred: remainingDeferred);

      for (final effect in effects) {
        switch (effect.type) {
          case 'SIGNAL':
            // Pull 1 piece from MOST POPULATED lane (not this lane)
            final sourceLanes = <int>[];
            int maxPieces = 0;
            for (int i = 0; i < 5; i++) {
              if (i != laneIdx && lanes[i].winner == null && lanes[i].countPieces(player) > 0) {
                final count = lanes[i].countPieces(player);
                if (count > maxPieces) {
                  maxPieces = count;
                  sourceLanes.clear();
                  sourceLanes.add(i);
                } else if (count == maxPieces) {
                  sourceLanes.add(i);
                }
              }
            }
            if (sourceLanes.isNotEmpty && !lanes[laneIdx].isSideFilled(player)) {
              final source = sourceLanes[_random.nextInt(sourceLanes.length)];
              _removePieceFromLane(lanes, source, player);
              _addPieceToLane(lanes, laneIdx, player);
            }
            break;

          case 'ENLIST':
            // Move the immediate piece + captured enemy to LEAST POPULATED lane
            if (lanes[laneIdx].countPieces(player) <= 0) break;

            _removePieceFromLane(lanes, laneIdx, player);
            bool enemyCaptured = false;
            if (lanes[laneIdx].countPieces(opponent) > 0) {
              _removePieceFromLane(lanes, laneIdx, opponent);
              enemyCaptured = true;
            }

            // Find least populated lane for player (excluding current)
            final destLanes = <int>[];
            int minPieces = 999;
            for (int i = 0; i < 5; i++) {
              if (i != laneIdx && lanes[i].winner == null && !lanes[i].isSideFilled(player)) {
                final count = lanes[i].countPieces(player);
                if (count < minPieces) {
                  minPieces = count;
                  destLanes.clear();
                  destLanes.add(i);
                } else if (count == minPieces) {
                  destLanes.add(i);
                }
              }
            }
            // Fallback to current lane
            if (destLanes.isEmpty && lanes[laneIdx].winner == null && !lanes[laneIdx].isSideFilled(player)) {
              destLanes.add(laneIdx);
            }
            if (destLanes.isNotEmpty) {
              final dest = destLanes[_random.nextInt(destLanes.length)];
              final piecesToAdd = enemyCaptured ? 2 : 1;
              for (int i = 0; i < piecesToAdd; i++) {
                if (!lanes[dest].isSideFilled(player)) {
                  _addPieceToLane(lanes, dest, player);
                }
              }
            }
            break;

          case 'AMBUSH':
            // Remove enemy piece from lane X or adjacent (X-1, X+1)
            final targetLane = effect.targetLane;
            final adjacentLanes = <int>[targetLane];
            if (targetLane > 0) adjacentLanes.add(targetLane - 1);
            if (targetLane < 4) adjacentLanes.add(targetLane + 1);

            final validRemoval = adjacentLanes
                .where((i) => lanes[i].winner == null && lanes[i].countPieces(opponent) > 0)
                .toList();

            if (validRemoval.isNotEmpty) {
              final removeFrom = validRemoval[_random.nextInt(validRemoval.length)];
              _removePieceFromLane(lanes, removeFrom, opponent);
            }
            break;

          case 'REINFORCE':
            // Add 1 piece to same lane
            if (!lanes[laneIdx].isSideFilled(player)) {
              _addPieceToLane(lanes, laneIdx, player);
            }
            break;
        }
      }
    }

    _gameState = _gameState!.copyWith(lanes: lanes);
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
      case MessageType.queueStatus:
        _handleQueueStatus(message.payload);
        break;
      case MessageType.opponentDisconnected:
        _handleOpponentDisconnected(message.payload);
        break;
      case MessageType.turnTimer:
        _handleTurnTimer(message.payload);
        break;
      case MessageType.gameResult:
        _handleGameResult(message.payload);
        break;
      case MessageType.reconnect:
        _handleReconnect(message.payload);
        break;
      default:
        break;
    }
  }

  void _handleLaneMatchFound(Map<String, dynamic> payload) {
    _gameId = payload['gameId'] as String;
    final sideStr = payload['side'] as String;
    _mySide = sideStr == 'player1' ? PlayerSide.player1 : PlayerSide.player2;
    _opponentUsername = payload['opponentUsername'] as String?;
    _opponentHero = payload['opponentHero'] as String?;
    _isInQueue = false;
    notifyListeners();
  }

  void _handleLaneGameState(Map<String, dynamic> payload) {
    final gameData = payload['game'] as Map<String, dynamic>;
    _updateGameStateFromServer(gameData);
    // Clear AI perk highlight when it becomes our turn
    if (isMyTurn) {
      _lastAIPerkId = null;
    }
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
    // Store AI's perk choice for highlight display
    if (success && !isMyTurn) {
      final perkId = payload['perkId'];
      if (perkId is num && perkId > 0) {
        _lastAIPerkId = perkId.toInt();
      }
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

  void _handleQueueStatus(Map<String, dynamic> payload) {
    final status = payload['status'] as String?;
    if (status == 'queued') {
      _isInQueue = true;
    } else if (status == 'reconnected') {
      _opponentDisconnected = false;
    }
    notifyListeners();
  }

  void _handleOpponentDisconnected(Map<String, dynamic> payload) {
    _opponentDisconnected = true;
    _turnDeadlineMs = null; // Pause turn timer during disconnect
    notifyListeners();
  }

  void _handleTurnTimer(Map<String, dynamic> payload) {
    _turnDeadlineMs = (payload['deadline'] as num?)?.toInt();
    notifyListeners();
  }

  void _handleGameResult(Map<String, dynamic> payload) {
    final mySideStr = _mySide == PlayerSide.player1 ? 'player1' : 'player2';
    _ratingChange = payload['${mySideStr}RatingChange'] as int?;
    _newRating = payload['${mySideStr}NewRating'] as int?;
    notifyListeners();
  }

  void _handleReconnect(Map<String, dynamic> payload) {
    _gameId = payload['gameId'] as String;
    final sideStr = payload['side'] as String;
    _mySide = sideStr == 'player1' ? PlayerSide.player1 : PlayerSide.player2;
    _opponentDisconnected = false;

    // Restore game state from payload
    final gameData = payload['game'] as Map<String, dynamic>?;
    if (gameData != null) {
      _updateGameStateFromServer(gameData);
    }
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
    _isInQueue = false;
    _opponentUsername = null;
    _opponentHero = null;
    _opponentDisconnected = false;
    _turnDeadlineMs = null;
    _ratingChange = null;
    _newRating = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    super.dispose();
  }
}
